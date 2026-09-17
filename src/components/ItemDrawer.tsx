import clsx from 'clsx'
import { useEffect, useState } from 'react'
import type { GitHubClient } from '@/lib/github'
import type { Item, ItemDetail, RepoLabel, Viewer } from '@/lib/types'
import { formatDate, timeAgo } from '@/lib/utils'
import { Avatar, Button, ExternalIcon, IssueIcon, LabelChip, PullRequestIcon, Spinner } from './ui'

interface Props {
    item: Item
    client: GitHubClient
    viewer: Viewer | null
    now: number
    onClose: () => void
    onPatch: (patch: Partial<Item>) => void
    onToast: (msg: string) => void
    onLogin: () => void
}

export function ItemDrawer({
    item,
    client,
    viewer,
    now,
    onClose,
    onPatch,
    onToast,
    onLogin
}: Props) {
    const [detail, setDetail] = useState<ItemDetail | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState<string | null>(null)
    const [comment, setComment] = useState('')
    const [labelsOpen, setLabelsOpen] = useState(false)
    const [repoLabels, setRepoLabels] = useState<RepoLabel[] | null>(null)
    const [confirmState, setConfirmState] = useState(false)

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
            onToast(e instanceof Error ? e.message : String(e))
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
            className='bg-surface border-line drawer-in fixed inset-y-0 right-0 z-40 flex w-full max-w-2xl flex-col border-l shadow-2xl'
            aria-label={`${item.repo} #${item.number}`}
        >
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
                    <div className='text-faint text-xs'>
                        {item.repo} #{item.number} · {item.state}
                        {item.draft ? ' · draft' : ''}
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
                <button
                    type='button'
                    onClick={onClose}
                    className='text-muted px-2 text-2xl leading-none hover:text-white'
                    aria-label='Close'
                >
                    ×
                </button>
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
