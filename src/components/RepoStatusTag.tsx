import clsx from 'clsx'
import { DORMANT_DAYS } from '@/lib/filtering'
import { useRepoActions } from './RepoActions'

/** "archived" / "dormant" tag next to a repository name; nothing for active repositories. */
export function RepoStatusTag({ repo, className }: { repo: string; className?: string }) {
    const status = useRepoActions()?.status(repo) ?? null
    if (!status) return null
    return (
        <span
            title={
                status === 'archived'
                    ? 'Archived repository: read-only on GitHub'
                    : `Dormant repository: nothing pushed for ${DORMANT_DAYS}+ days`
            }
            className={clsx(
                'shrink-0 rounded px-1 text-[10px] font-semibold tracking-wide uppercase',
                status === 'archived'
                    ? 'bg-white/10 text-white/60'
                    : 'bg-accent-yellow/15 text-accent-yellow',
                className
            )}
        >
            {status}
        </span>
    )
}
