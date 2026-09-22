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
