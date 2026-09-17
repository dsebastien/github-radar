import { buildQuery, chunkSources } from './query'
import type {
    Actor,
    Comment,
    Item,
    ItemDetail,
    Label,
    RateLimit,
    RepoLabel,
    Source,
    StateFilter,
    Viewer
} from './types'

const API = 'https://api.github.com'
/** The Search API never returns more than 1000 results for one query. */
const SEARCH_CEILING = 1000

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

type Fetch = typeof fetch

interface RawUser {
    login: string
    avatar_url: string
    html_url: string
    name?: string | null
}

interface RawSearchItem {
    id: number
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
    return u ? { login: u.login, avatar_url: u.avatar_url, html_url: u.html_url } : null
}

function toLabels(raw: RawSearchItem['labels']): Label[] {
    return raw.map((l) => ({ name: l.name, color: l.color, description: l.description ?? null }))
}

function toItem(raw: RawSearchItem): Item {
    return {
        id: raw.id,
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
}

export interface SearchResult {
    items: Item[]
    /** True when a query had more than the API's 1000-result ceiling. */
    truncated: boolean
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
        private readonly fetchImpl: Fetch = fetch
    ) {}

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
                const body = (await response.json()) as { message?: string }
                if (body.message) message = body.message
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
        const progress: SearchProgress = { fetched: 0, total: 0 }

        /** Fetch every page of one query. Returns false when the 1000-result ceiling cut it short. */
        const fetchAll = async (q: string): Promise<boolean> => {
            for (let page = 1; ; page++) {
                const path = `/search/issues?q=${encodeURIComponent(q)}&sort=updated&order=desc&per_page=100&page=${page}`
                const { data } = await this.request<RawSearch>(path, { signal: opts.signal })
                if (page === 1) progress.total += Math.min(data.total_count, SEARCH_CEILING)
                for (const raw of data.items) byId.set(raw.id, toItem(raw))
                progress.fetched += data.items.length
                opts.onProgress?.({ ...progress })
                const seen = page * 100
                if (data.items.length < 100 || seen >= data.total_count) return true
                if (seen >= SEARCH_CEILING) return false
            }
        }

        // Widest queries first; a query that hits the ceiling is split per source,
        // then per type, so that only a single source with 1000+ open items of one
        // type is ever reported as truncated.
        for (const chunk of chunkSources(sources, state)) {
            if (await fetchAll(buildQuery(chunk, state, extra))) continue
            const perSource = chunk.length > 1 ? chunk : []
            const needsTypeSplit: Source[] = chunk.length > 1 ? [] : chunk
            for (const s of perSource) {
                if (!(await fetchAll(buildQuery([s], state, extra)))) needsTypeSplit.push(s)
            }
            for (const s of needsTypeSplit) {
                for (const type of ['is:issue', 'is:pr']) {
                    if (!(await fetchAll(buildQuery([s], state, [...extra, type]))))
                        truncated = true
                }
            }
        }
        return { items: Array.from(byId.values()), truncated }
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

    // ---- Write (token with Issues + Pull requests read/write) -----------------

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
