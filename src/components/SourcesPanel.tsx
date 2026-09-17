import { useState } from 'react'
import { parseSource, serializeSources, sourceLabel } from '@/lib/sources'
import type { Source, Viewer } from '@/lib/types'
import { Button, SectionTitle } from './ui'

interface Props {
    sources: Source[]
    effective: Source[]
    viewer: Viewer | null
    onAdd: (s: Source) => void
    onRemove: (s: Source) => void
    onToast: (msg: string) => void
}

const KIND_ICON: Record<Source['kind'], string> = { user: '@', org: '⌂', repo: '⎇' }

export function SourcesPanel({ sources, effective, viewer, onAdd, onRemove, onToast }: Props) {
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
                {sources.map((s) => (
                    <li
                        key={sourceLabel(s)}
                        className='group flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-sm'
                    >
                        <span
                            className='text-secondary-text w-4 text-center font-mono text-xs'
                            title={s.kind}
                        >
                            {KIND_ICON[s.kind]}
                        </span>
                        <a
                            href={`https://github.com/${s.value}`}
                            target='_blank'
                            rel='noreferrer'
                            className='truncate font-medium hover:underline'
                        >
                            {s.value}
                        </a>
                        <button
                            type='button'
                            onClick={() => onRemove(s)}
                            className='text-faint ml-auto rounded px-1.5 text-base leading-none opacity-0 transition group-hover:opacity-100 hover:text-white focus:opacity-100'
                            aria-label={`Remove ${s.value}`}
                        >
                            ×
                        </button>
                    </li>
                ))}
                {implicit.map((s) => (
                    <li
                        key={sourceLabel(s)}
                        className='text-muted flex items-center gap-2 rounded-lg border border-dashed border-white/15 px-2.5 py-1.5 text-sm'
                        title={`Added automatically because ${viewer?.login ?? 'you'} are logged in`}
                    >
                        <span className='w-4 text-center font-mono text-xs'>
                            {KIND_ICON[s.kind]}
                        </span>
                        <span className='truncate'>{s.value}</span>
                        <span className='text-faint ml-auto text-[10px] uppercase'>mine</span>
                    </li>
                ))}
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
