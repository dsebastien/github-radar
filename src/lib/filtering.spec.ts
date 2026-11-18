import { describe, expect, test } from 'bun:test'
import {
    ALL_REPOS,
    applyFilters,
    attentionFlags,
    computeFacets,
    countBySource,
    groupItems,
    isNew,
    isRepoTicked,
    itemSources,
    matchNames,
    NO_REPO_CHOICE,
    pruneFilters,
    selectAll,
    sortItems,
    tickRepos,
    unselectAll,
    type RepoChoice
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

/** The defaults with drafts shown, so every fixture can match. */
const SHOW_ALL = { ...DEFAULT_FILTERS, hideDrafts: false }

describe('applyFilters', () => {
    test('defaults keep open items only, drafts hidden', () => {
        expect(applyFilters(fixtures, DEFAULT_FILTERS, ctx).map((i) => i.id)).toEqual([1, 3])
        expect(applyFilters(fixtures, SHOW_ALL, ctx).map((i) => i.id)).toEqual([1, 2, 3])
    })
    test('text matches title words, repo, number and label', () => {
        const f = (text: string) =>
            applyFilters(fixtures, { ...SHOW_ALL, text }, ctx).map((i) => i.id)
        expect(f('dark')).toEqual([2])
        expect(f('crash startup')).toEqual([1])
        expect(f('#3')).toEqual([3])
        expect(f('other')).toEqual([2])
        expect(f('bug')).toEqual([1])
    })
    test('type, drafts, labels, repos, authors, assignees', () => {
        const run = (over: Partial<typeof DEFAULT_FILTERS>) =>
            applyFilters(fixtures, { ...SHOW_ALL, ...over }, ctx).map((i) => i.id)
        expect(run({ type: 'pr' })).toEqual([2])
        expect(run({ hideDrafts: true })).toEqual([1, 3])
        expect(run({ labels: ['BUG'] })).toEqual([1])
        expect(run({ repos: ['o/other'] })).toEqual([2])
        expect(run({ authors: ['bob'] })).toEqual([2])
        expect(run({ assignees: ['bob'] })).toEqual([1])
        expect(run({ state: 'all' })).toEqual([1, 2, 3, 4])
        expect(run({ milestones: ['(none)'] })).toEqual([1, 2, 3])
    })
    test('only new: updated after the last visit, nothing on a first visit', () => {
        const run = (lastVisit: number | null) =>
            applyFilters(
                fixtures,
                { ...SHOW_ALL, onlyNew: true, state: 'all' },
                {
                    ...ctx,
                    lastVisit
                }
            ).map((i) => i.id)
        expect(run(Date.parse(daysAgo(2)))).toEqual(
            fixtures
                .filter((i) => Date.parse(i.updated_at) > Date.parse(daysAgo(2)))
                .map((i) => i.id)
        )
        expect(run(Date.parse(daysAgo(2))).length).toBeGreaterThan(0)
        expect(run(null)).toEqual([])
        expect(isNew(fixtures[0]!, NOW)).toBe(false)
    })
    test('involvement filters use the involvement sets', () => {
        const involvement = {
            mentioned: new Set([2]),
            reviewRequested: new Set([3]),
            commented: new Set([1, 2])
        }
        const run = (mine: typeof DEFAULT_FILTERS.mine, withSets = true) =>
            applyFilters(
                fixtures,
                { ...SHOW_ALL, mine },
                { ...ctx, viewerLogin: 'alice', involvement: withSets ? involvement : null }
            ).map((i) => i.id)
        expect(run('mentioned')).toEqual([2])
        expect(run('review-requested')).toEqual([3])
        expect(run('commented')).toEqual([1, 2])
        expect(run('mentioned', false)).toEqual([])
    })
    test('"mine" shortcuts use the viewer login', () => {
        const run = (mine: typeof DEFAULT_FILTERS.mine, login: string | null) =>
            applyFilters(fixtures, { ...SHOW_ALL, mine }, { ...ctx, viewerLogin: login }).map(
                (i) => i.id
            )
        expect(run('authored', 'bob')).toEqual([2])
        expect(run('assigned', 'bob')).toEqual([1])
        expect(run('involved', 'bob')).toEqual([1, 2])
        expect(run('involved', null)).toEqual([])
    })
    test('attention filter', () => {
        const run = (attention: typeof DEFAULT_FILTERS.attention) =>
            applyFilters(fixtures, { ...SHOW_ALL, attention, state: 'all' }, ctx).map((i) => i.id)
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
            applyFilters(fixtures, { ...SHOW_ALL, hiddenSources }, ctx).map((i) => i.id)
        expect(run(['user:o'])).toEqual([2])
        expect(run(['user:o', 'repo:o/other'])).toEqual([])
        expect(run(['repo:o/other'])).toEqual([1, 2, 3])
    })
    test('pruneFilters drops selections no visible item can satisfy', () => {
        const f = { ...SHOW_ALL, repos: ['o/other'], labels: ['bug'], authors: ['bob'] }
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

describe('selecting many facet values at once', () => {
    const rows = [{ name: 'acme/Widgets' }, { name: 'acme/gadgets' }, { name: 'other/widgets-cli' }]

    test('matchNames keeps the rows that hold every word, in any order and case', () => {
        expect(matchNames(rows, '')).toBe(rows)
        expect(matchNames(rows, '   ')).toBe(rows)
        expect(matchNames(rows, 'WIDGETS').map((r) => r.name)).toEqual([
            'acme/Widgets',
            'other/widgets-cli'
        ])
        expect(matchNames(rows, 'widgets acme').map((r) => r.name)).toEqual(['acme/Widgets'])
        expect(matchNames(rows, 'nothing')).toEqual([])
    })

    test('selectAll adds only the missing names and keeps the current order', () => {
        expect(selectAll(['b/b'], ['a/a', 'B/B', 'c/c'])).toEqual(['b/b', 'a/a', 'c/c'])
        expect(selectAll([], ['a/a', 'A/A'])).toEqual(['a/a'])
    })

    test('selectAll returns the same list when nothing is missing', () => {
        const selected = ['a/a', 'b/b']
        expect(selectAll(selected, ['A/A'])).toBe(selected)
    })

    test('unselectAll removes the given names only, without case', () => {
        expect(unselectAll(['a/a', 'b/b', 'c/c'], ['A/A', 'c/c', 'z/z'])).toEqual(['b/b'])
        const selected = ['a/a']
        expect(unselectAll(selected, ['z/z'])).toBe(selected)
    })

    test('ticking every repository keeps a repository that shows up later', () => {
        const ctx = { now: NOW, viewerLogin: null, sources: [] }
        const today = [item({ id: 1, repo: 'o/a' }), item({ id: 2, repo: 'o/b' })]
        const later = [...today, item({ id: 3, repo: 'o/new' })]
        const run = (items: Item[], choice: RepoChoice) =>
            applyFilters(items, { ...DEFAULT_FILTERS, ...choice }, ctx).map((i) => i.id)

        expect(run(later, ALL_REPOS)).toEqual([1, 2, 3])
        // All but one: the exclusion holds, and the new repository still shows.
        const butOne = tickRepos(ALL_REPOS, ['O/A'], false)
        expect(butOne).toEqual({ repos: ['O/A'], reposExcluded: true })
        expect(run(today, butOne)).toEqual([2])
        expect(run(later, butOne)).toEqual([2, 3])
        // Ticked again, nothing is left out.
        expect(tickRepos(butOne, ['o/a'], true)).toEqual(ALL_REPOS)
    })

    test('ticking from no filter builds a list of the repositories to keep', () => {
        const only = tickRepos(NO_REPO_CHOICE, ['o/a', 'o/b'], true)
        expect(only).toEqual({ repos: ['o/a', 'o/b'], reposExcluded: false })
        expect(tickRepos(only, ['o/a'], false)).toEqual({ repos: ['o/b'], reposExcluded: false })
    })

    test('isRepoTicked reads the list by its kind, without case', () => {
        expect(isRepoTicked(NO_REPO_CHOICE, 'o/a')).toBe(false)
        expect(isRepoTicked(ALL_REPOS, 'o/a')).toBe(true)
        expect(isRepoTicked({ repos: ['O/A'], reposExcluded: false }, 'o/a')).toBe(true)
        expect(isRepoTicked({ repos: ['O/A'], reposExcluded: true }, 'o/a')).toBe(false)
        expect(isRepoTicked({ repos: ['O/A'], reposExcluded: true }, 'o/b')).toBe(true)
    })

    test('pruneFilters keeps an excluded repository that has no visible item', () => {
        const items = [item({ id: 1, repo: 'o/a' })]
        const excluded = { ...DEFAULT_FILTERS, repos: ['o/gone'], reposExcluded: true }
        expect(pruneFilters(excluded, items, [])).toBe(excluded)
        const kept = { ...DEFAULT_FILTERS, repos: ['o/gone'] }
        expect(pruneFilters(kept, items, []).repos).toEqual([])
    })
})
