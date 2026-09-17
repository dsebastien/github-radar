import clsx from 'clsx'
import { attentionFlags } from '@/lib/filtering'
import type { Item } from '@/lib/types'
import { pluralize, timeAgo } from '@/lib/utils'
import { Avatar, IssueIcon, LabelChip, PullRequestIcon } from './ui'

interface Props {
    item: Item
    now: number
    selected: boolean
    onSelect: () => void
    onLabelClick: (name: string) => void
}

export function ItemCard({ item, now, selected, onSelect, onLabelClick }: Props) {
    const flags = attentionFlags(item, now)
    const idle = flags.includes('dormant') ? 'dormant' : flags.includes('stale') ? 'stale' : null
    return (
        <article
            className={clsx(
                'bg-surface border-line group hover:shadow-card cursor-pointer rounded-xl border p-3.5 transition hover:-translate-y-px',
                selected && 'ring-secondary-text/60 ring-2'
            )}
            onClick={onSelect}
        >
            <div className='flex items-start gap-3'>
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
                        <span className='truncate font-medium'>{item.repo}</span>
                        <span>#{item.number}</span>
                        {item.draft && (
                            <span className='rounded bg-white/10 px-1.5 text-[10px] font-semibold uppercase'>
                                draft
                            </span>
                        )}
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
                    <h3 className='mt-0.5 leading-snug font-semibold'>
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
