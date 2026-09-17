import clsx from 'clsx'
import { useEffect, useId, useRef, useState } from 'react'
import { copyText, repoUrls } from '@/lib/repo'
import { ExternalIcon } from './ui'

interface Props {
    /** `owner/name` of the repository. */
    repo: string
    onToast: (msg: string) => void
    /** Visible only on hover/focus of the parent `group` element. */
    subtle?: boolean
    className?: string
}

/**
 * Small "⧉" trigger that opens a menu to copy the repository's web URL,
 * HTTPS clone URL or SSH clone URL, or to open it on GitHub.
 */
export function RepoMenu({ repo, onToast, subtle, className }: Props) {
    const [open, setOpen] = useState(false)
    const root = useRef<HTMLDivElement>(null)
    const id = useId()
    const urls = repoUrls(repo)

    useEffect(() => {
        if (!open) return
        const onPointer = (e: PointerEvent) => {
            if (!root.current?.contains(e.target as Node)) setOpen(false)
        }
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation()
                setOpen(false)
            }
        }
        document.addEventListener('pointerdown', onPointer)
        document.addEventListener('keydown', onKey, true)
        return () => {
            document.removeEventListener('pointerdown', onPointer)
            document.removeEventListener('keydown', onKey, true)
        }
    }, [open])

    const copy = async (label: string, text: string) => {
        setOpen(false)
        onToast((await copyText(text)) ? `${label} copied: ${text}` : text)
    }

    const entries: Array<{ label: string; text: string; hint: string }> = [
        { label: 'Repo URL', text: urls.web, hint: 'Web page' },
        { label: 'HTTPS clone URL', text: urls.https, hint: 'git clone over HTTPS' },
        { label: 'SSH clone URL', text: urls.ssh, hint: 'git clone over SSH' }
    ]

    return (
        <div
            ref={root}
            className={clsx('relative inline-flex', className)}
            onClick={(e) => e.stopPropagation()}
        >
            <button
                type='button'
                onClick={() => setOpen((o) => !o)}
                aria-haspopup='menu'
                aria-expanded={open}
                aria-controls={id}
                aria-label={`Copy links for ${repo}`}
                title={`Copy links for ${repo}`}
                className={clsx(
                    'text-faint rounded px-1 leading-none transition hover:bg-white/10 hover:text-white focus-visible:opacity-100',
                    subtle && !open && 'opacity-0 group-hover:opacity-100 focus:opacity-100'
                )}
            >
                <CopyIcon />
            </button>
            {open && (
                <div
                    id={id}
                    role='menu'
                    className='bg-surface border-line shadow-card absolute top-full left-0 z-40 mt-1 min-w-[16rem] rounded-lg border p-1 text-left text-sm font-normal normal-case'
                >
                    <div className='text-faint truncate px-2 py-1 font-mono text-xs'>{repo}</div>
                    {entries.map((entry) => (
                        <button
                            key={entry.label}
                            type='button'
                            role='menuitem'
                            onClick={() => copy(entry.label, entry.text)}
                            className='flex w-full flex-col rounded-md px-2 py-1.5 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none'
                        >
                            <span className='font-semibold text-white'>Copy {entry.label}</span>
                            <span className='text-faint truncate font-mono text-xs'>
                                {entry.text}
                            </span>
                        </button>
                    ))}
                    <a
                        role='menuitem'
                        href={urls.web}
                        target='_blank'
                        rel='noreferrer'
                        onClick={() => setOpen(false)}
                        className='text-secondary-text mt-1 flex items-center gap-1 rounded-md border-t border-white/10 px-2 py-1.5 hover:bg-white/10'
                    >
                        Open on GitHub <ExternalIcon />
                    </a>
                </div>
            )}
        </div>
    )
}

function CopyIcon() {
    return (
        <svg viewBox='0 0 16 16' width='14' height='14' fill='currentColor' aria-hidden>
            <path d='M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z' />
            <path d='M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z' />
        </svg>
    )
}
