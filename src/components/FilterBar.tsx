import clsx from 'clsx'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { usePopoverPlacement } from '@/hooks/usePopoverPlacement'
import { DORMANT_DAYS, type Facets } from '@/lib/filtering'
import type { RepoStatus } from '@/lib/noise'
import { DEFAULT_FILTERS, NO_MILESTONE, NO_PROJECT, type Filters, type Viewer } from '@/lib/types'
import { RepoStatusTag } from './RepoStatusTag'
import { Avatar, Button, Chip, LabelChip } from './ui'

interface Props {
    filters: Filters
    facets: Facets
    viewer: Viewer | null
    /** Items per repository status, before the archived / dormant toggles apply. */
    repoStatuses?: Record<RepoStatus, number>
    onChange: (f: Filters) => void
}

function toggle(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

export function FilterBar({ filters, facets, viewer, repoStatuses, onChange }: Props) {
    const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch })
    const activeCount =
        filters.labels.length +
        filters.repos.length +
        filters.authors.length +
        filters.assignees.length +
        filters.milestones.length +
        filters.projects.length
    const isDefault = JSON.stringify(filters) === JSON.stringify(DEFAULT_FILTERS)

    return (
        <div className='bg-surface border-line shadow-card rounded-xl border p-3'>
            <div className='flex flex-wrap items-center gap-2'>
                <div className='relative min-w-[14rem] flex-1'>
                    <input
                        id='radar-search'
                        value={filters.text}
                        onChange={(e) => set({ text: e.target.value })}
                        placeholder='Search title, repo, #number, author, label…'
                        aria-label='Search'
                        className='bg-well border-line focus:border-secondary-text w-full rounded-lg border py-2 pr-8 pl-3 text-sm outline-none'
                    />
                    {filters.text && (
                        <button
                            type='button'
                            onClick={() => set({ text: '' })}
                            className='text-faint absolute top-1/2 right-2 -translate-y-1/2 text-lg leading-none hover:text-white'
                            aria-label='Clear search'
                        >
                            ×
                        </button>
                    )}
                </div>
                <Segmented
                    value={filters.type}
                    options={[
                        ['all', 'All'],
                        ['issue', 'Issues'],
                        ['pr', 'PRs']
                    ]}
                    onChange={(type) => set({ type })}
                />
                <Segmented
                    value={filters.state}
                    options={[
                        ['open', 'Open'],
                        ['closed', 'Closed'],
                        ['all', 'Any']
                    ]}
                    onChange={(state) => set({ state })}
                />
                <Dropdown label='Labels' count={filters.labels.length}>
                    {facets.labels.length === 0 && <Empty />}
                    <div className='flex flex-wrap gap-1.5 p-1'>
                        {facets.labels.map((l) => (
                            <span key={l.name} className='inline-flex items-center gap-1'>
                                <LabelChip
                                    label={{ name: l.name, color: l.color, description: null }}
                                    active={filters.labels.includes(l.name)}
                                    onClick={() => set({ labels: toggle(filters.labels, l.name) })}
                                />
                                <span className='text-faint text-[10px]'>{l.count}</span>
                            </span>
                        ))}
                    </div>
                </Dropdown>
                <Dropdown label='Repos' count={filters.repos.length}>
                    {facets.repos.length === 0 && <Empty />}
                    {facets.repos.map((r) => (
                        <Row
                            key={r.name}
                            active={filters.repos.includes(r.name)}
                            onClick={() => set({ repos: toggle(filters.repos, r.name) })}
                            count={r.count}
                        >
                            <span className='truncate'>{r.name}</span>
                            <RepoStatusTag repo={r.name} />
                        </Row>
                    ))}
                </Dropdown>
                <Dropdown label='Authors' count={filters.authors.length}>
                    {facets.authors.length === 0 && <Empty />}
                    {facets.authors.map((a) => (
                        <Row
                            key={a.login}
                            active={filters.authors.includes(a.login)}
                            onClick={() => set({ authors: toggle(filters.authors, a.login) })}
                            count={a.count}
                        >
                            <Avatar actor={{ ...a, html_url: '' }} size={16} />
                            <span className='truncate'>{a.login}</span>
                        </Row>
                    ))}
                </Dropdown>
                <Dropdown label='Assignees' count={filters.assignees.length}>
                    {facets.assignees.length === 0 && <Empty text='Nothing is assigned.' />}
                    {facets.assignees.map((a) => (
                        <Row
                            key={a.login}
                            active={filters.assignees.includes(a.login)}
                            onClick={() => set({ assignees: toggle(filters.assignees, a.login) })}
                            count={a.count}
                        >
                            <Avatar actor={{ ...a, html_url: '' }} size={16} />
                            <span className='truncate'>{a.login}</span>
                        </Row>
                    ))}
                </Dropdown>
                <Dropdown label='Milestones' count={filters.milestones.length}>
                    {facets.milestones.map((m) => (
                        <Row
                            key={m.title}
                            active={filters.milestones.includes(m.title)}
                            onClick={() => set({ milestones: toggle(filters.milestones, m.title) })}
                            count={m.count}
                        >
                            <span
                                className={clsx('truncate', m.title === NO_MILESTONE && 'italic')}
                            >
                                {m.title === NO_MILESTONE ? 'No milestone' : `◆ ${m.title}`}
                            </span>
                            {m.repos > 1 && m.title !== NO_MILESTONE && (
                                <span className='text-faint shrink-0 text-[10px]'>
                                    {m.repos} repos
                                </span>
                            )}
                        </Row>
                    ))}
                </Dropdown>
                {facets.projects.length > 0 && (
                    <Dropdown label='Projects' count={filters.projects.length}>
                        {facets.projects.map((p) => (
                            <Row
                                key={p.id}
                                active={filters.projects.includes(p.id)}
                                onClick={() => set({ projects: toggle(filters.projects, p.id) })}
                                count={p.count}
                            >
                                <span className={clsx('truncate', p.id === NO_PROJECT && 'italic')}>
                                    {p.id === NO_PROJECT ? 'Not in any project' : `▦ ${p.title}`}
                                </span>
                            </Row>
                        ))}
                    </Dropdown>
                )}
                <Select
                    value={filters.attention}
                    onChange={(attention) => set({ attention })}
                    ariaLabel='Needs attention'
                    active='bg-accent-yellow/15 text-accent-yellow'
                    options={[
                        ['any', 'Attention: any'],
                        ['stale', 'Stale (30+ days)'],
                        ['dormant', 'Dormant (90+ days)'],
                        ['unlabeled', 'Unlabeled'],
                        ['unassigned', 'Unassigned'],
                        ['draft', 'Draft PRs']
                    ]}
                />
                {viewer && (
                    <Select
                        value={filters.review}
                        onChange={(review) => set({ review })}
                        ariaLabel='Pull request review and CI state'
                        active='bg-secondary/20 text-secondary-text'
                        options={[
                            ['any', 'Reviews: any'],
                            ['needs-my-review', 'Needs my review'],
                            ['review-required', 'Review required'],
                            ['approved', 'Approved'],
                            ['changes-requested', 'Changes requested'],
                            ['failing', 'Failing checks'],
                            ['ready', 'Green and approved']
                        ]}
                    />
                )}
                <Select
                    value={filters.sort}
                    onChange={(sort) => set({ sort })}
                    ariaLabel='Sort'
                    options={[
                        ['updated', 'Recently updated'],
                        ['created', 'Newest'],
                        ['comments', 'Most discussed'],
                        ['title', 'Title A–Z']
                    ]}
                />
                <Select
                    value={filters.group}
                    onChange={(group) => set({ group })}
                    ariaLabel='Group by'
                    options={[
                        ['none', 'No grouping'],
                        ['repo', 'Group by repo'],
                        ['author', 'Group by author']
                    ]}
                />
                <Chip
                    active={filters.hideDrafts}
                    onClick={() => set({ hideDrafts: !filters.hideDrafts })}
                >
                    Hide drafts
                </Chip>
                <Chip
                    active={filters.hideBots}
                    onClick={() => set({ hideBots: !filters.hideBots })}
                    title='Hide items opened by bots (Dependabot, Renovate, GitHub Actions, apps)'
                >
                    Hide bots
                </Chip>
                <Chip
                    active={filters.hideArchived}
                    onClick={() => set({ hideArchived: !filters.hideArchived })}
                    title='Hide items of archived repositories'
                >
                    Hide archived
                    {repoStatuses && repoStatuses.archived > 0 && (
                        <span className='opacity-70'>{repoStatuses.archived}</span>
                    )}
                </Chip>
                <Chip
                    active={filters.hideDormant}
                    onClick={() => set({ hideDormant: !filters.hideDormant })}
                    title={`Hide items of dormant repositories (nothing pushed for ${DORMANT_DAYS}+ days)`}
                >
                    Hide dormant repos
                    {repoStatuses && repoStatuses.dormant > 0 && (
                        <span className='opacity-70'>{repoStatuses.dormant}</span>
                    )}
                </Chip>
                {viewer && (
                    <Segmented
                        value={filters.mine}
                        options={[
                            ['any', 'Everyone'],
                            ['involved', 'Mine'],
                            ['assigned', 'Assigned to me'],
                            ['authored', 'By me']
                        ]}
                        onChange={(mine) => set({ mine })}
                    />
                )}
                {viewer && (
                    <Segmented
                        value={filters.mine}
                        options={[
                            ['mentioned', 'Mentions me'],
                            ['review-requested', 'Review requested'],
                            ['commented', 'Commented']
                        ]}
                        onChange={(mine) => set({ mine: filters.mine === mine ? 'any' : mine })}
                    />
                )}
                {!isDefault && (
                    <Button
                        variant='ghost'
                        size='sm'
                        onClick={() => onChange(DEFAULT_FILTERS)}
                        className='ml-auto'
                    >
                        Reset{activeCount > 0 ? ` (${activeCount})` : ''}
                    </Button>
                )}
            </div>
            {activeCount > 0 && (
                <div className='mt-2 flex flex-wrap gap-1.5'>
                    {filters.labels.map((l) => {
                        const facet = facets.labels.find((f) => f.name === l)
                        return (
                            <LabelChip
                                key={`l-${l}`}
                                label={{
                                    name: l,
                                    color: facet?.color ?? '555555',
                                    description: 'Click to remove'
                                }}
                                onClick={() => set({ labels: toggle(filters.labels, l) })}
                            />
                        )
                    })}
                    {filters.repos.map((r) => (
                        <Chip
                            key={`r-${r}`}
                            active
                            onClick={() => set({ repos: toggle(filters.repos, r) })}
                        >
                            {r} ×
                        </Chip>
                    ))}
                    {filters.authors.map((a) => (
                        <Chip
                            key={`a-${a}`}
                            active
                            onClick={() => set({ authors: toggle(filters.authors, a) })}
                        >
                            by {a} ×
                        </Chip>
                    ))}
                    {filters.milestones.map((m) => (
                        <Chip
                            key={`m-${m}`}
                            active
                            onClick={() => set({ milestones: toggle(filters.milestones, m) })}
                        >
                            {m === NO_MILESTONE ? 'no milestone' : `◆ ${m}`} ×
                        </Chip>
                    ))}
                    {filters.projects.map((id) => (
                        <Chip
                            key={`p-${id}`}
                            active
                            onClick={() => set({ projects: toggle(filters.projects, id) })}
                        >
                            {id === NO_PROJECT
                                ? 'in no project'
                                : `▦ ${facets.projects.find((p) => p.id === id)?.title ?? 'project'}`}{' '}
                            ×
                        </Chip>
                    ))}
                    {filters.assignees.map((a) => (
                        <Chip
                            key={`s-${a}`}
                            active
                            onClick={() => set({ assignees: toggle(filters.assignees, a) })}
                        >
                            assigned {a} ×
                        </Chip>
                    ))}
                </div>
            )}
        </div>
    )
}

function Segmented<T extends string>({
    value,
    options,
    onChange
}: {
    value: T
    options: Array<[T, string]>
    onChange: (v: T) => void
}) {
    return (
        <div className='bg-well inline-flex rounded-lg p-0.5' role='group'>
            {options.map(([v, label]) => (
                <button
                    key={v}
                    type='button'
                    onClick={() => onChange(v)}
                    aria-pressed={value === v}
                    className={clsx(
                        'rounded-md px-2.5 py-1 text-xs font-semibold transition',
                        value === v ? 'bg-secondary text-white' : 'text-muted hover:text-white'
                    )}
                >
                    {label}
                </button>
            ))}
        </div>
    )
}

function Dropdown({
    label,
    count = 0,
    active,
    title,
    ariaLabel,
    children
}: {
    label: ReactNode
    count?: number
    /** Highlight classes for the trigger when the filter is set (defaults to the count style). */
    active?: string
    title?: string
    ariaLabel?: string
    /** The panel's content; a function gets `close` to shut the panel after a choice. */
    children: ReactNode | ((close: () => void) => ReactNode)
}) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)
    const panel = useRef<HTMLDivElement>(null)
    usePopoverPlacement(open, ref, panel)
    useEffect(() => {
        if (!open) return
        const onDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false)
        }
        document.addEventListener('mousedown', onDown)
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('mousedown', onDown)
            document.removeEventListener('keydown', onKey)
        }
    }, [open])
    return (
        <div ref={ref} className='relative'>
            <button
                type='button'
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                aria-label={ariaLabel}
                title={title}
                className={clsx(
                    'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition',
                    active ??
                        (count > 0
                            ? 'bg-secondary/20 text-secondary-text'
                            : 'bg-well text-muted hover:text-white')
                )}
            >
                {label}
                {count > 0 && (
                    <span className='bg-secondary rounded-full px-1.5 text-[10px] text-white'>
                        {count}
                    </span>
                )}
                <span aria-hidden className='text-[9px]'>
                    ▼
                </span>
            </button>
            {open && (
                <div
                    ref={panel}
                    className='bg-surface-elevated border-line shadow-card fade-in absolute z-40 my-1 max-h-80 w-72 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border p-1.5'
                >
                    {typeof children === 'function' ? children(() => setOpen(false)) : children}
                </div>
            )}
        </div>
    )
}

/** A single choice, styled like the multi-select dropdowns (replaces a native select). */
function Select<T extends string>({
    value,
    options,
    onChange,
    ariaLabel,
    title,
    active
}: {
    value: T
    options: Array<[T, string]>
    onChange: (v: T) => void
    ariaLabel: string
    title?: string
    /** Trigger classes when a non-default value is chosen. */
    active?: string
}) {
    const current = options.find(([v]) => v === value)?.[1] ?? value
    const isDefault = value === options[0]?.[0]
    return (
        <Dropdown
            label={current}
            ariaLabel={ariaLabel}
            title={title ?? ariaLabel}
            active={!isDefault && active ? active : 'bg-well text-muted hover:text-white'}
        >
            {(close) => (
                <div role='listbox' aria-label={ariaLabel}>
                    {options.map(([v, label]) => (
                        <button
                            key={v}
                            type='button'
                            role='option'
                            aria-selected={v === value}
                            onClick={() => {
                                onChange(v)
                                close()
                            }}
                            className={clsx(
                                'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm',
                                v === value ? 'bg-secondary/25' : 'hover:bg-white/8'
                            )}
                        >
                            <span aria-hidden className='w-3 shrink-0 text-xs'>
                                {v === value ? '✓' : ''}
                            </span>
                            {label}
                        </button>
                    ))}
                </div>
            )}
        </Dropdown>
    )
}

function Row({
    active,
    onClick,
    count,
    children
}: {
    active: boolean
    onClick: () => void
    count: number
    children: ReactNode
}) {
    return (
        <button
            type='button'
            onClick={onClick}
            className={clsx(
                'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm',
                active ? 'bg-secondary/25' : 'hover:bg-white/8'
            )}
        >
            <span
                className={clsx(
                    'h-3.5 w-3.5 shrink-0 rounded border',
                    active ? 'bg-secondary border-secondary' : 'border-white/30'
                )}
            />
            {children}
            <span className='text-faint ml-auto text-xs'>{count}</span>
        </button>
    )
}

function Empty({ text = 'Nothing to filter on yet.' }: { text?: string }) {
    return <p className='text-faint px-2 py-1.5 text-xs'>{text}</p>
}
