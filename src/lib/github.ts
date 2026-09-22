import type { RawPrNode } from './enrichment'
import { toProject, type RawProject, type RawProjectsNode } from './projects'
import { buildQuery, chunkSources } from './query'
import type {
    Actor,
    Comment,
    Item,
    ItemDetail,
    Label,
    Milestone,
    Project,
    RateLimit,
    RepoLabel,
    Source,
    StateFilter,
    Viewer
} from './types'

const API = 'https://api.github.com'
/** The Search API never returns more than 1000 results for one query. */
const SEARCH_CEILING = 1000
/** Required by the Search API: one of these qualifiers must be present. */
const ITEM_TYPES = ['is:issue', 'is:pull-request'] as const
const DAY = 86_400_000
/** GitHub launched in 2008: no item was created before. In days since the epoch. */
const FIRST_DAY = Math.floor(Date.UTC(2008, 0, 1) / DAY)
/** Owner repository lists change rarely; reuse them for a while. */
const REPO_LIST_TTL = 6 * 60 * 60_000

const PR_DETAILS_QUERY = `query($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on PullRequest {
      id
      isDraft
      reviewDecision
      mergeable
      commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
      reviewRequests(first: 20) { nodes { requestedReviewer { ... on User { login } } } }
    }
  }
}`

const PROJECT_ITEMS = `projectItems(first: 20) {
      nodes {
        id
        project { id title }
        fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
      }
    }`

const PROJECT_MEMBERSHIPS_QUERY = `query($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Issue { id ${PROJECT_ITEMS} }
    ... on PullRequest { id ${PROJECT_ITEMS} }
  }
}`

const PROJECT_FIELDS = `nodes {
        id title number url closed
        owner { ... on User { login } ... on Organization { login } }
        field(name: "Status") { ... on ProjectV2SingleSelectField { id options { id name } } }
      }`

const OWNER_PROJECTS_QUERY = `query($login: String!) {
  repositoryOwner(login: $login) {
    ... on User { projectsV2(first: 50, orderBy: { field: UPDATED_AT, direction: DESC }) { ${PROJECT_FIELDS} } }
    ... on Organization { projectsV2(first: 50, orderBy: { field: UPDATED_AT, direction: DESC }) { ${PROJECT_FIELDS} } }
  }
}`

function isoDay(day: number): string {
    return new Date(day * DAY).toISOString().slice(0, 10)
}

export class GitHubError extends Error {
    constructor(
        message: string,
        public readonly status: number,
        public readonly rateLimit: RateLimit | null = null
    ) {
        super(message)
        this.name = 'GitHubError'
    }
}

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

interface RawUser {
    login: string
    avatar_url: string
    html_url: string
    name?: string | null
    type?: string
}

interface RawSearchItem {
    id: number
    node_id: string
    number: number
    title: string
    html_url: string
    repository_url: string
    state: 'open' | 'closed'
    draft?: boolean
    pull_request?: unknown
    labels: Array<{ name: string; color: string; description?: string | null }>
    user: RawUser | null
    assignees: RawUser[] | null
    comments: number
    reactions?: { total_count: number }
    created_at: string
    updated_at: string
    milestone: { title: string } | null
}

interface RawRepo {
    full_name: string
    archived: boolean
    fork: boolean
    open_issues_count: number
}

interface RawSearch {
    total_count: number
    items: RawSearchItem[]
}

interface RawIssueHtml {
    body_html?: string | null
    state: 'open' | 'closed'
    labels: Array<{ name: string; color: string; description?: string | null }>
    assignees: RawUser[] | null
}

interface RawComment {
    id: number
    user: RawUser | null
    body_html?: string | null
    created_at: string
    html_url: string
}

interface RawReaction {
    id: number
    content: string
    user: RawUser | null
}

function toActor(u: RawUser | null): Actor | null {
    if (!u) return null
    const actor: Actor = { login: u.login, avatar_url: u.avatar_url, html_url: u.html_url }
    return u.type === 'Bot' ? { ...actor, bot: true } : actor
}

function toLabels(raw: RawSearchItem['labels']): Label[] {
    return raw.map((l) => ({ name: l.name, color: l.color, description: l.description ?? null }))
}

function toItem(raw: RawSearchItem): Item {
    return {
        id: raw.id,
        node_id: raw.node_id,
        number: raw.number,
        title: raw.title,
        html_url: raw.html_url,
        repo: raw.repository_url.replace(`${API}/repos/`, ''),
        type: raw.pull_request ? 'pr' : 'issue',
        state: raw.state,
        draft: raw.draft === true,
        labels: toLabels(raw.labels),
        author: toActor(raw.user),
        assignees: (raw.assignees ?? []).map(toActor).filter((a): a is Actor => a !== null),
        comments: raw.comments,
        reactions: raw.reactions?.total_count ?? 0,
        created_at: raw.created_at,
        updated_at: raw.updated_at,
        milestone: raw.milestone?.title ?? null
    }
}

function readRateLimit(res: Response): RateLimit | null {
    const limit = Number(res.headers.get('x-ratelimit-limit'))
    if (!Number.isFinite(limit) || limit === 0) return null
    return {
        limit,
        remaining: Number(res.headers.get('x-ratelimit-remaining')),
        resetAt: Number(res.headers.get('x-ratelimit-reset')) * 1000
    }
}

/** A 403 is either a permission problem or a rate limit; only the latter is worth a retry. */
async function isRateLimited(res: Response): Promise<boolean> {
    if (res.headers.get('retry-after') || res.headers.get('x-ratelimit-remaining') === '0')
        return true
    try {
        const body = (await res.clone().json()) as { message?: string }
        return /rate limit/i.test(body.message ?? '')
    } catch {
        return false
    }
}

export interface SearchProgress {
    fetched: number
    total: number
    /** Everything fetched so far, so the UI can render while pages keep arriving. */
    items: Item[]
}

export interface SearchResult {
    items: Item[]
    /** True when a query still had more than the API's 1000-result ceiling after every split. */
    truncated: boolean
    /** Sources GitHub refused to search: they do not exist or the token cannot see them. */
    invalid: Source[]
}

/**
 * The one seam to GitHub. Every method is a thin, typed wrapper; the client
 * owns auth headers, error mapping, rate-limit tracking and pagination.
 *
 * Invariants: `token` is optional (public data only, low rate limit); every
 * write method throws GitHubError when the token lacks permission; the
 * `onRateLimit` callback fires after every response that carries the headers.
 */
export class GitHubClient {
    constructor(
        private readonly token: string | null,
        private readonly onRateLimit: (r: RateLimit) => void = () => {},
        private readonly fetchImpl: Fetch = (...args) => globalThis.fetch(...args)
    ) {}

    /** Owner repository lists, per source key, with when they were fetched. */
    private readonly repoLists = new Map<string, { at: number; repos: RawRepo[] }>()
    /** Set once viewer() resolved, to list the viewer's private repositories. */
    private viewerLogin: string | null = null

    get authenticated(): boolean {
        return this.token !== null
    }

    private async request<T>(
        path: string,
        init: { method?: string; body?: unknown; accept?: string; signal?: AbortSignal } = {}
    ): Promise<{ data: T; response: Response }> {
        const headers: Record<string, string> = {
            'Accept': init.accept ?? 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
        }
        if (this.token) headers['Authorization'] = `Bearer ${this.token}`
        if (init.body !== undefined) headers['Content-Type'] = 'application/json'
        const send = () =>
            this.fetchImpl(API + path, {
                method: init.method ?? 'GET',
                headers,
                body: init.body === undefined ? undefined : JSON.stringify(init.body),
                signal: init.signal ?? null
            })
        const sleep = (ms: number) =>
            new Promise<void>((resolve, reject) => {
                const id = setTimeout(resolve, ms)
                init.signal?.addEventListener('abort', () => {
                    clearTimeout(id)
                    reject(new DOMException('Aborted', 'AbortError'))
                })
            })
        let response = await send()
        // Rate limited: the per-minute search budget (x-ratelimit-remaining: 0, resets within a
        // minute), the secondary burst limit (retry-after), or abuse detection (403 without either).
        // Wait once, then retry, so that a large first load completes instead of failing halfway.
        const retryAfter = Number(response.headers.get('retry-after'))
        const resetIn = Number(response.headers.get('x-ratelimit-reset')) * 1000 - Date.now()
        const exhausted = response.headers.get('x-ratelimit-remaining') === '0' && resetIn < 120_000
        if (
            response.status === 429 ||
            (response.status === 403 && (await isRateLimited(response)))
        ) {
            const seconds =
                retryAfter > 0 ? retryAfter : exhausted ? Math.ceil(resetIn / 1000) + 1 : 60
            await sleep(Math.min(120, seconds) * 1000)
            response = await send()
        }
        const rateLimit = readRateLimit(response)
        if (rateLimit) this.onRateLimit(rateLimit)
        // Pace search pagination: the search budget is 10 (anonymous) or 30 (token) requests per
        // minute. When it is nearly spent, sleep until the window resets instead of tripping the
        // limit and GitHub's abuse detection.
        if (response.ok && path.startsWith('/search/') && rateLimit && rateLimit.remaining <= 1) {
            await sleep(Math.min(90_000, Math.max(0, rateLimit.resetAt - Date.now() + 1000)))
        }
        if (!response.ok) {
            let message = `${response.status} ${response.statusText}`
            try {
                const body = (await response.json()) as {
                    message?: string
                    errors?: Array<{ message?: string }>
                }
                if (body.message) message = body.message
                // 422 "Validation Failed" says nothing on its own; the reason is in `errors`.
                const details = (body.errors ?? []).map((e) => e.message).filter(Boolean)
                if (details.length > 0) message = `${message}: ${details.join(' ')}`
            } catch {
                /* non-JSON error body */
            }
            if (response.status === 403 && rateLimit?.remaining === 0) {
                const minutes = Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 60_000))
                message = `GitHub API rate limit reached. It resets in about ${minutes} min. ${
                    this.token ? '' : 'Log in with a token to raise the limit.'
                }`.trim()
            } else if (response.status === 401) {
                message = 'GitHub rejected the token. It may have expired or been revoked.'
            }
            throw new GitHubError(message, response.status, rateLimit)
        }
        if (response.status === 204) return { data: undefined as T, response }
        return { data: (await response.json()) as T, response }
    }

    // ---- Read ----------------------------------------------------------------

    async viewer(): Promise<Viewer> {
        const { data: u } = await this.request<RawUser>('/user')
        this.viewerLogin = u.login
        let orgs: string[] = []
        try {
            const { data } = await this.request<Array<{ login: string }>>('/user/orgs?per_page=100')
            orgs = data.map((o) => o.login)
        } catch {
            // Token without read:org: the dashboard still works, minus org discovery.
        }
        return {
            login: u.login,
            avatar_url: u.avatar_url,
            html_url: u.html_url,
            name: u.name ?? null,
            orgs
        }
    }

    async search(
        sources: Source[],
        state: StateFilter,
        opts: {
            signal?: AbortSignal
            /** ISO timestamp: only items updated since then, in any state (incremental mode). */
            since?: string
            extra?: string[]
            onProgress?: (p: SearchProgress) => void
        } = {}
    ): Promise<SearchResult> {
        if (opts.since) {
            const stamp = opts.since.slice(0, 19) + 'Z'
            const { since: _since, ...rest } = opts
            return this.search(sources, 'all', { ...rest, extra: [`updated:>=${stamp}`] })
        }
        const extra = opts.extra ?? []
        const byId = new Map<number, Item>()
        let truncated = false
        const invalid: Source[] = []
        const progress = { fetched: 0, total: 0 }

        /**
         * Fetch every page of one query. Returns false when the 1000-result ceiling cut it short.
         * With `splittable`, a query whose first page already reports more than the ceiling stops
         * right there (false), so the caller can split it instead of paging through 1000 results
         * it would fetch again.
         */
        const fetchAll = async (q: string, splittable = false): Promise<boolean> => {
            for (let page = 1; ; page++) {
                const path = `/search/issues?q=${encodeURIComponent(q)}&sort=updated&order=desc&per_page=100&page=${page}`
                const { data } = await this.request<RawSearch>(path, { signal: opts.signal })
                if (page === 1) {
                    if (splittable && data.total_count > SEARCH_CEILING) return false
                    progress.total += Math.min(data.total_count, SEARCH_CEILING)
                }
                for (const raw of data.items) byId.set(raw.id, toItem(raw))
                progress.fetched += data.items.length
                opts.onProgress?.({ ...progress, items: Array.from(byId.values()) })
                const seen = page * 100
                if (data.items.length < 100 || seen >= data.total_count) return true
                if (seen >= SEARCH_CEILING) return false
            }
        }

        /**
         * Last resort for one repository with more than 1000 items of one type: split by creation
         * date, halving the range until every part fits. Only a single day that still exceeds the
         * ceiling is truncated.
         */
        const fetchByDate = async (q: string, from: number, to: number): Promise<void> => {
            if (from === to) {
                if (!(await fetchAll(`${q} created:${isoDay(from)}`))) truncated = true
                return
            }
            const mid = Math.floor((from + to) / 2)
            for (const [a, b] of [
                [from, mid],
                [mid + 1, to]
            ] as const) {
                const range = a === b ? isoDay(a) : `${isoDay(a)}..${isoDay(b)}`
                if (!(await fetchAll(`${q} created:${range}`, true))) await fetchByDate(q, a, b)
            }
        }

        const fetchRepo = async (repo: string, type: string): Promise<void> => {
            const q = buildQuery([{ kind: 'repo', value: repo }], state, [...extra, type])
            if (await fetchAll(q, true)) return
            await fetchByDate(q, FIRST_DAY, Math.floor(Date.now() / DAY))
        }

        /**
         * A user or org with more than 1000 items of one type: search its repositories instead,
         * a few per query, and split further per repository when needed.
         */
        const fetchOwnerRepos = async (s: Source, type: string): Promise<void> => {
            let repos: string[]
            try {
                repos = await this.ownerRepos(s, state === 'open', opts.signal)
            } catch (e) {
                if (opts.signal?.aborted) throw e
                // The repository list is not available: settle for the first 1000 results.
                if (!(await fetchAll(buildQuery([s], state, [...extra, type])))) truncated = true
                return
            }
            const repoSources = repos.map((value): Source => ({ kind: 'repo', value }))
            for (const chunk of chunkSources(repoSources, state, [...extra, type])) {
                if (await fetchAll(buildQuery(chunk, state, [...extra, type]), true)) continue
                for (const r of chunk) await fetchRepo(r.value, type)
            }
        }

        /**
         * GitHub answers 422 when a user, org or repo in the query does not exist or is not
         * visible, but only when no other qualifier in the query is valid. A single source that
         * gets a 422 is recorded as invalid and skipped.
         */
        const isInvalid = (e: unknown) => e instanceof GitHubError && e.status === 422
        const fetchOne = async (s: Source, type: string): Promise<void> => {
            if (invalid.some((x) => x === s)) return
            try {
                if (await fetchAll(buildQuery([s], state, [...extra, type]), true)) return
            } catch (e) {
                if (!isInvalid(e)) throw e
                invalid.push(s)
                return
            }
            if (s.kind === 'repo') {
                const q = buildQuery([s], state, [...extra, type])
                await fetchByDate(q, FIRST_DAY, Math.floor(Date.now() / DAY))
            } else await fetchOwnerRepos(s, type)
        }

        // GitHub requires every issue search to name a type (`is:issue` or `is:pull-request`),
        // so each chunk is fetched once per type. A query over the 1000-result ceiling, or
        // refused as a whole, is split per source, then per repository, then by creation date.
        for (const type of ITEM_TYPES) {
            for (const chunk of chunkSources(sources, state, [...extra, type])) {
                if (chunk.length > 1) {
                    try {
                        if (await fetchAll(buildQuery(chunk, state, [...extra, type]), true))
                            continue
                    } catch (e) {
                        if (!isInvalid(e)) throw e
                    }
                }
                for (const s of chunk) await fetchOne(s, type)
            }
        }
        return { items: Array.from(byId.values()), truncated, invalid }
    }

    /**
     * Repositories owned by a user or org that can hold items: archived repositories and forks
     * are skipped, and so are repositories without open issues or PRs when `openOnly`. Cached per
     * owner for a few hours. The viewer's own account is listed with private repositories.
     */
    async ownerRepos(owner: Source, openOnly: boolean, signal?: AbortSignal): Promise<string[]> {
        const key = `${owner.kind}:${owner.value.toLowerCase()}`
        const cached = this.repoLists.get(key)
        let repos = cached && Date.now() - cached.at < REPO_LIST_TTL ? cached.repos : null
        if (!repos) {
            const self =
                owner.kind === 'user' &&
                this.viewerLogin?.toLowerCase() === owner.value.toLowerCase()
            const base =
                owner.kind === 'org'
                    ? `/orgs/${owner.value}/repos?type=all`
                    : self
                      ? '/user/repos?affiliation=owner&visibility=all'
                      : `/users/${owner.value}/repos?type=owner`
            const list: RawRepo[] = []
            for (let page = 1; ; page++) {
                const { data } = await this.request<RawRepo[]>(
                    `${base}&per_page=100&page=${page}`,
                    { signal }
                )
                list.push(...data)
                if (data.length < 100) break
            }
            repos = list
            this.repoLists.set(key, { at: Date.now(), repos })
        }
        return repos
            .filter((r) => !r.archived && !r.fork && (!openOnly || r.open_issues_count > 0))
            .map((r) => r.full_name)
    }

    /**
     * GraphQL (token only). GitHub answers 200 with an `errors` array for partial failures:
     * those are thrown only when no data came back.
     */
    async graphql<T>(
        query: string,
        variables: Record<string, unknown>,
        opts: { signal?: AbortSignal; strict?: boolean; errors?: string[] } = {}
    ): Promise<T> {
        const { data } = await this.request<{ data?: T; errors?: Array<{ message: string }> }>(
            '/graphql',
            { method: 'POST', body: { query, variables }, signal: opts.signal }
        )
        const errors = (data.errors ?? []).map((e) => e.message)
        opts.errors?.push(...errors)
        // Mutations are strict: any error means the write did not happen.
        if (!data.data || (opts.strict && errors.length > 0)) {
            throw new GitHubError(errors.join(' ') || 'GraphQL error', 200)
        }
        return data.data
    }

    /** Review decision, mergeability, draft flag and CI rollup of up to 100 pull requests. */
    async pullRequestDetails(nodeIds: string[], signal?: AbortSignal): Promise<RawPrNode[]> {
        const data = await this.graphql<{ nodes: Array<RawPrNode | Record<string, never> | null> }>(
            PR_DETAILS_QUERY,
            { ids: nodeIds },
            { signal }
        )
        return data.nodes.filter((n): n is RawPrNode => n !== null && 'id' in n)
    }

    /**
     * Project (v2) memberships and Status of up to 100 issues or pull requests. Throws a 403
     * GitHubError when the token cannot read projects (the Projects permission is missing).
     */
    async projectMemberships(nodeIds: string[], signal?: AbortSignal): Promise<RawProjectsNode[]> {
        const errors: string[] = []
        const data = await this.graphql<{ nodes: Array<Partial<RawProjectsNode> | null> }>(
            PROJECT_MEMBERSHIPS_QUERY,
            { ids: nodeIds },
            { signal, errors }
        )
        const nodes = data.nodes.filter(
            (n): n is RawProjectsNode => n !== null && typeof n.id === 'string'
        )
        if (errors.length > 0 && nodes.every((n) => n.projectItems === null)) {
            throw new GitHubError(`Projects are not readable with this token: ${errors[0]}`, 403)
        }
        return nodes
    }

    /** Open projects of a user or organization, most recently updated first. */
    async ownerProjects(login: string): Promise<Project[]> {
        const data = await this.graphql<{
            repositoryOwner: { projectsV2?: { nodes: Array<RawProject | null> } } | null
        }>(OWNER_PROJECTS_QUERY, { login })
        return (data.repositoryOwner?.projectsV2?.nodes ?? [])
            .filter((p): p is RawProject => p !== null && !p.closed)
            .map(toProject)
    }

    /** Add an issue or PR to a project. Returns the project item id. */
    async addToProject(projectId: string, item: Item): Promise<string> {
        const data = await this.graphql<{ addProjectV2ItemById: { item: { id: string } } }>(
            `mutation($p: ID!, $c: ID!) {
  addProjectV2ItemById(input: { projectId: $p, contentId: $c }) { item { id } }
}`,
            { p: projectId, c: item.node_id },
            { strict: true }
        )
        return data.addProjectV2ItemById.item.id
    }

    async setProjectStatus(
        projectId: string,
        itemId: string,
        fieldId: string,
        optionId: string
    ): Promise<void> {
        await this.graphql<unknown>(
            `mutation($p: ID!, $i: ID!, $f: ID!, $o: String!) {
  updateProjectV2ItemFieldValue(
    input: { projectId: $p, itemId: $i, fieldId: $f, value: { singleSelectOptionId: $o } }
  ) { projectV2Item { id } }
}`,
            { p: projectId, i: itemId, f: fieldId, o: optionId },
            { strict: true }
        )
    }

    /** Rendered body, comments and whether the viewer already gave a 👍. */
    async detail(item: Item, viewerLogin: string | null): Promise<ItemDetail> {
        const base = `/repos/${item.repo}/issues/${item.number}`
        const html = 'application/vnd.github.html+json'
        const [{ data: issue }, { data: comments }] = await Promise.all([
            this.request<RawIssueHtml>(base, { accept: html }),
            this.request<RawComment[]>(`${base}/comments?per_page=100`, { accept: html })
        ])
        let viewerReacted = false
        if (viewerLogin) {
            try {
                const { data: reactions } = await this.request<RawReaction[]>(
                    `${base}/reactions?content=%2B1&per_page=100`
                )
                viewerReacted = reactions.some((r) => r.user?.login === viewerLogin)
            } catch {
                /* reactions are optional */
            }
        }
        return {
            body_html: issue.body_html ?? '',
            viewerReacted,
            comments: comments.map((c): Comment => ({
                id: c.id,
                author: toActor(c.user),
                body_html: c.body_html ?? '',
                created_at: c.created_at,
                html_url: c.html_url
            }))
        }
    }

    async repoLabels(repo: string): Promise<RepoLabel[]> {
        const { data } = await this.request<
            Array<{ name: string; color: string; description?: string | null }>
        >(`/repos/${repo}/labels?per_page=100`)
        return data.map((l) => ({
            name: l.name,
            color: l.color,
            description: l.description ?? null
        }))
    }

    /** Open milestones of a repository, soonest due first. */
    async repoMilestones(repo: string): Promise<Milestone[]> {
        const { data } = await this.request<Milestone[]>(
            `/repos/${repo}/milestones?state=open&sort=due_on&direction=asc&per_page=100`
        )
        return data.map((m) => ({ number: m.number, title: m.title, due_on: m.due_on ?? null }))
    }

    // ---- Write (token with Issues + Pull requests read/write) -----------------

    /** Set or clear (null) the milestone. Returns the new milestone title. */
    async setMilestone(item: Item, milestone: number | null): Promise<string | null> {
        const { data } = await this.request<{ milestone: { title: string } | null }>(
            `/repos/${item.repo}/issues/${item.number}`,
            { method: 'PATCH', body: { milestone } }
        )
        return data.milestone?.title ?? null
    }

    async createMilestone(repo: string, title: string): Promise<Milestone> {
        const { data } = await this.request<Milestone>(`/repos/${repo}/milestones`, {
            method: 'POST',
            body: { title }
        })
        return { number: data.number, title: data.title, due_on: data.due_on ?? null }
    }

    /** Toggle the viewer's 👍. Returns the new state. */
    async toggleUpvote(item: Item, viewerLogin: string): Promise<boolean> {
        const base = `/repos/${item.repo}/issues/${item.number}/reactions`
        const { data: reactions } = await this.request<RawReaction[]>(
            `${base}?content=%2B1&per_page=100`
        )
        const mine = reactions.find((r) => r.user?.login === viewerLogin)
        if (mine) {
            await this.request<void>(`${base}/${mine.id}`, { method: 'DELETE' })
            return false
        }
        await this.request<RawReaction>(base, { method: 'POST', body: { content: '+1' } })
        return true
    }

    async comment(item: Item, body: string): Promise<Comment> {
        const { data } = await this.request<RawComment>(
            `/repos/${item.repo}/issues/${item.number}/comments`,
            {
                method: 'POST',
                body: { body },
                accept: 'application/vnd.github.html+json'
            }
        )
        return {
            id: data.id,
            author: toActor(data.user),
            body_html: data.body_html ?? '',
            created_at: data.created_at,
            html_url: data.html_url
        }
    }

    async setLabels(item: Item, labels: string[]): Promise<Label[]> {
        const { data } = await this.request<RawSearchItem['labels']>(
            `/repos/${item.repo}/issues/${item.number}/labels`,
            { method: 'PUT', body: { labels } }
        )
        return toLabels(data)
    }

    async assignSelf(item: Item, viewerLogin: string, assign: boolean): Promise<Actor[]> {
        const { data } = await this.request<{ assignees: RawUser[] | null }>(
            `/repos/${item.repo}/issues/${item.number}/assignees`,
            { method: assign ? 'POST' : 'DELETE', body: { assignees: [viewerLogin] } }
        )
        return (data.assignees ?? []).map(toActor).filter((a): a is Actor => a !== null)
    }

    async setState(item: Item, state: 'open' | 'closed'): Promise<void> {
        await this.request<unknown>(`/repos/${item.repo}/issues/${item.number}`, {
            method: 'PATCH',
            body: state === 'closed' ? { state, state_reason: 'completed' } : { state }
        })
    }
}
