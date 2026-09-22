import clsx from 'clsx'
import { useState } from 'react'
import { activeView, saveView, type SavedView } from '@/lib/view'
import type { Filters } from '@/lib/types'
import { Button, SectionTitle } from './ui'

interface Props {
    views: SavedView[]
    filters: Filters
    onChange: (views: SavedView[]) => void
    onApply: (filters: Filters) => void
}

/** Named filter presets, saved in this browser. */
export function ViewsPanel({ views, filters, onChange, onApply }: Props) {
    const [name, setName] = useState('')
    const active = activeView(views, filters)
    return (
        <section className='bg-surface border-line shadow-card rounded-xl border p-4'>
            <SectionTitle>Views</SectionTitle>
            {views.length === 0 && (
                <p className='text-faint mb-2 text-xs'>
                    Save the current filters, sort and grouping under a name to come back to them in
                    one click.
                </p>
            )}
            <ul className='space-y-1'>
                {views.map((v) => (
                    <li key={v.name} className='group flex items-center gap-2'>
                        <button
                            type='button'
                            onClick={() => onApply(v.filters)}
                            className={clsx(
                                'min-w-0 flex-1 truncate rounded-lg px-2.5 py-1.5 text-left text-sm transition',
                                active?.name === v.name
                                    ? 'bg-secondary/25 text-secondary-text font-semibold'
                                    : 'bg-white/5 hover:bg-white/10'
                            )}
                        >
                            {v.name}
                        </button>
                        <button
                            type='button'
                            onClick={() => onChange(views.filter((x) => x.name !== v.name))}
                            className='text-faint rounded px-1 text-base leading-none opacity-0 transition group-hover:opacity-100 hover:text-white focus:opacity-100'
                            aria-label={`Delete the view ${v.name}`}
                            title='Delete'
                        >
                            ×
                        </button>
                    </li>
                ))}
            </ul>
            <form
                className='mt-2 flex gap-2'
                onSubmit={(e) => {
                    e.preventDefault()
                    onChange(saveView(views, name, filters))
                    setName('')
                }}
            >
                <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={active ? `Current: ${active.name}` : 'Name this view'}
                    aria-label='View name'
                    className='bg-well border-line focus:border-secondary-text min-w-0 flex-1 rounded-lg border px-3 py-1.5 text-sm outline-none'
                />
                <Button type='submit' size='sm' disabled={!name.trim()}>
                    Save
                </Button>
            </form>
        </section>
    )
}
