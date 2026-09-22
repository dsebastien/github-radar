import type {
    ChecksState,
    Item,
    MergeableState,
    PrDetails,
    ReviewFilter,
    ReviewState
} from './types'

/** GraphQL `nodes(ids:)` accepts at most 100 ids per query. */
export const ENRICH_BATCH = 100

/** The subset of a GraphQL PullRequest node the enrichment asks for. */
export interface RawPrNode {
    id: string
    isDraft: boolean
    reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null
    mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN'
    commits: {
        nodes: Array<{
            commit: {
                statusCheckRollup: {
                    state: 'SUCCESS' | 'FAILURE' | 'ERROR' | 'PENDING' | 'EXPECTED'
                } | null
            }
        }>
    }
    reviewRequests: { nodes: Array<{ requestedReviewer: { login?: string } | null }> }
}

/**
 * Open pull requests whose details are missing or out of date: never enriched, updated since,
 * or still settling (checks running, mergeability not computed yet).
 */
export function needsEnrichment(items: Item[]): Item[] {
    return items.filter(
        (i) =>
            i.type === 'pr' &&
            i.state === 'open' &&
            i.node_id &&
            (!i.pr ||
                i.pr.for !== i.updated_at ||
                i.pr.checks === 'pending' ||
                i.pr.mergeable === 'unknown')
    )
}

export function toPrDetails(raw: RawPrNode, updatedAt: string): PrDetails {
    const review: ReviewState =
        raw.reviewDecision === 'APPROVED'
            ? 'approved'
            : raw.reviewDecision === 'CHANGES_REQUESTED'
              ? 'changes_requested'
              : raw.reviewDecision === 'REVIEW_REQUIRED'
                ? 'review_required'
                : 'none'
    const rollup = raw.commits.nodes[0]?.commit.statusCheckRollup?.state
    const checks: ChecksState =
        rollup === 'SUCCESS'
            ? 'success'
            : rollup === 'FAILURE' || rollup === 'ERROR'
              ? 'failure'
              : rollup === 'PENDING' || rollup === 'EXPECTED'
                ? 'pending'
                : 'none'
    const mergeable: MergeableState =
        raw.mergeable === 'MERGEABLE'
            ? 'mergeable'
            : raw.mergeable === 'CONFLICTING'
              ? 'conflicting'
              : 'unknown'
    return {
        review,
        checks,
        mergeable,
        reviewRequests: raw.reviewRequests.nodes.flatMap((n) =>
            n.requestedReviewer?.login ? [n.requestedReviewer.login] : []
        ),
        for: updatedAt
    }
}

/** Merge enrichment results into items, by node id. Items without a result are unchanged. */
export function applyEnrichment(items: Item[], nodes: RawPrNode[]): Item[] {
    const byNode = new Map(nodes.map((n) => [n.id, n]))
    return items.map((i) => {
        const n = byNode.get(i.node_id)
        return n ? { ...i, draft: n.isDraft, pr: toPrDetails(n, i.updated_at) } : i
    })
}

/**
 * A freshly searched item replaces the cached one; keep the cached details so they do not
 * flicker away until the next enrichment. needsEnrichment() tells when they are outdated.
 */
export function carryEnrichment(prev: Item | undefined, next: Item): Item {
    return prev?.pr && !next.pr ? { ...next, pr: prev.pr } : next
}

export function matchesReview(item: Item, filter: ReviewFilter, viewerLogin: string | null) {
    if (filter === 'any') return true
    const pr = item.pr
    if (item.type !== 'pr' || !pr) return false
    switch (filter) {
        case 'needs-my-review': {
            const me = viewerLogin?.toLowerCase()
            return !!me && pr.reviewRequests.some((r) => r.toLowerCase() === me)
        }
        case 'review-required':
            return pr.review === 'review_required'
        case 'approved':
            return pr.review === 'approved'
        case 'changes-requested':
            return pr.review === 'changes_requested'
        case 'failing':
            return pr.checks === 'failure'
        case 'ready':
            return (
                pr.review === 'approved' &&
                (pr.checks === 'success' || pr.checks === 'none') &&
                pr.mergeable !== 'conflicting' &&
                !item.draft
            )
    }
}
