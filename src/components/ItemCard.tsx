import clsx from 'clsx'
import { attentionFlags } from '@/lib/filtering'
import type { Item } from '@/lib/types'
import { pluralize, timeAgo } from '@/lib/utils'
import { PrBadges } from './PrBadges'
import { RepoMenu } from './RepoMenu'
import { Avatar, IssueIcon, LabelChip, PullRequestIcon } from './ui'

interface Props {
    item: Item
    viewerLogin: string | null
    now: number
    selected: boolean
    onSelect: () => void
    /** Present when bulk selection is available (logged in). */
    checked?: boolean
    onCheck?: (range: boolean) => void
    onLabelClick: (name: string) => void
    onRepoClick: (repo: string) => void
    onToast: (msg: string) => void
}

export function ItemCard({
    item,
    viewerLogin,
    now,
    selected,
    onSelect,
    checked,
    onCheck,
    onLabelClick,
    onRepoClick,
    onToast
}: Props) {
    const flags = attentionFlags(item, now)
    const idle = flags.includes('dormant') ? 'dormant' : flags.includes('stale') ? 'stale' : null
    return (
        <article
            className={clsx(
                'bg-surface border-line group hover:shadow-card cursor-pointer rounded-xl border p-3.5 transition hover:-translate-y-px',
                selected && 'ring-secondary-text/60 ring-2',
                checked && 'border-secondary/70 bg-secondary/10'
            )}
            onClick={onSelect}
        >
            <div className='flex items-start gap-3'>
                {onCheck && (
                    <input
                        type='checkbox'
                        checked={checked ?? false}
                        onChange={() => {}}
                        onClick={(e) => {
                            e.stopPropagation()
                            onCheck(e.shiftKey)
                        }}
                        aria-label={`Select ${item.repo}#${item.number}`}
                        title='Select (shift-click for a range)'
                        className='accent-secondary mt-1 h-4 w-4 shrink-0 cursor-pointer'
                    />
                )}
                <span
                    className={clsx(
                        'mt-0.5 shrink-0',
                        item.state === 'closed'
                            ? 'text-accent-purple'
                            : item.draft
                              ? 'text-faint'
                              : item.type === 'pr'
                                ? 'text-success'
                                : 'text-success'
                    )}
                    title={`${item.draft ? 'Draft ' : ''}${item.type === 'pr' ? 'pull request' : 'issue'} · ${item.state}`}
                >
                    {item.type === 'pr' ? <PullRequestIcon /> : <IssueIcon />}
                </span>
                <div className='min-w-0 flex-1'>
                    <div className='text-faint flex flex-wrap items-center gap-x-2 text-xs'>
                        <button
                            type='button'
                            onClick={(e) => {
                                e.stopPropagation()
                                onRepoClick(item.repo)
                            }}
                            title={`Only show ${item.repo}`}
                            className='truncate font-medium hover:text-white hover:underline'
                        >
                            {item.repo}
                        </button>
                        <RepoMenu repo={item.repo} onToast={onToast} subtle />
                        <span>#{item.number}</span>
                        {item.draft && (
                            <span className='rounded bg-white/10 px-1.5 text-[10px] font-semibold uppercase'>
                                draft
                            </span>
                        )}
                        {item.pr && <PrBadges pr={item.pr} viewerLogin={viewerLogin} />}
                        {idle && (
                            <span
                                className={clsx(
                                    'rounded px-1.5 text-[10px] font-semibold uppercase',
                                    idle === 'dormant'
                                        ? 'bg-red-500/20 text-red-200'
                                        : 'bg-accent-yellow/20 text-accent-yellow'
                                )}
                                title={`No activity for ${idle === 'dormant' ? '90' : '30'}+ days`}
                            >
                                {idle}
                            </span>
                        )}
                        {item.milestone && (
                            <span className='text-faint truncate'>◆ {item.milestone}</span>
                        )}
                    </div>
                    <h3 className='mt-0.5 leading-snug font-semibold break-words'>
                        <a
                            href={item.html_url}
                            target='_blank'
                            rel='noreferrer'
                            onClick={(e) => e.stopPropagation()}
                            className='hover:text-secondary-text'
                        >
                            {item.title}
                        </a>
                    </h3>
                    {item.labels.length > 0 && (
                        <div
                            className='mt-1.5 flex flex-wrap gap-1'
                            onClick={(e) => e.stopPropagation()}
                        >
                            {item.labels.map((l) => (
                                <LabelChip
                                    key={l.name}
                                    label={l}
                                    onClick={() => onLabelClick(l.name)}
                                />
                            ))}
                        </div>
                    )}
                </div>
                <div className='text-muted flex shrink-0 flex-col items-end gap-1 text-xs'>
                    <span title={`Updated ${new Date(item.updated_at).toLocaleString()}`}>
                        {timeAgo(item.updated_at, now)}
                    </span>
                    <span className='flex items-center gap-2'>
                        {item.comments > 0 && (
                            <span title={pluralize(item.comments, 'comment')}>
                                💬 {item.comments}
                            </span>
                        )}
                        {item.reactions > 0 && (
                            <span title={pluralize(item.reactions, 'reaction')}>
                                👍 {item.reactions}
                            </span>
                        )}
                    </span>
                    <span className='flex items-center gap-1'>
                        {item.author && <Avatar actor={item.author} size={18} />}
                        {item.assignees.length > 0 && (
                            <span
                                className='flex items-center gap-0.5 border-l border-white/15 pl-1'
                                title={`Assigned: ${item.assignees.map((a) => a.login).join(', ')}`}
                            >
                                {item.assignees.slice(0, 3).map((a) => (
                                    <Avatar key={a.login} actor={a} size={16} />
                                ))}
                            </span>
                        )}
                    </span>
                </div>
            </div>
        </article>
    )
}
