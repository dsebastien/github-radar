import { describe, expect, test } from 'bun:test'
import {
    applyFilters,
    attentionFlags,
    computeFacets,
    countBySource,
    groupItems,
    itemSources,
    pruneFilters,
    sortItems
} from './filtering'
import { DEFAULT_FILTERS, type Item } from './types'

const NOW = Date.parse('2026-09-17T12:00:00Z')
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString()

function item(over: Partial<Item> & { id: number }): Item {
    return {
        node_id: `N${over.id}`,
        number: over.id,
        title: `Item ${over.id}`,
        html_url: `https://github.com/o/r/issues/${over.id}`,
        repo: 'o/r',
        type: 'issue',
        state: 'open',
        draft: false,
        labels: [],
        author: { login: 'alice', avatar_url: '', html_url: '' },
        assignees: [],
        comments: 0,
        reactions: 0,
        created_at: daysAgo(10),
        updated_at: daysAgo(1),
        milestone: null,
        ...over
    }
}

const bug = { name: 'bug', color: 'd73a4a', description: null }
const bob = { login: 'bob', avatar_url: '', html_url: '' }

const fixtures: Item[] = [
    item({ id: 1, title: 'Crash on startup', labels: [bug], assignees: [bob], comments: 5 }),
    item({ id: 2, title: 'Add dark mode', type: 'pr', draft: true, repo: 'o/other', author: bob }),
    item({ id: 3, title: 'Old forgotten thing', updated_at: daysAgo(45) }),
    item({ id: 4, title: 'Ancient', updated_at: daysAgo(200), state: 'closed' })
]

const sources = [
    { kind: 'user' as const, value: 'O' },
    { kind: 'repo' as const, value: 'o/other' }
]
const ctx = { now: NOW, viewerLogin: 'bob', sources }

describe('applyFilters', () => {
    test('defaults keep open items only', () => {
        expect(applyFilters(fixtures, DEFAULT_FILTERS, ctx).map((i) => i.id)).toEqual([1, 2, 3])
    })
    test('text matches title words, repo, number and label', () => {
        const f = (text: string) =>
            applyFilters(fixtures, { ...DEFAULT_FILTERS, text }, ctx).map((i) => i.id)
        expect(f('dark')).toEqual([2])
        expect(f('crash startup')).toEqual([1])
        expect(f('#3')).toEqual([3])
        expect(f('other')).toEqual([2])
        expect(f('bug')).toEqual([1])
    })
    test('type, drafts, labels, repos, authors, assignees', () => {
        const run = (over: Partial<typeof DEFAULT_FILTERS>) =>
            applyFilters(fixtures, { ...DEFAULT_FILTERS, ...over }, ctx).map((i) => i.id)
        expect(run({ type: 'pr' })).toEqual([2])
        expect(run({ hideDrafts: true })).toEqual([1, 3])
        expect(run({ labels: ['BUG'] })).toEqual([1])
        expect(run({ repos: ['o/other'] })).toEqual([2])
        expect(run({ authors: ['bob'] })).toEqual([2])
        expect(run({ assignees: ['bob'] })).toEqual([1])
        expect(run({ state: 'all' })).toEqual([1, 2, 3, 4])
        expect(run({ milestones: ['(none)'] })).toEqual([1, 2, 3])
    })
    test('"mine" shortcuts use the viewer login', () => {
        const run = (mine: typeof DEFAULT_FILTERS.mine, login: string | null) =>
            applyFilters(
                fixtures,
                { ...DEFAULT_FILTERS, mine },
                { ...ctx, viewerLogin: login }
            ).map((i) => i.id)
        expect(run('authored', 'bob')).toEqual([2])
        expect(run('assigned', 'bob')).toEqual([1])
        expect(run('involved', 'bob')).toEqual([1, 2])
        expect(run('involved', null)).toEqual([])
    })
    test('attention filter', () => {
        const run = (attention: typeof DEFAULT_FILTERS.attention) =>
            applyFilters(fixtures, { ...DEFAULT_FILTERS, attention, state: 'all' }, ctx).map(
                (i) => i.id
            )
        expect(run('stale')).toEqual([3])
        expect(run('dormant')).toEqual([4])
        expect(run('draft')).toEqual([2])
        expect(run('unlabeled')).toEqual([2, 3, 4])
        expect(run('unassigned')).toEqual([2, 3, 4])
    })
})

describe('source visibility', () => {
    test('itemSources matches owner for users/orgs and full name for repos, case-insensitively', () => {
        expect(itemSources(fixtures[0]!, sources)).toEqual([{ kind: 'user', value: 'O' }])
        expect(itemSources(fixtures[1]!, sources)).toEqual(sources)
    })
    test('hidden sources drop items unless another visible source still covers them', () => {
        const run = (hiddenSources: string[]) =>
            applyFilters(fixtures, { ...DEFAULT_FILTERS, hiddenSources }, ctx).map((i) => i.id)
        expect(run(['user:o'])).toEqual([2])
        expect(run(['user:o', 'repo:o/other'])).toEqual([])
        expect(run(['repo:o/other'])).toEqual([1, 2, 3])
    })
    test('pruneFilters drops selections no visible item can satisfy', () => {
        const f = { ...DEFAULT_FILTERS, repos: ['o/other'], labels: ['bug'], authors: ['bob'] }
        // Nothing hidden: everything still matches, same object back.
        expect(pruneFilters(f, fixtures, sources)).toBe(f)
        // Hiding user O leaves item 2 only (o/other, by bob, unlabeled): the label selection goes.
        const pruned = pruneFilters({ ...f, hiddenSources: ['user:o'] }, fixtures, sources)
        expect(pruned.repos).toEqual(['o/other'])
        expect(pruned.authors).toEqual(['bob'])
        expect(pruned.labels).toEqual([])
        // Hiding everything empties every selection.
        const none = pruneFilters(
            { ...f, hiddenSources: ['user:o', 'repo:o/other'] },
            fixtures,
            sources
        )
        expect([none.repos, none.labels, none.authors]).toEqual([[], [], []])
    })
    test('countBySource', () => {
        expect(countBySource(fixtures, sources)).toEqual({ 'user:o': 4, 'repo:o/other': 1 })
    })
})

describe('attentionFlags', () => {
    test('boundaries at 30 and 90 days', () => {
        expect(
            attentionFlags(
                item({ id: 9, updated_at: daysAgo(29), labels: [bug], assignees: [bob] }),
                NOW
            )
        ).toEqual([])
        expect(
            attentionFlags(
                item({ id: 9, updated_at: daysAgo(30), labels: [bug], assignees: [bob] }),
                NOW
            )
        ).toEqual(['stale'])
        expect(
            attentionFlags(
                item({ id: 9, updated_at: daysAgo(90), labels: [bug], assignees: [bob] }),
                NOW
            )
        ).toEqual(['dormant'])
    })
})

describe('sortItems', () => {
    test('by comments, then updated', () => {
        expect(sortItems(fixtures, 'comments').map((i) => i.id)).toEqual([1, 2, 3, 4])
    })
    test('by title, case-insensitive', () => {
        expect(sortItems(fixtures, 'title').map((i) => i.id)).toEqual([2, 4, 1, 3])
    })
    test('does not mutate', () => {
        const copy = [...fixtures]
        sortItems(fixtures, 'title')
        expect(fixtures).toEqual(copy)
    })
})

describe('groupItems', () => {
    test('by repo, biggest first', () => {
        const groups = groupItems(fixtures, 'repo')
        expect(groups.map((g) => [g.key, g.items.length])).toEqual([
            ['o/r', 3],
            ['o/other', 1]
        ])
    })
    test('none yields a single unnamed group', () => {
        expect(groupItems(fixtures, 'none')).toEqual([{ key: '', items: fixtures }])
    })
})

describe('computeFacets', () => {
    test('counts distinct values', () => {
        const f = computeFacets(fixtures)
        expect(f.labels).toEqual([{ name: 'bug', color: 'd73a4a', count: 1 }])
        expect(f.repos).toEqual([
            { name: 'o/r', count: 3 },
            { name: 'o/other', count: 1 }
        ])
        expect(f.authors.map((a) => [a.login, a.count])).toEqual([
            ['alice', 3],
            ['bob', 1]
        ])
        expect(f.assignees.map((a) => a.login)).toEqual(['bob'])
        expect(f.milestones).toEqual([{ title: '(none)', count: 4, repos: 2 }])
    })
    test('milestones group by title across repositories, "none" last', () => {
        const f = computeFacets([
            item({ id: 1, milestone: 'v1' }),
            item({ id: 2, milestone: 'V1', repo: 'o/other' }),
            item({ id: 3 })
        ])
        expect(f.milestones).toEqual([
            { title: 'v1', count: 2, repos: 2 },
            { title: '(none)', count: 1, repos: 1 }
        ])
    })
})
