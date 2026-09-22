import { useState } from 'react'
import type { GitHubClient } from '@/lib/github'
import type { Item, Project, ProjectLink } from '@/lib/types'
import { Button, Spinner } from './ui'

interface Props {
    item: Item
    client: GitHubClient
    loadProjects: () => Promise<Project[]>
    onPatch: (patch: Partial<Item>) => void
    onToast: (msg: string) => void
}

/** The item panel's project memberships: status per project, and adding to another project. */
export function ProjectsSection({ item, client, loadProjects, onPatch, onToast }: Props) {
    const [projects, setProjects] = useState<Project[] | null>(null)
    const [busy, setBusy] = useState(false)
    const [adding, setAdding] = useState(false)
    const links = item.projects ?? []

    const withProjects = async <T,>(
        fn: (list: Project[]) => Promise<T>
    ): Promise<T | undefined> => {
        setBusy(true)
        try {
            const list = projects ?? (await loadProjects())
            setProjects(list)
            return await fn(list)
        } catch (e) {
            onToast(e instanceof Error ? e.message : String(e))
            return undefined
        } finally {
            setBusy(false)
        }
    }

    const setStatus = (link: ProjectLink, optionId: string) =>
        withProjects(async (list) => {
            const p = list.find((x) => x.id === link.projectId)
            const option = p?.status?.options.find((o) => o.id === optionId)
            if (!p?.status || !option) return
            await client.setProjectStatus(p.id, link.itemId, p.status.fieldId, option.id)
            onPatch({
                projects: links.map((l) =>
                    l.itemId === link.itemId ? { ...l, status: option.name } : l
                )
            })
        })

    const add = (projectId: string) =>
        withProjects(async (list) => {
            const p = list.find((x) => x.id === projectId)
            if (!p) return
            const itemId = await client.addToProject(p.id, item)
            onPatch({
                projects: [...links, { projectId: p.id, itemId, title: p.title, status: null }]
            })
            setAdding(false)
            onToast(`Added to ${p.title}.`)
        })

    const statusOptions = (link: ProjectLink) =>
        projects?.find((p) => p.id === link.projectId)?.status?.options ?? null

    return (
        <div className='border-line border-b p-3 text-xs'>
            <div className='flex flex-wrap items-center gap-2'>
                <span className='text-muted font-semibold'>Projects</span>
                {item.projects === undefined && <span className='text-faint'>not loaded yet</span>}
                {links.length === 0 && item.projects && <span className='text-faint'>none</span>}
                {links.map((l) => {
                    const options = statusOptions(l)
                    return (
                        <span
                            key={l.itemId}
                            className='flex items-center gap-1 rounded-lg bg-white/8 px-2 py-1'
                        >
                            ▦ {l.title}
                            {options ? (
                                <select
                                    value={options.find((o) => o.name === l.status)?.id ?? ''}
                                    onChange={(e) => void setStatus(l, e.target.value)}
                                    disabled={busy}
                                    aria-label={`Status in ${l.title}`}
                                    className='bg-well border-line rounded border px-1 py-0.5'
                                >
                                    <option value='' disabled>
                                        No status
                                    </option>
                                    {options.map((o) => (
                                        <option key={o.id} value={o.id}>
                                            {o.name}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <button
                                    type='button'
                                    className='text-secondary-text hover:underline'
                                    onClick={() => void withProjects(() => Promise.resolve())}
                                    title='Change the status'
                                >
                                    {l.status ?? 'No status'}
                                </button>
                            )}
                        </span>
                    )
                })}
                <Button
                    size='sm'
                    variant='ghost'
                    onClick={() => {
                        setAdding((a) => !a)
                        void withProjects(() => Promise.resolve())
                    }}
                    disabled={busy}
                >
                    + Add to project
                </Button>
                {busy && <Spinner />}
            </div>
            {adding && projects && (
                <div className='mt-2 flex flex-wrap gap-1.5'>
                    {projects
                        .filter((p) => !links.some((l) => l.projectId === p.id))
                        .map((p) => (
                            <Button
                                key={p.id}
                                size='sm'
                                onClick={() => void add(p.id)}
                                disabled={busy}
                                title={`${p.owner} #${p.number}`}
                            >
                                ▦ {p.title}
                                <span className='text-faint font-normal'>{p.owner}</span>
                            </Button>
                        ))}
                    {projects.length === 0 && (
                        <span className='text-faint'>No open projects found for these owners.</span>
                    )}
                </div>
            )}
        </div>
    )
}
