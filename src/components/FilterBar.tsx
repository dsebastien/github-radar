import clsx from 'clsx'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Facets } from '@/lib/filtering'
import { DEFAULT_FILTERS, type Filters, type Viewer } from '@/lib/types'
import { Avatar, Button, Chip, LabelChip } from './ui'

interface Props {
    filters: Filters
    facets: Facets
    viewer: Viewer | null
    onChange: (f: Filters) => void
}

function toggle(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

export function FilterBar({ filters, facets, viewer, onChange }: Props) {
    const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch })
    const activeCount =
        filters.labels.length +
        filters.repos.length +
        filters.authors.length +
        filters.assignees.length
    const isDefault = JSON.stringify(filters) === JSON.stringify(DEFAULT_FILTERS)

    return (
        <div className='bg-surface border-line shadow-card rounded-xl border p-3'>
            <div className='flex flex-wrap items-center gap-2'>
                <div className='relative min-w-[14rem] flex-1'>
                    <input
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
                <select
                    value={filters.attention}
                    onChange={(e) => set({ attention: e.target.value as Filters['attention'] })}
                    aria-label='Needs attention'
                    className={clsx(
                        'bg-well border-line rounded-lg border px-2.5 py-1.5 text-xs font-semibold',
                        filters.attention !== 'any' && 'border-accent-yellow text-accent-yellow'
                    )}
                >
                    <option value='any'>Attention: any</option>
                    <option value='stale'>Stale (30+ days)</option>
                    <option value='dormant'>Dormant (90+ days)</option>
                    <option value='unlabeled'>Unlabeled</option>
                    <option value='unassigned'>Unassigned</option>
                    <option value='draft'>Draft PRs</option>
                </select>
                <select
                    value={filters.sort}
                    onChange={(e) => set({ sort: e.target.value as Filters['sort'] })}
                    aria-label='Sort'
                    className='bg-well border-line rounded-lg border px-2.5 py-1.5 text-xs font-semibold'
                >
                    <option value='updated'>Recently updated</option>
                    <option value='created'>Newest</option>
                    <option value='comments'>Most discussed</option>
                    <option value='title'>Title A–Z</option>
                </select>
                <select
                    value={filters.group}
                    onChange={(e) => set({ group: e.target.value as Filters['group'] })}
                    aria-label='Group by'
                    className='bg-well border-line rounded-lg border px-2.5 py-1.5 text-xs font-semibold'
                >
                    <option value='none'>No grouping</option>
                    <option value='repo'>Group by repo</option>
                    <option value='author'>Group by author</option>
                </select>
                <Chip
                    active={filters.hideDrafts}
                    onClick={() => set({ hideDrafts: !filters.hideDrafts })}
                >
                    Hide drafts
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
    count,
    children
}: {
    label: string
    count: number
    children: ReactNode
}) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)
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
                className={clsx(
                    'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition',
                    count > 0
                        ? 'bg-secondary/20 text-secondary-text'
                        : 'bg-well text-muted hover:text-white'
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
                <div className='bg-surface-elevated border-line shadow-card fade-in absolute left-0 z-40 mt-1 max-h-80 w-72 overflow-y-auto rounded-xl border p-1.5'>
                    {children}
                </div>
            )}
        </div>
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
