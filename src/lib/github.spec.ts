import { describe, expect, test } from 'bun:test'
import { GitHubClient, GitHubError } from './github'
import type { Source } from './types'

const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' }
    })

const refused = () =>
    json(422, {
        message: 'Validation Failed',
        errors: [{ message: 'The listed users cannot be searched.' }]
    })

const item = (id: number) => ({
    id,
    number: id,
    title: `#${id}`,
    html_url: `https://github.com/a/b/issues/${id}`,
    repository_url: 'https://api.github.com/repos/a/b',
    state: 'open',
    labels: [],
    user: null,
    assignees: [],
    comments: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    milestone: null
})

/** A fake Search API: `user:missing` alone is refused, anything else returns one item. */
function fakeFetch(queries: string[], { refuseMixed = false } = {}) {
    let id = 0
    return (input: RequestInfo | URL) => {
        const url = input instanceof Request ? input.url : input.toString()
        const q = new URL(url).searchParams.get('q') ?? ''
        queries.push(q)
        const missing = q.includes('user:missing')
        if (missing && (refuseMixed || !q.includes('user:ok'))) return Promise.resolve(refused())
        return Promise.resolve(json(200, { total_count: 1, items: [item(++id)] }))
    }
}

const ok: Source = { kind: 'user', value: 'ok' }
const missing: Source = { kind: 'user', value: 'missing' }

describe('GitHubClient.search', () => {
    test('skips a single source GitHub refuses and reports it', async () => {
        const queries: string[] = []
        const client = new GitHubClient(null, () => {}, fakeFetch(queries))
        const result = await client.search([missing], 'open')
        expect(result.items).toHaveLength(0)
        expect(result.invalid).toEqual([missing])
        // Refused once, not retried for the second item type.
        expect(queries).toHaveLength(1)
    })

    test('splits a refused chunk per source and keeps the valid ones', async () => {
        const queries: string[] = []
        const client = new GitHubClient(null, () => {}, fakeFetch(queries, { refuseMixed: true }))
        const result = await client.search([ok, missing], 'open')
        expect(result.invalid).toEqual([missing])
        expect(result.items).toHaveLength(2) // user:ok, once per item type
    })

    test('puts the validation details in the error message', async () => {
        const client = new GitHubClient(
            null,
            () => {},
            () => Promise.resolve(refused())
        )
        const error = await client.repoLabels('a/b').catch((e: unknown) => e)
        expect(error).toBeInstanceOf(GitHubError)
        expect((error as GitHubError).message).toBe(
            'Validation Failed: The listed users cannot be searched.'
        )
    })
})

/**
 * A fake GitHub where `user:big` owns many repositories. Any query naming `user:big` reports
 * 1500 results, and so does `repo:big/huge` unless a `created:` range narrows it to under
 * four years.
 * Everything else returns one item.
 */
function bigFetch(queries: string[], paths: string[]) {
    let id = 0
    const repos = [
        ...Array.from({ length: 12 }, (_, i) => ({
            full_name: `big/repository-with-a-long-name-${i}`,
            archived: false,
            fork: false,
            open_issues_count: 3
        })),
        { full_name: 'big/huge', archived: false, fork: false, open_issues_count: 5000 },
        { full_name: 'big/archived', archived: true, fork: false, open_issues_count: 2 },
        { full_name: 'big/fork', archived: false, fork: true, open_issues_count: 2 },
        { full_name: 'big/quiet', archived: false, fork: false, open_issues_count: 0 }
    ]
    return (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : input.toString())
        paths.push(url.pathname)
        if (url.pathname === '/users/big/repos') return Promise.resolve(json(200, repos))
        const q = url.searchParams.get('q') ?? ''
        queries.push(q)
        const [from, to = from] = (/created:(\S+)/.exec(q)?.[1] ?? '').split('..')
        const span = from ? Date.parse(to!) - Date.parse(from) : Infinity
        const overflow =
            q.includes('user:big') || (q.includes('repo:big/huge') && span > 4 * 365 * 86_400_000)
        const page = Number(url.searchParams.get('page'))
        if (overflow)
            return Promise.resolve(
                json(200, {
                    total_count: 1500,
                    items: Array.from({ length: 100 }, () => item(++id + page * 0))
                })
            )
        return Promise.resolve(json(200, { total_count: 1, items: [item(++id)] }))
    }
}

describe('GitHubClient.search past the 1000-result ceiling', () => {
    const big: Source = { kind: 'user', value: 'big' }

    test('splits an owner into its repositories, a few per query', async () => {
        const queries: string[] = []
        const paths: string[] = []
        const client = new GitHubClient(null, () => {}, bigFetch(queries, paths))
        const result = await client.search([big], 'open')
        expect(result.truncated).toBe(false)
        // The owner query stops at its first page instead of paging through 1000 results.
        expect(queries.filter((q) => q.includes('user:big'))).toHaveLength(2)
        const repoQueries = queries.filter((q) => q.includes('repo:') && !q.includes('created:'))
        for (const q of repoQueries) expect(q.length).toBeLessThanOrEqual(256)
        // Forks and repositories without open items are skipped; archived ones are searched.
        const all = queries.join(' ')
        expect(all).toContain('big/archived')
        expect(all).not.toContain('big/fork')
        expect(all).not.toContain('big/quiet')
        // Several repositories share a query.
        expect(repoQueries.some((q) => q.split('repo:').length > 3)).toBe(true)
        // The repository list is fetched once and reused for the second item type.
        expect(paths.filter((p) => p === '/users/big/repos')).toHaveLength(1)
    })

    test('leaves archived repositories out of every query when asked to', async () => {
        const queries: string[] = []
        const client = new GitHubClient(null, () => {}, bigFetch(queries, []))
        await client.search([big], 'open', { includeArchived: false })
        expect(queries.join(' ')).not.toContain('big/archived')
        for (const q of queries) expect(q).toContain('archived:false')
    })

    test('keeps archived:false in incremental searches', async () => {
        const queries: string[] = []
        const client = new GitHubClient(null, () => {}, fakeFetch(queries))
        await client.search([ok], 'open', {
            includeArchived: false,
            since: '2026-09-01T00:00:00.000Z'
        })
        for (const q of queries) {
            expect(q).toContain('archived:false')
            expect(q).toContain('updated:>=2026-09-01T00:00:00Z')
        }
    })

    test('splits a single huge repository by creation date', async () => {
        const queries: string[] = []
        const client = new GitHubClient(null, () => {}, bigFetch(queries, []))
        const result = await client.search([{ kind: 'repo', value: 'big/huge' }], 'open')
        expect(result.truncated).toBe(false)
        const ranges = queries.filter((q) => q.includes('created:') && q.includes('is:issue'))
        // 2008 to today halved until each part spans under four years: 2 + 4 + 8 ranges.
        expect(ranges).toHaveLength(14)
        // Ranges are contiguous and never overlap: each starts the day after the previous ends.
        const bounds = ranges
            .map((q) => /created:(\S+)\.\.(\S+)/.exec(q))
            .filter((m): m is RegExpExecArray => m !== null)
            .map((m) => [m[1]!, m[2]!] as const)
            .filter(([a, b]) => Date.parse(b) - Date.parse(a) <= 4 * 365 * 86_400_000)
            .sort(([a], [b]) => a.localeCompare(b))
        for (let i = 1; i < bounds.length; i++)
            expect(Date.parse(bounds[i]![0]) - Date.parse(bounds[i - 1]![1])).toBe(86_400_000)
    })

    test('reports truncation only when a single day still exceeds the ceiling', async () => {
        const client = new GitHubClient(
            null,
            () => {},
            () =>
                Promise.resolve(
                    json(200, {
                        total_count: 1500,
                        items: Array.from({ length: 100 }, (_, i) => item(i))
                    })
                )
        )
        const at = Date.UTC(2008, 0, 1)
        const realNow = Date.now
        Date.now = () => at + 86_400_000 // GitHub's first two days: one split, two single days.
        try {
            const result = await client.search([{ kind: 'repo', value: 'a/b' }], 'open')
            expect(result.truncated).toBe(true)
        } finally {
            Date.now = realNow
        }
    })
})

describe('GitHubClient.canReadProjects', () => {
    /** GraphQL answers per owner login: how many projects, and whether they are visible. */
    const graphql = (owners: Record<string, { total: number; visible: boolean }>) => {
        const asked: string[] = []
        const fetch = (_: RequestInfo | URL, init?: RequestInit) => {
            const { variables } = JSON.parse(init?.body as string) as {
                variables: { login: string }
            }
            asked.push(variables.login)
            const o = owners[variables.login] ?? { total: 0, visible: true }
            const nodes = o.total > 0 ? [o.visible ? { id: 'P' } : null] : []
            return Promise.resolve(
                json(200, {
                    data: { repositoryOwner: { projectsV2: { totalCount: o.total, nodes } } }
                })
            )
        }
        return { asked, client: new GitHubClient('t', () => {}, fetch) }
    }

    test('projects that exist but come back null mean no permission', async () => {
        const { client } = graphql({ me: { total: 4, visible: false } })
        expect(await client.canReadProjects(['me'])).toBe(false)
    })
    test('skips owners without projects until one can tell', async () => {
        const { client, asked } = graphql({ org: { total: 2, visible: true } })
        expect(await client.canReadProjects(['me', 'org', 'other'])).toBe(true)
        expect(asked).toEqual(['me', 'org'])
    })
    test('nobody has projects: nothing to show', async () => {
        const { client } = graphql({})
        expect(await client.canReadProjects(['me'])).toBe(false)
    })
})

describe('GitHubClient.repoInfo', () => {
    const repo = (full_name: string, archived: boolean, pushed_at: string | null) => ({
        full_name,
        archived,
        fork: false,
        open_issues_count: 1,
        pushed_at
    })

    test('lists owners once, reads repo sources, skips what cannot be read', async () => {
        const paths: string[] = []
        const client = new GitHubClient(
            null,
            () => {},
            (input: RequestInfo | URL) => {
                const url = new URL(input instanceof Request ? input.url : input.toString())
                paths.push(url.pathname)
                if (url.pathname === '/orgs/acme/repos')
                    return Promise.resolve(
                        json(200, [repo('acme/Old', true, '2020-01-01T00:00:00Z')])
                    )
                if (url.pathname === '/repos/me/tool')
                    return Promise.resolve(json(200, repo('me/tool', false, null)))
                return Promise.resolve(json(404, { message: 'Not Found' }))
            }
        )
        const sources: Source[] = [
            { kind: 'org', value: 'acme' },
            { kind: 'repo', value: 'me/tool' },
            { kind: 'user', value: 'ghost' }
        ]
        expect(await client.repoInfo(sources)).toEqual({
            repos: {
                'acme/old': { archived: true, pushedAt: '2020-01-01T00:00:00Z' },
                'me/tool': { archived: false, pushedAt: null }
            },
            failed: [{ kind: 'user', value: 'ghost' }]
        })
        // The owner listing is cached and shared with ownerRepos().
        expect(await client.ownerRepos({ kind: 'org', value: 'acme' }, true, false)).toEqual([])
        expect(await client.ownerRepos({ kind: 'org', value: 'acme' }, true, true)).toEqual([
            'acme/Old'
        ])
        expect(paths.filter((p) => p === '/orgs/acme/repos')).toHaveLength(1)
    })
})

describe('GitHubClient.lastCommits', () => {
    test('asks for every repository in one query, with variables, and keys by lowercased name', async () => {
        let body: { query: string; variables: Record<string, string> } | null = null
        const client = new GitHubClient(
            't',
            () => {},
            (_input, init) => {
                body = JSON.parse(init?.body as string) as typeof body
                return Promise.resolve(
                    json(200, {
                        data: {
                            r0: {
                                defaultBranchRef: {
                                    target: { committedDate: '2026-01-01T00:00:00Z' }
                                }
                            },
                            r1: { defaultBranchRef: null },
                            r2: null
                        }
                    })
                )
            }
        )
        expect(await client.lastCommits(['Acme/One', 'acme/empty', 'acme/gone'])).toEqual({
            'acme/one': '2026-01-01T00:00:00Z',
            'acme/empty': null,
            'acme/gone': null
        })
        expect(body!.variables).toMatchObject({ o0: 'Acme', n0: 'One', o2: 'acme', n2: 'gone' })
        expect(body!.query).not.toContain('Acme')
    })
})

describe('GitHubClient.setState', () => {
    const target = (type: 'issue' | 'pr') =>
        ({ repo: 'a/b', number: 7, type }) as unknown as Parameters<GitHubClient['setState']>[0]

    test('closes issues with a reason, pull requests without one', async () => {
        const bodies: unknown[] = []
        const client = new GitHubClient(
            't',
            () => {},
            (_input, init) => {
                bodies.push(JSON.parse(init?.body as string))
                return Promise.resolve(json(200, {}))
            }
        )
        await client.setState(target('issue'), 'closed', 'not_planned')
        await client.setState(target('issue'), 'closed')
        await client.setState(target('pr'), 'closed', 'not_planned')
        await client.setState(target('issue'), 'open')
        expect(bodies).toEqual([
            { state: 'closed', state_reason: 'not_planned' },
            { state: 'closed', state_reason: 'completed' },
            { state: 'closed' },
            { state: 'open' }
        ])
    })
})
