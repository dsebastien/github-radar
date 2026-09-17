import { useState } from 'react'
import clsx from 'clsx'
import { parseSource, serializeSources, sourceKey, sourceLabel } from '@/lib/sources'
import type { Source, Viewer } from '@/lib/types'
import { Button, ExternalIcon, SectionTitle } from './ui'

interface Props {
    sources: Source[]
    effective: Source[]
    viewer: Viewer | null
    onAdd: (s: Source) => void
    onRemove: (s: Source) => void
    onToast: (msg: string) => void
    /** Source keys currently hidden from the list. */
    hidden: string[]
    /** Items per source key. */
    counts: Record<string, number>
    onToggleHidden: (s: Source) => void
    /** Source key that is currently the only visible one, if any. */
    focused: string | null
    onFocus: (s: Source) => void
}

const KIND_ICON: Record<Source['kind'], string> = { user: '@', org: '⌂', repo: '⎇' }

export function SourcesPanel({
    sources,
    effective,
    viewer,
    onAdd,
    onRemove,
    onToast,
    hidden,
    counts,
    onToggleHidden,
    focused,
    onFocus
}: Props) {
    const [input, setInput] = useState('')
    const [invalid, setInvalid] = useState(false)
    const implicit = effective.filter(
        (e) =>
            !sources.some(
                (s) => s.kind === e.kind && s.value.toLowerCase() === e.value.toLowerCase()
            )
    )

    const submit = () => {
        const parsed = parseSource(input)
        if (!parsed) {
            setInvalid(true)
            return
        }
        onAdd(parsed)
        setInput('')
        setInvalid(false)
    }

    const share = async () => {
        const url = new URL(window.location.href)
        url.search = sources.length
            ? `?sources=${encodeURIComponent(serializeSources(sources))}`
            : ''
        try {
            await navigator.clipboard.writeText(url.toString())
            onToast('Link copied. Anyone opening it gets these sources pre-filled.')
        } catch {
            onToast(url.toString())
        }
    }

    return (
        <section className='bg-surface border-line shadow-card rounded-xl border p-4'>
            <SectionTitle>Sources</SectionTitle>
            <form
                onSubmit={(e) => {
                    e.preventDefault()
                    submit()
                }}
                className='flex gap-2'
            >
                <input
                    value={input}
                    onChange={(e) => {
                        setInput(e.target.value)
                        setInvalid(false)
                    }}
                    placeholder='user, org:name, owner/repo or URL'
                    aria-label='Add a source'
                    aria-invalid={invalid}
                    className='bg-well border-line focus:border-secondary-text min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm outline-none aria-[invalid=true]:border-red-400'
                />
                <Button type='submit' variant='primary' size='sm' disabled={!input.trim()}>
                    Add
                </Button>
            </form>
            {invalid && (
                <p className='mt-1 text-xs text-red-300'>
                    That does not look like a GitHub user, org or repo.
                </p>
            )}
            <p className='text-faint mt-2 text-xs [overflow-wrap:anywhere] break-words'>
                Examples: <code className='font-mono'>dsebastien</code>,{' '}
                <code className='font-mono'>org:knowii-oss</code>,{' '}
                <code className='font-mono'>DeveloPassion/obsidian-starter-kit-plugin</code>
            </p>
            <ul className='mt-3 space-y-1.5'>
                {sources.map((s) => {
                    const isHidden = hidden.includes(sourceKey(s))
                    return (
                        <li
                            key={sourceLabel(s)}
                            className={clsx(
                                'group flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-sm transition',
                                isHidden && 'opacity-50'
                            )}
                        >
                            <span
                                className='text-secondary-text w-4 text-center font-mono text-xs'
                                title={s.kind}
                            >
                                {KIND_ICON[s.kind]}
                            </span>
                            <button
                                type='button'
                                onClick={() => onFocus(s)}
                                title={
                                    focused === sourceKey(s)
                                        ? 'Show every source again'
                                        : `Only show ${s.value}`
                                }
                                className={clsx(
                                    'min-w-0 truncate text-left font-medium hover:underline',
                                    isHidden && 'line-through',
                                    focused === sourceKey(s) && 'text-secondary-text'
                                )}
                            >
                                {s.value}
                            </button>
                            <a
                                href={`https://github.com/${s.value}`}
                                target='_blank'
                                rel='noreferrer'
                                className='text-faint hover:text-white'
                                title='Open on GitHub'
                                aria-label={`Open ${s.value} on GitHub`}
                            >
                                <ExternalIcon />
                            </a>
                            <span className='text-faint ml-auto font-mono text-xs tabular-nums'>
                                {counts[sourceKey(s)] ?? 0}
                            </span>
                            <EyeButton hidden={isHidden} onClick={() => onToggleHidden(s)} />
                            <button
                                type='button'
                                onClick={() => onRemove(s)}
                                className='text-faint rounded px-1 text-base leading-none opacity-0 transition group-hover:opacity-100 hover:text-white focus:opacity-100'
                                aria-label={`Remove ${s.value}`}
                                title='Remove'
                            >
                                ×
                            </button>
                        </li>
                    )
                })}
                {implicit.map((s) => {
                    const isHidden = hidden.includes(sourceKey(s))
                    return (
                        <li
                            key={sourceLabel(s)}
                            className={clsx(
                                'text-muted flex items-center gap-2 rounded-lg border border-dashed border-white/15 px-2.5 py-1.5 text-sm transition',
                                isHidden && 'opacity-50'
                            )}
                            title={`Added automatically because ${viewer?.login ?? 'you'} are logged in`}
                        >
                            <span className='w-4 text-center font-mono text-xs'>
                                {KIND_ICON[s.kind]}
                            </span>
                            <button
                                type='button'
                                onClick={() => onFocus(s)}
                                title={
                                    focused === sourceKey(s)
                                        ? 'Show every source again'
                                        : `Only show ${s.value}`
                                }
                                className={clsx(
                                    'min-w-0 truncate text-left hover:underline',
                                    isHidden && 'line-through',
                                    focused === sourceKey(s) && 'text-secondary-text'
                                )}
                            >
                                {s.value}
                            </button>
                            <span className='text-faint ml-auto text-[10px] uppercase'>mine</span>
                            <span className='text-faint font-mono text-xs tabular-nums'>
                                {counts[sourceKey(s)] ?? 0}
                            </span>
                            <EyeButton hidden={isHidden} onClick={() => onToggleHidden(s)} />
                        </li>
                    )
                })}
            </ul>
            {sources.length > 0 && (
                <div className='mt-3 flex justify-end'>
                    <Button variant='ghost' size='sm' onClick={() => void share()}>
                        Share this view
                    </Button>
                </div>
            )}
        </section>
    )
}

function EyeButton({ hidden, onClick }: { hidden: boolean; onClick: () => void }) {
    return (
        <button
            type='button'
            onClick={onClick}
            aria-pressed={hidden}
            aria-label={hidden ? 'Show items from this source' : 'Hide items from this source'}
            title={hidden ? 'Show' : 'Hide'}
            className={clsx(
                'rounded p-0.5 transition hover:text-white',
                hidden ? 'text-faint' : 'text-secondary-text'
            )}
        >
            {hidden ? (
                <svg viewBox='0 0 16 16' width='15' height='15' fill='currentColor' aria-hidden>
                    <path d='M.143 2.31a.75.75 0 0 1 1.047-.167l14.5 10.5a.75.75 0 1 1-.88 1.214l-2.248-1.628C11.346 13.19 9.792 14 8 14c-1.981 0-3.67-.992-4.933-2.078C1.797 10.832.88 9.577.43 8.9a1.619 1.619 0 0 1 0-1.797c.353-.533.995-1.42 1.868-2.305L.31 3.357A.75.75 0 0 1 .143 2.31Zm3.386 3.378a14.21 14.21 0 0 0-1.85 2.244.147.147 0 0 0 0 .135c.4.6 1.236 1.748 2.386 2.735C5.204 11.79 6.522 12.5 8 12.5c1.248 0 2.373-.503 3.35-1.222L9.87 10.19a3 3 0 0 1-4.207-3.046L3.53 5.688Zm3.72 2.694 2.06 1.492a1.5 1.5 0 0 1-2.06-1.492ZM8 3.5c-.516 0-1.017.09-1.499.251a.75.75 0 0 1-.473-1.423A6.207 6.207 0 0 1 8 2c1.981 0 3.67.992 4.933 2.078 1.27 1.09 2.187 2.345 2.637 3.023a1.62 1.62 0 0 1 0 1.798c-.11.166-.248.365-.41.587a.75.75 0 1 1-1.21-.887c.148-.201.272-.382.371-.53a.119.119 0 0 0 0-.137c-.4-.6-1.236-1.748-2.386-2.735C10.796 4.21 9.478 3.5 8 3.5Z' />
                </svg>
            ) : (
                <svg viewBox='0 0 16 16' width='15' height='15' fill='currentColor' aria-hidden>
                    <path d='M8 2c1.981 0 3.671.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 0 1 0 1.798c-.45.678-1.367 1.932-2.637 3.023C11.67 13.008 9.981 14 8 14c-1.981 0-3.671-.992-4.933-2.078C1.797 10.83.88 9.576.43 8.898a1.62 1.62 0 0 1 0-1.798c.45-.677 1.367-1.931 2.637-3.022C4.33 2.992 6.019 2 8 2ZM1.679 7.932a.12.12 0 0 0 0 .136c.411.622 1.241 1.75 2.366 2.717C5.176 11.758 6.527 12.5 8 12.5c1.473 0 2.825-.742 3.955-1.715 1.124-.967 1.954-2.096 2.366-2.717a.12.12 0 0 0 0-.136c-.412-.621-1.242-1.75-2.366-2.717C10.824 4.242 9.473 3.5 8 3.5c-1.473 0-2.825.742-3.955 1.715-1.124.967-1.954 2.096-2.366 2.717ZM8 10a2 2 0 1 1-.001-3.999A2 2 0 0 1 8 10Z' />
                </svg>
            )}
        </button>
    )
}
