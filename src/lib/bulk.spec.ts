import { describe, expect, test } from 'bun:test'
import { applicability, labelOptions, milestoneOptions, rangeIds, runBulk } from './bulk'
import type { Item } from './types'

function item(id: number, repo = 'o/r', labels: string[] = []): Item {
    return {
        id,
        node_id: `N${id}`,
        number: id,
        title: '',
        html_url: '',
        repo,
        type: 'issue',
        state: 'open',
        draft: false,
        labels: labels.map((name) => ({ name, color: '000000', description: null })),
        author: null,
        assignees: [],
        comments: 0,
        reactions: 0,
        created_at: '',
        updated_at: '',
        milestone: null
    }
}

describe('runBulk', () => {
    test('runs every item in order, collects failures, reports progress', async () => {
        const seen: number[] = []
        const progress: string[] = []
        const failures = await runBulk(
            [item(1), item(2), item(3)],
            async (i) => {
                await Promise.resolve()
                seen.push(i.id)
                if (i.id === 2) throw new Error('nope')
            },
            (d, t) => progress.push(`${d}/${t}`)
        )
        expect(seen).toEqual([1, 2, 3])
        expect(failures.map((f) => [f.item.id, f.message])).toEqual([[2, 'nope']])
        expect(progress).toEqual(['0/3', '1/3', '2/3', '3/3'])
    })
    test('stops when aborted', async () => {
        const controller = new AbortController()
        const seen: number[] = []
        await runBulk(
            [item(1), item(2)],
            async (i) => {
                await Promise.resolve()
                seen.push(i.id)
                controller.abort()
            },
            undefined,
            controller.signal
        )
        expect(seen).toEqual([1])
    })
})

describe('rangeIds', () => {
    const order = [5, 3, 9, 1, 7]
    test('both directions, inclusive', () => {
        expect(rangeIds(order, 3, 1)).toEqual([3, 9, 1])
        expect(rangeIds(order, 7, 9)).toEqual([9, 1, 7])
    })
    test('no anchor, or an anchor no longer shown, selects only the target', () => {
        expect(rangeIds(order, null, 9)).toEqual([9])
        expect(rangeIds(order, 42, 9)).toEqual([9])
    })
})

describe('applicability', () => {
    test('hints only when some items are left out', () => {
        const items = [item(1), item(2, 'x/y'), item(3)]
        expect(applicability(items, (i) => i.repo === 'o/r').hint).toBe('applies to 2 of 3')
        expect(applicability(items, () => true).hint).toBe('')
        expect(applicability(items, () => false).none).toBe(true)
    })
})

describe('labelOptions', () => {
    test('counts availability per repository and existing use, case-insensitively', () => {
        const options = labelOptions([item(1, 'a/a', ['Bug']), item(2, 'b/b'), item(3, 'c/c')], {
            'a/a': [{ name: 'bug', color: 'f00' }],
            'b/b': [
                { name: 'Bug', color: 'f00' },
                { name: 'docs', color: '00f' }
            ]
        })
        expect(options).toEqual([
            { name: 'bug', color: 'f00', available: 2, applied: 1 },
            { name: 'docs', color: '00f', available: 1, applied: 0 }
        ])
    })
})

describe('milestoneOptions', () => {
    test('matches titles across repositories and lists the ones missing it', () => {
        const a = { ...item(1, 'a/a'), milestone: 'v2' }
        const options = milestoneOptions([a, item(2, 'b/b'), item(3, 'b/b')], {
            'a/a': [{ title: 'v2' }],
            'b/b': [{ title: 'V2' }, { title: 'later' }]
        })
        expect(options).toEqual([
            { title: 'v2', available: 3, applied: 1, missingRepos: [] },
            { title: 'later', available: 2, applied: 0, missingRepos: ['a/a'] }
        ])
    })
})
