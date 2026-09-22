import clsx from 'clsx'
import type { PrDetails } from '@/lib/types'

const REVIEW: Record<PrDetails['review'], { text: string; className: string; title: string }> = {
    approved: { text: '✓ approved', className: 'bg-success/20 text-success', title: 'Approved' },
    changes_requested: {
        text: '✗ changes',
        className: 'bg-red-500/20 text-red-200',
        title: 'Changes requested'
    },
    review_required: {
        text: 'review',
        className: 'bg-accent-yellow/20 text-accent-yellow',
        title: 'Review required'
    },
    none: { text: '', className: '', title: '' }
}

const CHECKS: Record<PrDetails['checks'], { dot: string; title: string }> = {
    success: { dot: 'bg-success', title: 'Checks passing' },
    failure: { dot: 'bg-red-400', title: 'Checks failing' },
    pending: { dot: 'bg-accent-yellow animate-pulse', title: 'Checks running' },
    none: { dot: '', title: '' }
}

/** Review decision, CI rollup and merge conflicts of an enriched pull request. */
export function PrBadges({ pr, viewerLogin }: { pr: PrDetails; viewerLogin: string | null }) {
    const review = REVIEW[pr.review]
    const checks = CHECKS[pr.checks]
    const mine =
        viewerLogin !== null &&
        pr.reviewRequests.some((r) => r.toLowerCase() === viewerLogin.toLowerCase())
    const badge = 'rounded px-1.5 text-[10px] font-semibold uppercase'
    return (
        <>
            {pr.checks !== 'none' && (
                <span className='inline-flex items-center gap-1' title={checks.title}>
                    <span className={clsx('h-2 w-2 rounded-full', checks.dot)} />
                    <span className='sr-only'>{checks.title}</span>
                </span>
            )}
            {pr.review !== 'none' && (
                <span className={clsx(badge, review.className)} title={review.title}>
                    {review.text}
                </span>
            )}
            {mine && (
                <span className={clsx(badge, 'bg-secondary/25 text-secondary-text')}>
                    your review
                </span>
            )}
            {pr.mergeable === 'conflicting' && (
                <span className={clsx(badge, 'bg-red-500/20 text-red-200')} title='Merge conflicts'>
                    conflicts
                </span>
            )}
        </>
    )
}
