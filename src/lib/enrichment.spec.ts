import { describe, expect, test } from 'bun:test'
import {
    applyEnrichment,
    carryEnrichment,
    matchesReview,
    needsEnrichment,
    type RawPrNode
} from './enrichment'
import type { Item, PrDetails } from './types'

function item(over: Partial<Item> & { id: number }): Item {
    return {
        node_id: `N${over.id}`,
        number: over.id,
        title: `Item ${over.id}`,
        html_url: '',
        repo: 'o/r',
        type: 'pr',
        state: 'open',
        draft: false,
        labels: [],
        author: null,
        assignees: [],
        comments: 0,
        reactions: 0,
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-10T00:00:00Z',
        milestone: null,
        ...over
    }
}

const details = (over: Partial<PrDetails> = {}): PrDetails => ({
    review: 'none',
    checks: 'success',
    mergeable: 'mergeable',
    reviewRequests: [],
    for: '2026-09-10T00:00:00Z',
    ...over
})

const node = (id: string, over: Partial<RawPrNode> = {}): RawPrNode => ({
    id,
    isDraft: false,
    reviewDecision: null,
    mergeable: 'MERGEABLE',
    commits: { nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }] },
    reviewRequests: { nodes: [] },
    ...over
})

describe('needsEnrichment', () => {
    test('open PRs never enriched, outdated, or still settling', () => {
        const items = [
            item({ id: 1 }),
            item({ id: 2, pr: details() }),
            item({ id: 3, pr: details({ for: '2026-09-01T00:00:00Z' }) }),
            item({ id: 4, pr: details({ checks: 'pending' }) }),
            item({ id: 5, pr: details({ mergeable: 'unknown' }) }),
            item({ id: 6, type: 'issue' }),
            item({ id: 7, state: 'closed' })
        ]
        expect(needsEnrichment(items).map((i) => i.id)).toEqual([1, 3, 4, 5])
    })
})

describe('applyEnrichment', () => {
    test('maps GraphQL states and matches by node id', () => {
        const [a, b] = applyEnrichment(
            [item({ id: 1 }), item({ id: 2 })],
            [
                node('N1', {
                    reviewDecision: 'CHANGES_REQUESTED',
                    mergeable: 'CONFLICTING',
                    isDraft: true,
                    commits: { nodes: [{ commit: { statusCheckRollup: { state: 'ERROR' } } }] },
                    reviewRequests: {
                        nodes: [
                            { requestedReviewer: { login: 'me' } },
                            { requestedReviewer: {} },
                            { requestedReviewer: null }
                        ]
                    }
                })
            ]
        )
        expect(a!.pr).toEqual({
            review: 'changes_requested',
            checks: 'failure',
            mergeable: 'conflicting',
            reviewRequests: ['me'],
            for: '2026-09-10T00:00:00Z'
        })
        expect(a!.draft).toBe(true)
        expect(b!.pr).toBeUndefined()
    })

    test('no commits or no checks means no CI state', () => {
        const [a] = applyEnrichment([item({ id: 1 })], [node('N1', { commits: { nodes: [] } })])
        expect(a!.pr!.checks).toBe('none')
    })
})

describe('carryEnrichment', () => {
    test('keeps cached details on a fresh search result', () => {
        const prev = item({ id: 1, pr: details() })
        expect(carryEnrichment(prev, item({ id: 1 })).pr).toEqual(details())
        expect(carryEnrichment(undefined, item({ id: 1 })).pr).toBeUndefined()
    })
})

describe('matchesReview', () => {
    test('needs my review is case-insensitive and needs a viewer', () => {
        const i = item({ id: 1, pr: details({ reviewRequests: ['Me'] }) })
        expect(matchesReview(i, 'needs-my-review', 'me')).toBe(true)
        expect(matchesReview(i, 'needs-my-review', null)).toBe(false)
    })
    test('ready means approved, green or no checks, no conflict, not a draft', () => {
        const approved = details({ review: 'approved' })
        expect(matchesReview(item({ id: 1, pr: approved }), 'ready', null)).toBe(true)
        expect(
            matchesReview(item({ id: 1, pr: { ...approved, checks: 'failure' } }), 'ready', null)
        ).toBe(false)
        expect(
            matchesReview(
                item({ id: 1, pr: { ...approved, mergeable: 'conflicting' } }),
                'ready',
                null
            )
        ).toBe(false)
        expect(matchesReview(item({ id: 1, draft: true, pr: approved }), 'ready', null)).toBe(false)
    })
    test('issues and unenriched PRs never match a review filter', () => {
        expect(matchesReview(item({ id: 1, type: 'issue' }), 'failing', null)).toBe(false)
        expect(matchesReview(item({ id: 1 }), 'approved', null)).toBe(false)
        expect(matchesReview(item({ id: 1 }), 'any', null)).toBe(true)
    })
})
