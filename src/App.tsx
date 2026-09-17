import { useCallback, useEffect, useMemo, useState } from 'react'
import { FilterBar } from './components/FilterBar'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { ItemCard } from './components/ItemCard'
import { ItemDrawer } from './components/ItemDrawer'
import { LoginDialog } from './components/LoginDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { SourcesPanel } from './components/SourcesPanel'
import { StatsRow } from './components/StatsRow'
import { Toasts, type Toast } from './components/Toasts'
import { Button, Spinner } from './components/ui'
import { usePersistedState } from './hooks/usePersistedState'
import { useRadar } from './hooks/useRadar'
import { applyFilters, computeFacets, groupItems, sortItems } from './lib/filtering'
import { addSource, deserializeSources, removeSource } from './lib/sources'
import { load, remove, save } from './lib/storage'
import {
    DEFAULT_FILTERS,
    DEFAULT_SETTINGS,
    type Filters,
    type Settings,
    type Source
} from './lib/types'
import { timeAgo } from './lib/utils'

const TOKEN_KEY = 'token'

/** Sources from `?sources=` are merged into the persisted list once, then the param is removed. */
function initialSources(): Source[] {
    const stored = load<Source[]>('sources', [])
    const url = new URL(window.location.href)
    const fromUrl = deserializeSources(url.searchParams.get('sources'))
    if (fromUrl.length === 0) return stored
    url.searchParams.delete('sources')
    window.history.replaceState(null, '', url.toString())
    return fromUrl.reduce(addSource, stored)
}

export function App() {
    const [sources, setSources] = useState<Source[]>(initialSources)
    useEffect(() => save('sources', sources), [sources])
    const [filters, setFilters] = usePersistedState<Filters>('filters', DEFAULT_FILTERS)
    const [settings, setSettings] = usePersistedState<Settings>('settings', DEFAULT_SETTINGS)
    const [token, setToken] = useState<string | null>(() => load<string | null>(TOKEN_KEY, null))
    const [dialog, setDialog] = useState<'login' | 'settings' | null>(null)
    const [selectedId, setSelectedId] = useState<number | null>(null)
    const [toasts, setToasts] = useState<Toast[]>([])
    const [now, setNow] = useState(() => Date.now())

    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), 60_000)
        return () => window.clearInterval(id)
    }, [])

    const toast = useCallback((message: string) => {
        const id = Date.now() + Math.random()
        setToasts((t) => [...t, { id, message }])
        window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000)
    }, [])

    const logout = useCallback(() => {
        setToken(null)
        remove(TOKEN_KEY)
    }, [])
    const onAuthError = useCallback(() => {
        logout()
        toast('GitHub rejected the token, so you were logged out. Log in again with a valid token.')
    }, [logout, toast])

    const radar = useRadar(token, sources, filters.state, settings, onAuthError)

    const facets = useMemo(() => computeFacets(radar.items), [radar.items])
    const shown = useMemo(
        () =>
            sortItems(
                applyFilters(radar.items, filters, {
                    now,
                    viewerLogin: radar.viewer?.login ?? null
                }),
                filters.sort
            ),
        [radar.items, filters, now, radar.viewer?.login]
    )
    const groups = useMemo(() => groupItems(shown, filters.group), [shown, filters.group])
    const selected =
        selectedId === null ? null : (radar.items.find((i) => i.id === selectedId) ?? null)

    const login = (t: string) => {
        setToken(t)
        save(TOKEN_KEY, t)
        setDialog(null)
    }

    const resetAll = () => {
        for (const key of ['sources', 'filters', 'settings', TOKEN_KEY, 'cache']) remove(key)
        window.location.reload()
    }

    const empty = radar.effective.length === 0

    return (
        <div className='min-h-screen'>
            <Header
                viewer={radar.viewer}
                viewerLoading={radar.viewerLoading}
                rateLimit={radar.rateLimit}
                onLogin={() => setDialog('login')}
                onLogout={logout}
                onSettings={() => setDialog('settings')}
            />
            <Hero empty={empty} />
            <main className='mx-auto grid max-w-7xl grid-cols-1 gap-5 px-4 pb-24 lg:grid-cols-[19rem_1fr]'>
                <div className='min-w-0 space-y-5'>
                    <SourcesPanel
                        sources={sources}
                        effective={radar.effective}
                        viewer={radar.viewer}
                        onAdd={(s) => setSources((list) => addSource(list, s))}
                        onRemove={(s) => setSources((list) => removeSource(list, s))}
                        onToast={toast}
                    />
                    {!radar.viewer && !radar.viewerLoading && (
                        <div className='bg-surface border-line rounded-xl border p-4 text-sm'>
                            <p className='font-semibold'>
                                See private repositories and act from here
                            </p>
                            <p className='text-muted mt-1'>
                                Log in with a personal access token to include private repositories,
                                get a much higher API rate limit, and upvote, comment, label,
                                assign, close or reopen items.
                            </p>
                            <Button
                                variant='primary'
                                size='sm'
                                className='mt-3'
                                onClick={() => setDialog('login')}
                            >
                                Log in with a token
                            </Button>
                        </div>
                    )}
                </div>

                <div className='min-w-0 space-y-4'>
                    {!empty && (
                        <div className='bg-surface border-line shadow-card rounded-xl border p-4'>
                            <div className='mb-3 flex flex-wrap items-center gap-3'>
                                <StatsRow all={radar.items} shown={shown} now={now} />
                                <div className='text-muted ml-auto flex items-center gap-2 text-xs'>
                                    {radar.loading ? (
                                        <>
                                            <Spinner />
                                            {radar.progress
                                                ? `${radar.progress.fetched}/${radar.progress.total}`
                                                : 'Fetching…'}
                                        </>
                                    ) : radar.fetchedAt ? (
                                        <span>
                                            updated{' '}
                                            {timeAgo(new Date(radar.fetchedAt).toISOString(), now)}
                                        </span>
                                    ) : null}
                                    <Button
                                        size='sm'
                                        variant='ghost'
                                        onClick={(e) => radar.refresh(e.shiftKey ? 'full' : 'auto')}
                                        disabled={radar.loading}
                                        title='Fetch what changed since the last refresh. Shift+click to refetch everything.'
                                    >
                                        ↻ Refresh
                                    </Button>
                                </div>
                            </div>
                            {radar.error && (
                                <p className='rounded-lg bg-red-500/15 p-3 text-sm text-red-200'>
                                    {radar.error}
                                </p>
                            )}
                            {radar.truncated && (
                                <p className='text-accent-yellow text-xs'>
                                    GitHub search returns at most 1000 results per query. Narrow
                                    your sources or split them to see everything.
                                </p>
                            )}
                        </div>
                    )}

                    {!empty && (
                        <FilterBar
                            filters={filters}
                            facets={facets}
                            viewer={radar.viewer}
                            onChange={setFilters}
                        />
                    )}

                    {empty ? (
                        <EmptyState />
                    ) : shown.length === 0 && !radar.loading ? (
                        <div className='bg-surface border-line rounded-xl border p-10 text-center'>
                            <p className='text-lg font-bold'>Nothing matches.</p>
                            <p className='text-muted mt-1 text-sm'>
                                {radar.items.length === 0
                                    ? 'No items were found for these sources.'
                                    : 'Loosen the filters to see more.'}
                            </p>
                            {radar.items.length > 0 && (
                                <Button
                                    size='sm'
                                    className='mt-4'
                                    onClick={() => setFilters(DEFAULT_FILTERS)}
                                >
                                    Reset filters
                                </Button>
                            )}
                        </div>
                    ) : (
                        groups.map((g) => (
                            <section key={g.key} className='space-y-2'>
                                {g.key && (
                                    <h2 className='mt-2 flex items-center gap-2 text-sm font-extrabold'>
                                        {g.key}
                                        <span className='text-faint font-mono text-xs'>
                                            {g.items.length}
                                        </span>
                                    </h2>
                                )}
                                {g.items.map((item) => (
                                    <ItemCard
                                        key={item.id}
                                        item={item}
                                        now={now}
                                        selected={item.id === selectedId}
                                        onSelect={() => setSelectedId(item.id)}
                                        onLabelClick={(name) =>
                                            setFilters((f) => ({
                                                ...f,
                                                labels: f.labels.includes(name)
                                                    ? f.labels
                                                    : [...f.labels, name]
                                            }))
                                        }
                                    />
                                ))}
                            </section>
                        ))
                    )}
                </div>
            </main>

            <footer className='text-faint mx-auto max-w-7xl px-4 pb-8 text-center text-xs'>
                <a
                    href='https://github.com/dsebastien/github-radar'
                    target='_blank'
                    rel='noreferrer'
                    className='hover:text-white'
                >
                    GitHub Radar
                </a>{' '}
                is open source (MIT), by{' '}
                <a
                    href='https://dsebastien.net'
                    target='_blank'
                    rel='noreferrer'
                    className='hover:text-white'
                >
                    Sébastien Dubois
                </a>
                . Nothing leaves your browser except requests to api.github.com.
            </footer>

            {selected && (
                <>
                    <div
                        className='fixed inset-0 z-30 bg-black/40'
                        onClick={() => setSelectedId(null)}
                    />
                    <ItemDrawer
                        key={selected.id}
                        item={selected}
                        client={radar.client}
                        viewer={radar.viewer}
                        now={now}
                        onClose={() => setSelectedId(null)}
                        onPatch={(patch) => radar.patchItem(selected.id, patch)}
                        onToast={toast}
                        onLogin={() => setDialog('login')}
                    />
                </>
            )}
            {dialog === 'login' && <LoginDialog onClose={() => setDialog(null)} onToken={login} />}
            {dialog === 'settings' && (
                <SettingsDialog
                    settings={settings}
                    onChange={setSettings}
                    loggedIn={radar.viewer !== null}
                    onClose={() => setDialog(null)}
                    onReset={resetAll}
                />
            )}
            <Toasts
                toasts={toasts}
                onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))}
            />
        </div>
    )
}

function EmptyState() {
    return (
        <div className='bg-surface border-line rounded-xl border p-10 text-center'>
            <div className='text-5xl'>📡</div>
            <p className='mt-3 text-lg font-bold'>Nothing on the radar yet.</p>
            <p className='text-muted mx-auto mt-1 max-w-md text-sm'>
                Add a user, an organization or a repository on the left. Open issues and pull
                requests from all of them show up here, with filters that remember themselves.
            </p>
        </div>
    )
}
