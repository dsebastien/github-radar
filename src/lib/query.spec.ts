import { describe, expect, test } from 'bun:test'
import { buildQueries, buildQuery, chunkSources } from './query'
import type { Source } from './types'

describe('buildQueries', () => {
    test('no sources means no queries', () => {
        expect(buildQueries([], 'open')).toEqual([])
    })
    test('one query for a handful of sources', () => {
        const q = buildQueries(
            [
                { kind: 'user', value: 'dsebastien' },
                { kind: 'org', value: 'knowii-oss' },
                { kind: 'repo', value: 'DeveloPassion/obsidian-starter-kit-plugin' }
            ],
            'open'
        )
        expect(q).toEqual([
            'state:open user:dsebastien org:knowii-oss repo:DeveloPassion/obsidian-starter-kit-plugin'
        ])
    })
    test('"all" state omits the state qualifier', () => {
        expect(buildQueries([{ kind: 'user', value: 'x' }], 'all')).toEqual(['user:x'])
    })
    test('long lists are chunked under the 256-char search limit', () => {
        const sources: Source[] = Array.from({ length: 40 }, (_, i) => ({
            kind: 'repo',
            value: `some-organization/repository-number-${i}`
        }))
        const queries = buildQueries(sources, 'open')
        expect(queries.length).toBeGreaterThan(1)
        for (const q of queries) {
            expect(q.length).toBeLessThanOrEqual(256)
            expect(q.startsWith('state:open ')).toBe(true)
        }
        const covered = queries.flatMap((q) => q.split(' ').filter((t) => t.startsWith('repo:')))
        expect(covered).toHaveLength(40)
    })
})

describe('buildQuery', () => {
    test('extra qualifiers narrow the query', () => {
        expect(buildQuery([{ kind: 'org', value: 'acme' }], 'open', ['is:pr'])).toBe(
            'state:open is:pr org:acme'
        )
    })
})

describe('chunkSources', () => {
    test('keeps every chunk under the limit and preserves order', () => {
        const sources: Source[] = Array.from({ length: 30 }, (_, i) => ({
            kind: 'repo',
            value: `organization/repository-number-${i}`
        }))
        const chunks = chunkSources(sources, 'open')
        expect(chunks.flat()).toEqual(sources)
        for (const c of chunks) expect(buildQuery(c, 'open').length).toBeLessThanOrEqual(256)
    })
})
