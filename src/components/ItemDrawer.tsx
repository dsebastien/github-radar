import clsx from 'clsx'
import { useCallback, useEffect, useState } from 'react'
import { usePersistedState } from '@/hooks/usePersistedState'
import type { GitHubClient } from '@/lib/github'
import type { Item, ItemDetail, Milestone, Project, RepoLabel, Viewer } from '@/lib/types'
import { recordError } from '@/lib/diagnostics'
import { formatDate, timeAgo } from '@/lib/utils'
import { PrBadges } from './PrBadges'
import { ProjectsSection } from './ProjectsSection'
import { RepoMenu } from './RepoMenu'
import { Avatar, Button, ExternalIcon, IssueIcon, LabelChip, PullRequestIcon, Spinner } from './ui'

/** Default drawer width on desktop (Tailwind's max-w-2xl). */
const DEFAULT_WIDTH = 672
const MIN_WIDTH = 360
/** Keep at least this much of the page visible when not maximized. */
const PAGE_MARGIN = 96

interface Props {
    item: Item
    client: GitHubClient
    viewer: Viewer | null
    now: number
    onClose: () => void
    onPatch: (patch: Partial<Item>) => void
    onToast: (msg: string) => void
    onLogin: () => void
    /** Present when the token can use projects. */
    loadProjects?: () => Promise<Project[]>
}

export function ItemDrawer({
    item,
    client,
    viewer,
    now,
    onClose,
    onPatch,
    onToast,
    onLogin,
    loadProjects
}: Props) {
    const [detail, setDetail] = useState<ItemDetail | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState<string | null>(null)
    const [comment, setComment] = useState('')
    const [labelsOpen, setLabelsOpen] = useState(false)
    const [repoLabels, setRepoLabels] = useState<RepoLabel[] | null>(null)
    const [confirmState, setConfirmState] = useState(false)
    const [milestonesOpen, setMilestonesOpen] = useState(false)
    const [repoMilestones, setRepoMilestones] = useState<Milestone[] | null>(null)
    // Desktop sizing: drag the left edge, maximize, or reset. Persisted across items and visits.
    const [width, setWidth] = usePersistedState<number>('drawerWidth', DEFAULT_WIDTH)
    const [maximized, setMaximized] = usePersistedState<boolean>('drawerMaximized', false)
    const [dragging, setDragging] = useState(false)
    const customized = maximized || width !== DEFAULT_WIDTH
    const resetSize = () => {
        setWidth(DEFAULT_WIDTH)
        setMaximized(false)
    }
    const startResize = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            if (e.button !== 0) return
            e.preventDefault()
            setDragging(true)
            setMaximized(false)
            const move = (ev: PointerEvent) => {
                const max = window.innerWidth - PAGE_MARGIN
                setWidth(
                    Math.round(Math.min(max, Math.max(MIN_WIDTH, window.innerWidth - ev.clientX)))
                )
            }
            const stop = () => {
                setDragging(false)
                window.removeEventListener('pointermove', move)
                window.removeEventListener('pointerup', stop)
                window.removeEventListener('pointercancel', stop)
            }
            window.addEventListener('pointermove', move)
            window.addEventListener('pointerup', stop)
            window.addEventListener('pointercancel', stop)
        },
        [setWidth, setMaximized]
    )

    // The drawer is keyed by item id in App, so a new item remounts it with fresh state.
    useEffect(() => {
        let cancelled = false
        client
            .detail(item, viewer?.login ?? null)
            .then((d) => {
                if (!cancelled) setDetail(d)
            })
            .catch((e: unknown) => {
                if (!cancelled) setError(e instanceof Error ? e.message : String(e))
            })
        return () => {
            cancelled = true
        }
    }, [client, item, viewer?.login])

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    const guard = async (name: string, fn: () => Promise<void>) => {
        if (!viewer) {
            onLogin()
            return
        }
        setBusy(name)
        try {
            await fn()
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e)
            recordError(`${item.repo}#${item.number} ${name}: ${message}`, 'action')
            onToast(message)
        } finally {
            setBusy(null)
        }
    }

    const upvote = () =>
        guard('upvote', async () => {
            if (!viewer) return
            const reacted = await client.toggleUpvote(item, viewer.login)
            setDetail((d) => (d ? { ...d, viewerReacted: reacted } : d))
            onPatch({ reactions: Math.max(0, item.reactions + (reacted ? 1 : -1)) })
        })

    const submitComment = () =>
        guard('comment', async () => {
            const body = comment.trim()
            if (!body) return
            const created = await client.comment(item, body)
            setDetail((d) => (d ? { ...d, comments: [...d.comments, created] } : d))
            setComment('')
            onPatch({ comments: item.comments + 1, updated_at: created.created_at })
            onToast('Comment posted.')
        })

    const openLabels = () =>
        guard('labels', async () => {
            if (!repoLabels) setRepoLabels(await client.repoLabels(item.repo))
            setMilestonesOpen(false)
            setLabelsOpen(true)
        })

    const toggleLabel = (name: string) =>
        guard('labels', async () => {
            const current = item.labels.map((l) => l.name)
            const next = current.includes(name)
                ? current.filter((n) => n !== name)
                : [...current, name]
            onPatch({ labels: await client.setLabels(item, next) })
        })

    const openMilestones = () =>
        guard('milestone', async () => {
            if (milestonesOpen) return setMilestonesOpen(false)
            if (!repoMilestones) setRepoMilestones(await client.repoMilestones(item.repo))
            setLabelsOpen(false)
            setMilestonesOpen(true)
        })

    const setMilestone = (m: Milestone | null) =>
        guard('milestone', async () => {
            const title = await client.setMilestone(item, m?.number ?? null)
            onPatch({ milestone: title, updated_at: new Date().toISOString() })
            setMilestonesOpen(false)
        })

    const isAssigned = viewer ? item.assignees.some((a) => a.login === viewer.login) : false
    const assign = () =>
        guard('assign', async () => {
            if (!viewer) return
            onPatch({ assignees: await client.assignSelf(item, viewer.login, !isAssigned) })
        })

    const setState = () =>
        guard('state', async () => {
            const next = item.state === 'open' ? 'closed' : 'open'
            await client.setState(item, next)
            onPatch({ state: next, updated_at: new Date().toISOString() })
            setConfirmState(false)
            onToast(next === 'closed' ? 'Closed.' : 'Reopened.')
        })

    return (
        <aside
            className={clsx(
                'bg-surface border-line fixed inset-y-0 right-0 z-40 flex w-full max-w-full flex-col border-l shadow-2xl',
                !dragging && 'drawer-in transition-[width] duration-150'
            )}
            style={{ width: maximized ? '100vw' : width }}
            aria-label={`${item.repo} #${item.number}`}
        >
            <div
                role='separator'
                aria-orientation='vertical'
                aria-label='Resize panel'
                title='Drag to resize, double-click to reset'
                onPointerDown={startResize}
                onDoubleClick={resetSize}
                className={clsx(
                    'absolute inset-y-0 left-0 z-10 hidden w-1.5 cursor-col-resize transition lg:block',
                    dragging ? 'bg-secondary' : 'hover:bg-secondary/60'
                )}
            />
            <header className='border-line flex items-start gap-3 border-b p-4'>
                <span
                    className={clsx(
                        'mt-1',
                        item.state === 'closed' ? 'text-accent-purple' : 'text-success'
                    )}
                >
                    {item.type === 'pr' ? <PullRequestIcon /> : <IssueIcon />}
                </span>
                <div className='min-w-0 flex-1'>
                    <div className='text-faint flex flex-wrap items-center gap-x-1 text-xs'>
                        <span>{item.repo}</span>
                        <RepoMenu repo={item.repo} onToast={onToast} />
                        <span>
                            #{item.number} · {item.state}
                            {item.draft ? ' · draft' : ''}
                        </span>
                        {item.pr && (
                            <span className='ml-1 inline-flex items-center gap-1.5'>
                                <PrBadges pr={item.pr} viewerLogin={viewer?.login ?? null} />
                            </span>
                        )}
                    </div>
                    <h2 className='text-lg leading-snug font-extrabold'>{item.title}</h2>
                    <div className='text-muted mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs'>
                        {item.author && (
                            <a
                                href={item.author.html_url}
                                target='_blank'
                                rel='noreferrer'
                                className='flex items-center gap-1'
                            >
                                <Avatar actor={item.author} size={16} /> {item.author.login}
                            </a>
                        )}
                        <span title={formatDate(item.created_at)}>
                            opened {timeAgo(item.created_at, now)}
                        </span>
                        <span title={formatDate(item.updated_at)}>
                            updated {timeAgo(item.updated_at, now)}
                        </span>
                        <a
                            href={item.html_url}
                            target='_blank'
                            rel='noreferrer'
                            className='text-secondary-text flex items-center gap-1 hover:underline'
                        >
                            Open on GitHub <ExternalIcon />
                        </a>
                    </div>
                </div>
                <div className='flex shrink-0 items-center gap-0.5'>
                    {customized && (
                        <button
                            type='button'
                            onClick={resetSize}
                            className='text-muted hidden rounded p-1.5 hover:text-white lg:block'
                            aria-label='Reset panel size'
                            title='Reset size'
                        >
                            <ResetIcon />
                        </button>
                    )}
                    <button
                        type='button'
                        onClick={() => setMaximized((m) => !m)}
                        className='text-muted hidden rounded p-1.5 hover:text-white lg:block'
                        aria-label={maximized ? 'Restore panel size' : 'Maximize panel'}
                        title={maximized ? 'Restore' : 'Maximize'}
                    >
                        {maximized ? <RestoreIcon /> : <MaximizeIcon />}
                    </button>
                    <button
                        type='button'
                        onClick={onClose}
                        className='text-muted px-2 text-2xl leading-none hover:text-white'
                        aria-label='Close'
                        title='Close (Esc)'
                    >
                        ×
                    </button>
                </div>
            </header>

            <div className='border-line flex flex-wrap items-center gap-2 border-b p-3'>
                <Button
                    size='sm'
                    variant={detail?.viewerReacted ? 'primary' : 'secondary'}
                    onClick={() => void upvote()}
                    disabled={busy !== null}
                    title={viewer ? 'Toggle your 👍' : 'Log in to react'}
                >
                    👍 {item.reactions > 0 ? item.reactions : ''}
                </Button>
                <Button size='sm' onClick={() => void openLabels()} disabled={busy !== null}>
                    🏷 Labels
                </Button>
                <Button size='sm' onClick={() => void openMilestones()} disabled={busy !== null}>
                    ◆ {item.milestone ?? 'Milestone'}
                </Button>
                <Button size='sm' onClick={() => void assign()} disabled={busy !== null}>
                    {isAssigned ? 'Unassign me' : 'Assign me'}
                </Button>
                {confirmState ? (
                    <span className='ml-auto flex items-center gap-1.5 text-xs'>
                        {item.state === 'open' ? 'Close this?' : 'Reopen this?'}
                        <Button
                            size='sm'
                            variant='danger'
                            onClick={() => void setState()}
                            disabled={busy !== null}
                        >
                            Yes
                        </Button>
                        <Button size='sm' variant='ghost' onClick={() => setConfirmState(false)}>
                            No
                        </Button>
                    </span>
                ) : (
                    <Button
                        size='sm'
                        variant='ghost'
                        className='ml-auto'
                        onClick={() => (viewer ? setConfirmState(true) : onLogin())}
                        disabled={busy !== null}
                    >
                        {item.state === 'open' ? 'Close' : 'Reopen'}
                    </Button>
                )}
                {busy && <Spinner />}
            </div>

            {labelsOpen && repoLabels && (
                <div className='border-line bg-well flex max-h-48 flex-wrap gap-1.5 overflow-y-auto border-b p-3'>
                    {repoLabels.length === 0 && (
                        <span className='text-faint text-xs'>This repository has no labels.</span>
                    )}
                    {repoLabels.map((l) => (
                        <LabelChip
                            key={l.name}
                            label={l}
                            active={item.labels.some((x) => x.name === l.name)}
                            onClick={() => void toggleLabel(l.name)}
                        />
                    ))}
                </div>
            )}

            {viewer && loadProjects && (
                <ProjectsSection
                    item={item}
                    client={client}
                    loadProjects={loadProjects}
                    onPatch={onPatch}
                    onToast={onToast}
                />
            )}

            {milestonesOpen && repoMilestones && (
                <div className='border-line bg-well flex max-h-48 flex-wrap gap-1.5 overflow-y-auto border-b p-3'>
                    {repoMilestones.length === 0 && (
                        <span className='text-faint text-xs'>
                            This repository has no open milestones.
                        </span>
                    )}
                    {repoMilestones.map((m) => (
                        <Button
                            key={m.number}
                            size='sm'
                            variant={item.milestone === m.title ? 'primary' : 'secondary'}
                            onClick={() => void setMilestone(m)}
                            disabled={busy !== null}
                            title={m.due_on ? `Due ${formatDate(m.due_on)}` : undefined}
                        >
                            ◆ {m.title}
                        </Button>
                    ))}
                    {item.milestone && (
                        <Button
                            size='sm'
                            variant='ghost'
                            onClick={() => void setMilestone(null)}
                            disabled={busy !== null}
                        >
                            Clear milestone
                        </Button>
                    )}
                </div>
            )}

            <div className='flex-1 overflow-y-auto p-4'>
                <div className='mb-3 flex flex-wrap items-center gap-1.5'>
                    {item.labels.map((l) => (
                        <LabelChip key={l.name} label={l} />
                    ))}
                    {item.assignees.length > 0 && (
                        <span className='text-muted ml-1 flex items-center gap-1 text-xs'>
                            assigned to
                            {item.assignees.map((a) => (
                                <Avatar key={a.login} actor={a} size={16} />
                            ))}
                        </span>
                    )}
                </div>
                {error && (
                    <p className='rounded-lg bg-red-500/15 p-3 text-sm text-red-200'>{error}</p>
                )}
                {!detail && !error && (
                    <div className='text-muted flex items-center gap-2 text-sm'>
                        <Spinner /> Loading…
                    </div>
                )}
                {detail && (
                    <>
                        {detail.body_html ? (
                            <div
                                className='gh-markdown'
                                dangerouslySetInnerHTML={{ __html: detail.body_html }}
                            />
                        ) : (
                            <p className='text-faint text-sm italic'>No description provided.</p>
                        )}
                        {detail.comments.length > 0 && (
                            <div className='mt-6 space-y-4'>
                                <h3 className='text-xs font-extrabold tracking-wide uppercase'>
                                    {detail.comments.length}{' '}
                                    {detail.comments.length === 1 ? 'comment' : 'comments'}
                                </h3>
                                {detail.comments.map((c) => (
                                    <div key={c.id} className='bg-well rounded-xl p-3'>
                                        <div className='text-muted mb-2 flex items-center gap-2 text-xs'>
                                            {c.author && (
                                                <>
                                                    <Avatar actor={c.author} size={16} />
                                                    <span className='font-semibold text-white'>
                                                        {c.author.login}
                                                    </span>
                                                </>
                                            )}
                                            <a
                                                href={c.html_url}
                                                target='_blank'
                                                rel='noreferrer'
                                                title={formatDate(c.created_at)}
                                                className='hover:underline'
                                            >
                                                {timeAgo(c.created_at, now)}
                                            </a>
                                        </div>
                                        <div
                                            className='gh-markdown'
                                            dangerouslySetInnerHTML={{ __html: c.body_html }}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            <form
                className='border-line border-t p-3'
                onSubmit={(e) => {
                    e.preventDefault()
                    void submitComment()
                }}
            >
                <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void submitComment()
                    }}
                    placeholder={
                        viewer
                            ? 'Write a comment (Markdown). Ctrl/⌘+Enter to post.'
                            : 'Log in to comment.'
                    }
                    disabled={!viewer}
                    rows={3}
                    className='bg-well border-line focus:border-secondary-text w-full resize-y rounded-lg border px-3 py-2 text-sm outline-none disabled:opacity-60'
                />
                <div className='mt-2 flex justify-end'>
                    <Button
                        type='submit'
                        variant='primary'
                        size='sm'
                        disabled={!viewer || !comment.trim() || busy !== null}
                    >
                        Comment
                    </Button>
                </div>
            </form>
        </aside>
    )
}

function MaximizeIcon() {
    return (
        <svg viewBox='0 0 16 16' width='16' height='16' fill='currentColor' aria-hidden>
            <path d='M3.75 3.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-8.5a.25.25 0 0 0-.25-.25Zm-1.75.25C2 2.784 2.784 2 3.75 2h8.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25Z' />
        </svg>
    )
}

function RestoreIcon() {
    return (
        <svg viewBox='0 0 16 16' width='16' height='16' fill='currentColor' aria-hidden>
            <path d='M5.75 2A1.75 1.75 0 0 0 4 3.75V4H3.75A1.75 1.75 0 0 0 2 5.75v6.5c0 .966.784 1.75 1.75 1.75h6.5A1.75 1.75 0 0 0 12 12.25V12h.25A1.75 1.75 0 0 0 14 10.25v-6.5A1.75 1.75 0 0 0 12.25 2ZM12 10.5h.25a.25.25 0 0 0 .25-.25v-6.5a.25.25 0 0 0-.25-.25h-6.5a.25.25 0 0 0-.25.25V4h4.75c.966 0 1.75.784 1.75 1.75Zm-8.5-4.75a.25.25 0 0 1 .25-.25h6.5a.25.25 0 0 1 .25.25v6.5a.25.25 0 0 1-.25.25h-6.5a.25.25 0 0 1-.25-.25Z' />
        </svg>
    )
}

function ResetIcon() {
    return (
        <svg viewBox='0 0 16 16' width='16' height='16' fill='currentColor' aria-hidden>
            <path d='M8 2.5a5.5 5.5 0 1 0 4.4 2.2l.9-1.2A7 7 0 1 1 8 1v1.5Zm2.5-.5V0h1.5v4h-4V2.5Z' />
        </svg>
    )
}
