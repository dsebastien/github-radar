import clsx from 'clsx'
import { useRef, useState } from 'react'
import { applicability, labelOptions, runBulk, type BulkFailure } from '@/lib/bulk'
import type { GitHubClient } from '@/lib/github'
import type { Item, RepoLabel, Viewer } from '@/lib/types'
import { pluralize } from '@/lib/utils'
import { Button, LabelChip, Spinner } from './ui'

interface Props {
    items: Item[]
    client: GitHubClient
    viewer: Viewer
    onPatch: (id: number, patch: Partial<Item>) => void
    onToast: (msg: string) => void
    onClear: () => void
}

type Panel = 'labels' | 'close' | null

/**
 * Sticky bar for acting on the selected items. Every action runs item by item with a progress
 * counter; failures are listed per item and never stop the rest.
 */
export function BulkBar({ items, client, viewer, onPatch, onToast, onClear }: Props) {
    const [panel, setPanel] = useState<Panel>(null)
    const [running, setRunning] = useState<{ label: string; done: number; total: number } | null>(
        null
    )
    const [failures, setFailures] = useState<BulkFailure[]>([])
    const [repoLabels, setRepoLabels] = useState<Record<string, RepoLabel[]>>({})
    const [loadingLabels, setLoadingLabels] = useState(false)
    const abortRef = useRef<AbortController | null>(null)

    const me = viewer.login.toLowerCase()
    const isMine = (i: Item) => i.assignees.some((a) => a.login.toLowerCase() === me)
    const assignable = applicability(items, (i) => !isMine(i))
    const unassignable = applicability(items, isMine)
    const closable = applicability(items, (i) => i.state === 'open')
    const reopenable = applicability(items, (i) => i.state === 'closed')

    const run = async (
        label: string,
        targets: Item[],
        action: (item: Item) => Promise<Partial<Item>>
    ) => {
        const controller = new AbortController()
        abortRef.current = controller
        setFailures([])
        setPanel(null)
        const failed = await runBulk(
            targets,
            async (item) => onPatch(item.id, await action(item)),
            (done, total) => setRunning({ label, done, total }),
            controller.signal
        )
        setRunning(null)
        setFailures(failed)
        const ok = targets.length - failed.length
        onToast(
            `${label}: ${pluralize(ok, 'item')} done${failed.length ? `, ${failed.length} failed` : ''}${controller.signal.aborted ? ' (cancelled)' : ''}.`
        )
    }

    const openLabels = async () => {
        if (panel === 'labels') return setPanel(null)
        setPanel('labels')
        const missing = [...new Set(items.map((i) => i.repo))].filter((r) => !repoLabels[r])
        if (missing.length === 0) return
        setLoadingLabels(true)
        const loaded: Record<string, RepoLabel[]> = {}
        for (const repo of missing) {
            try {
                loaded[repo] = await client.repoLabels(repo)
            } catch {
                loaded[repo] = []
            }
        }
        setRepoLabels((r) => ({ ...r, ...loaded }))
        setLoadingLabels(false)
    }

    const hasLabel = (i: Item, name: string) =>
        i.labels.some((l) => l.name.toLowerCase() === name.toLowerCase())
    const repoHas = (i: Item, name: string) =>
        (repoLabels[i.repo] ?? []).some((l) => l.name.toLowerCase() === name.toLowerCase())

    const addLabel = (name: string) =>
        run(
            `Add “${name}”`,
            items.filter((i) => repoHas(i, name) && !hasLabel(i, name)),
            async (i) => ({
                labels: await client.setLabels(i, [...i.labels.map((l) => l.name), name])
            })
        )
    const removeLabel = (name: string) =>
        run(
            `Remove “${name}”`,
            items.filter((i) => hasLabel(i, name)),
            async (i) => ({
                labels: await client.setLabels(
                    i,
                    i.labels
                        .map((l) => l.name)
                        .filter((n) => n.toLowerCase() !== name.toLowerCase())
                )
            })
        )

    const busy = running !== null
    return (
        <div className='bg-surface-elevated border-line shadow-card fade-in sticky bottom-3 z-20 rounded-xl border p-3 text-sm'>
            <div className='flex flex-wrap items-center gap-2'>
                <span className='font-bold'>{pluralize(items.length, 'selected', 'selected')}</span>
                <Button size='sm' variant='ghost' onClick={onClear} disabled={busy}>
                    Clear
                </Button>
                <span className='mx-1 h-5 w-px bg-white/15' />
                <Button
                    size='sm'
                    onClick={() => void openLabels()}
                    disabled={busy}
                    aria-expanded={panel === 'labels'}
                >
                    🏷 Labels
                </Button>
                <Button
                    size='sm'
                    disabled={busy || assignable.none}
                    title={assignable.hint}
                    onClick={() =>
                        void run(
                            'Assign me',
                            items.filter((i) => !isMine(i)),
                            async (i) => ({
                                assignees: await client.assignSelf(i, viewer.login, true)
                            })
                        )
                    }
                >
                    Assign me{assignable.hint && <Hint text={`${assignable.count}`} />}
                </Button>
                <Button
                    size='sm'
                    disabled={busy || unassignable.none}
                    title={unassignable.hint}
                    onClick={() =>
                        void run('Unassign me', items.filter(isMine), async (i) => ({
                            assignees: await client.assignSelf(i, viewer.login, false)
                        }))
                    }
                >
                    Unassign me{unassignable.hint && <Hint text={`${unassignable.count}`} />}
                </Button>
                <Button
                    size='sm'
                    variant='ghost'
                    disabled={busy}
                    onClick={() => setPanel(panel === 'close' ? null : 'close')}
                    aria-expanded={panel === 'close'}
                >
                    Close / reopen
                </Button>
                {running && (
                    <span className='text-muted ml-auto flex items-center gap-2 text-xs'>
                        <Spinner />
                        {running.label} {running.done}/{running.total}
                        <Button size='sm' variant='ghost' onClick={() => abortRef.current?.abort()}>
                            Cancel
                        </Button>
                    </span>
                )}
            </div>

            {panel === 'labels' && (
                <div className='border-line mt-3 max-h-56 overflow-y-auto border-t pt-3'>
                    {loadingLabels ? (
                        <span className='text-muted flex items-center gap-2 text-xs'>
                            <Spinner /> Loading the repositories’ labels…
                        </span>
                    ) : (
                        <LabelPicker
                            items={items}
                            repoLabels={repoLabels}
                            onAdd={(n) => void addLabel(n)}
                            onRemove={(n) => void removeLabel(n)}
                        />
                    )}
                </div>
            )}

            {panel === 'close' && (
                <div className='border-line mt-3 flex flex-wrap items-center gap-2 border-t pt-3 text-xs'>
                    <span className='text-muted'>Are you sure?</span>
                    <Button
                        size='sm'
                        variant='danger'
                        disabled={closable.none}
                        onClick={() =>
                            void run(
                                'Close',
                                items.filter((i) => i.state === 'open'),
                                async (i) => {
                                    await client.setState(i, 'closed')
                                    return { state: 'closed', updated_at: new Date().toISOString() }
                                }
                            )
                        }
                    >
                        Close {pluralize(closable.count, 'item')}
                    </Button>
                    <Button
                        size='sm'
                        disabled={reopenable.none}
                        onClick={() =>
                            void run(
                                'Reopen',
                                items.filter((i) => i.state === 'closed'),
                                async (i) => {
                                    await client.setState(i, 'open')
                                    return { state: 'open', updated_at: new Date().toISOString() }
                                }
                            )
                        }
                    >
                        Reopen {pluralize(reopenable.count, 'item')}
                    </Button>
                    <Button size='sm' variant='ghost' onClick={() => setPanel(null)}>
                        Cancel
                    </Button>
                </div>
            )}

            {failures.length > 0 && (
                <div className='mt-3 rounded-lg bg-red-500/15 p-2 text-xs text-red-200'>
                    <div className='mb-1 flex items-center'>
                        <strong>{pluralize(failures.length, 'item')} failed</strong>
                        <button
                            type='button'
                            onClick={() => setFailures([])}
                            className='ml-auto hover:text-white'
                        >
                            Dismiss
                        </button>
                    </div>
                    <ul className='max-h-32 space-y-0.5 overflow-y-auto'>
                        {failures.map((f) => (
                            <li key={f.item.id} className='[overflow-wrap:anywhere]'>
                                <a
                                    href={f.item.html_url}
                                    target='_blank'
                                    rel='noreferrer'
                                    className='underline'
                                >
                                    {f.item.repo}#{f.item.number}
                                </a>
                                : {f.message}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    )
}

function Hint({ text }: { text: string }) {
    return <span className='rounded-full bg-white/15 px-1.5 text-[10px]'>{text}</span>
}

function LabelPicker({
    items,
    repoLabels,
    onAdd,
    onRemove
}: {
    items: Item[]
    repoLabels: Record<string, RepoLabel[]>
    onAdd: (name: string) => void
    onRemove: (name: string) => void
}) {
    const options = labelOptions(items, repoLabels)
    if (options.length === 0)
        return <span className='text-faint text-xs'>These repositories have no labels.</span>
    return (
        <div className='flex flex-wrap gap-x-3 gap-y-1.5'>
            {options.map((o) => (
                <span key={o.name} className='inline-flex items-center gap-1'>
                    <LabelChip label={{ name: o.name, color: o.color, description: null }} />
                    <button
                        type='button'
                        disabled={o.applied === o.available}
                        onClick={() => onAdd(o.name)}
                        title={`Add to ${o.available - o.applied} item(s)${o.available < items.length ? ` (${items.length - o.available} selected item(s) are in repositories without this label)` : ''}`}
                        className={clsx(
                            'rounded px-1 text-xs font-bold',
                            'text-success hover:bg-white/10 disabled:opacity-30'
                        )}
                    >
                        +{o.available - o.applied}
                    </button>
                    <button
                        type='button'
                        disabled={o.applied === 0}
                        onClick={() => onRemove(o.name)}
                        title={`Remove from ${o.applied} item(s)`}
                        className='rounded px-1 text-xs font-bold text-red-300 hover:bg-white/10 disabled:opacity-30'
                    >
                        −{o.applied}
                    </button>
                </span>
            ))}
        </div>
    )
}
