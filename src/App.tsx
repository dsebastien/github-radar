import clsx from 'clsx'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BulkBar } from './components/BulkBar'
import { FilterBar } from './components/FilterBar'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { ItemCard } from './components/ItemCard'
import { ItemDrawer } from './components/ItemDrawer'
import { RepoActionsContext } from './components/RepoActions'
import { RepoMenu } from './components/RepoMenu'
import { LoginDialog, TOKEN_URL } from './components/LoginDialog'
import { Modal } from './components/Modal'
import { SettingsDialog } from './components/SettingsDialog'
import { SourcesPanel } from './components/SourcesPanel'
import { ViewsPanel } from './components/ViewsPanel'
import { StatsRow } from './components/StatsRow'
import { Toasts, type Toast } from './components/Toasts'
import { Button, GitHubIcon, Spinner } from './components/ui'
import { usePersistedState } from './hooks/usePersistedState'
import { useLastVisit } from './hooks/useLastVisit'
import { useRadar } from './hooks/useRadar'
import { rangeIds } from './lib/bulk'
import { isTypingTarget, SHORTCUTS, stepId } from './lib/keyboard'
import { projectOwners } from './lib/projects'
import { daysLeft, expiresSoon } from './lib/token'
import { parseView, VIEW_PARAMS, type SavedView } from './lib/view'
import { mutedCounts, removeNoise, toggleMuted } from './lib/noise'
import {
    applyFilters,
    computeFacets,
    countBySource,
    groupItems,
    isNew,
    itemSources,
    pruneFilters,
    sortItems,
    visibleBySources
} from './lib/filtering'
import { addSource, deserializeSources, removeSource, sourceKey, sourceLabel } from './lib/sources'
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
/** Cards rendered before the "Load more" button. */
const PAGE_SIZE = 50

/**
 * A preset from the page URL, read once: `?sources=` is merged into the persisted sources,
 * and view parameters (filters, sort, grouping) replace the persisted filters. The parameters
 * are then removed from the address.
 */
const urlPreset = (() => {
    let preset: { sources: Source[]; view: Filters | null } | null = null
    return () => {
        if (preset) return preset
        const url = new URL(window.location.href)
        const sources = deserializeSources(url.searchParams.get('sources'))
        const parsed = parseView(url.searchParams)
        const view = Object.keys(parsed).length > 0 ? { ...DEFAULT_FILTERS, ...parsed } : null
        if (VIEW_PARAMS.some((p) => url.searchParams.has(p))) {
            for (const p of VIEW_PARAMS) url.searchParams.delete(p)
            window.history.replaceState(null, '', url.toString())
        }
        preset = { sources, view }
        return preset
    }
})()

function initialSources(): Source[] {
    return urlPreset().sources.reduce(addSource, load<Source[]>('sources', []))
}

export function App() {
    const [sources, setSources] = useState<Source[]>(initialSources)
    useEffect(() => save('sources', sources), [sources])
    const [filters, setFilters] = usePersistedState<Filters>(
        'filters',
        DEFAULT_FILTERS,
        urlPreset().view ?? undefined
    )
    const [views, setViews] = usePersistedState<SavedView[]>('views', [])
    const [settings, setSettings] = usePersistedState<Settings>('settings', DEFAULT_SETTINGS)
    const [token, setToken] = useState<string | null>(() => load<string | null>(TOKEN_KEY, null))
    const [tokenExpiresAt, setTokenExpiresAt] = usePersistedState<number | null>(
        'tokenExpiresAt',
        null
    )
    const [dialog, setDialog] = useState<'login' | 'settings' | 'keys' | null>(null)
    const [selectedId, setSelectedId] = useState<number | null>(null)
    const [toasts, setToasts] = useState<Toast[]>([])
    const [now, setNow] = useState(() => Date.now())
    const [lastVisit, markSeen] = useLastVisit()

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
        setTokenExpiresAt(null)
    }, [setTokenExpiresAt])
    const onAuthError = useCallback(() => {
        logout()
        toast('GitHub rejected the token, so you were logged out. Log in again with a valid token.')
    }, [logout, toast])

    const radar = useRadar(
        token,
        sources,
        filters.hiddenSources,
        filters.state,
        settings,
        onAuthError,
        setTokenExpiresAt
    )

    // Muted repositories and (optionally) bots are noise: out of the list, stats, facets and
    // source counts alike. The sources panel still says how many items are muted.
    const [mutedRepos, setMutedRepos] = usePersistedState<string[]>('mutedRepos', [])
    const denoised = useMemo(
        () => removeNoise(radar.items, { mutedRepos, hideBots: filters.hideBots }),
        [radar.items, mutedRepos, filters.hideBots]
    )
    const muted = useMemo(() => mutedCounts(radar.items, mutedRepos), [radar.items, mutedRepos])
    const repoActions = useMemo(
        () => ({
            isMuted: (repo: string) =>
                mutedRepos.some((r) => r.toLowerCase() === repo.toLowerCase()),
            toggleMute: (repo: string) => setMutedRepos((list) => toggleMuted(list, repo))
        }),
        [mutedRepos, setMutedRepos]
    )
    // Items from hidden sources stay cached but leave the stats and facets.
    const scoped = useMemo(
        () => visibleBySources(denoised, radar.effective, filters.hiddenSources),
        [denoised, radar.effective, filters.hiddenSources]
    )
    const involvementSets = useMemo(
        () =>
            radar.involvement && {
                mentioned: new Set(radar.involvement.mentioned),
                reviewRequested: new Set(radar.involvement.reviewRequested),
                commented: new Set(radar.involvement.commented)
            },
        [radar.involvement]
    )
    // Project memberships mean nothing when the token cannot read projects: no facet, no filter.
    const projectsOn = radar.projectsAvailable === true
    const facets = useMemo(() => {
        const f = computeFacets(scoped)
        return projectsOn ? f : { ...f, projects: [] }
    }, [scoped, projectsOn])
    const shown = useMemo(
        () =>
            sortItems(
                applyFilters(denoised, projectsOn ? filters : { ...filters, projects: [] }, {
                    now,
                    lastVisit,
                    involvement: involvementSets,
                    viewerLogin: radar.viewer?.login ?? null,
                    sources: radar.effective
                }),
                filters.sort
            ),
        [
            denoised,
            filters,
            now,
            lastVisit,
            involvementSets,
            radar.viewer?.login,
            radar.effective,
            projectsOn
        ]
    )
    // "Load more" paging, reset whenever the filtered list changes identity.
    const pageKey = `${JSON.stringify(filters)}|${radar.items.length}`
    const [page, setPage] = useState({ key: pageKey, limit: PAGE_SIZE })
    const limit = page.key === pageKey ? page.limit : PAGE_SIZE
    const visible = useMemo(() => shown.slice(0, limit), [shown, limit])
    const groups = useMemo(() => groupItems(visible, filters.group), [visible, filters.group])
    // Collapsed groups, remembered per grouping mode.
    const [collapsed, setCollapsed] = usePersistedState<Record<string, string[]>>(
        'collapsedGroups',
        {}
    )
    const collapsedKeys = useMemo(
        () => new Set(collapsed[filters.group] ?? []),
        [collapsed, filters.group]
    )
    const setCollapsedKeys = (keys: string[]) =>
        setCollapsed((c) => ({ ...c, [filters.group]: keys }))
    const toggleGroup = (key: string) =>
        setCollapsedKeys(
            collapsedKeys.has(key)
                ? [...collapsedKeys].filter((k) => k !== key)
                : [...collapsedKeys, key]
        )
    const sourceCounts = useMemo(
        () => countBySource(denoised, radar.effective),
        [denoised, radar.effective]
    )
    // A source is "focused" when it is the only visible one among the effective sources.
    const focusedSource = useMemo(() => {
        const hidden = new Set(filters.hiddenSources)
        const visible = radar.effective.filter((s) => !hidden.has(sourceKey(s)))
        return radar.effective.length > 1 && visible.length === 1 ? sourceKey(visible[0]!) : null
    }, [filters.hiddenSources, radar.effective])
    const focusSource = (s: Source) =>
        setFilters((f) =>
            pruneFilters(
                {
                    ...f,
                    hiddenSources:
                        focusedSource === sourceKey(s)
                            ? []
                            : radar.effective.map(sourceKey).filter((k) => k !== sourceKey(s))
                },
                radar.items,
                radar.effective
            )
        )
    const focusRepo = (repo: string) =>
        setFilters((f) => ({
            ...f,
            repos: f.repos.length === 1 && f.repos[0] === repo ? [] : [repo]
        }))
    const toggleSource = (s: Source) =>
        setFilters((f) => {
            const key = sourceKey(s)
            return pruneFilters(
                {
                    ...f,
                    hiddenSources: f.hiddenSources.includes(key)
                        ? f.hiddenSources.filter((k) => k !== key)
                        : [...f.hiddenSources, key]
                },
                radar.items,
                radar.effective
            )
        })
    const removeSourceAndPrune = (s: Source) => {
        const remaining = radar.effective.filter((e) => sourceKey(e) !== sourceKey(s))
        setSources((list) => removeSource(list, s))
        setFilters((f) => {
            const hiddenSources = f.hiddenSources.filter((k) => k !== sourceKey(s))
            return pruneFilters(
                { ...f, hiddenSources },
                visibleBySources(radar.items, remaining, []).filter(
                    (i) => itemSources(i, remaining).length > 0
                ),
                remaining
            )
        })
    }
    // Bulk selection (logged in only): item ids, and the anchor of shift-click ranges.
    const [checked, setChecked] = useState<Set<number>>(() => new Set())
    const [anchor, setAnchor] = useState<number | null>(null)
    const checkedItems = useMemo(
        () => radar.items.filter((i) => checked.has(i.id)),
        [radar.items, checked]
    )
    const shownIds = useMemo(() => shown.map((i) => i.id), [shown])
    const toggleChecked = (id: number, range: boolean) => {
        setChecked((prev) => {
            const next = new Set(prev)
            if (range && anchor !== null) {
                const on = !prev.has(id)
                for (const r of rangeIds(shownIds, anchor, id)) {
                    if (on) next.add(r)
                    else next.delete(r)
                }
            } else if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
        setAnchor(id)
    }
    const allShownChecked = shown.length > 0 && shown.every((i) => checked.has(i.id))
    // Keyboard navigation over the cards in display order (collapsed groups skipped).
    const [activeId, setActiveId] = useState<number | null>(null)
    const navOrder = useMemo(
        () => groups.flatMap((g) => (collapsedKeys.has(g.key) ? [] : g.items.map((i) => i.id))),
        [groups, collapsedKeys]
    )
    const keyState = useRef({ navOrder, activeId, selectedId, dialog, shown, viewer: radar.viewer })
    useEffect(() => {
        keyState.current = { navOrder, activeId, selectedId, dialog, shown, viewer: radar.viewer }
    })
    const toggleCheckedRef = useRef(toggleChecked)
    useEffect(() => {
        toggleCheckedRef.current = toggleChecked
    })
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return
            const k = keyState.current
            if (k.dialog) return
            const move = (delta: number) => {
                const next = stepId(k.navOrder, k.activeId, delta)
                if (next === null) return
                setActiveId(next)
                // With the panel open, j/k walk through the items in it.
                if (k.selectedId !== null) setSelectedId(next)
            }
            const active = k.shown.find((i) => i.id === k.activeId)
            switch (e.key) {
                case 'j':
                    move(1)
                    break
                case 'k':
                    move(-1)
                    break
                case 'Enter':
                    // A focused button or link handles Enter itself.
                    if (e.target !== document.body || !active) return
                    setSelectedId(active.id)
                    break
                case 'o':
                    if (!active) return
                    window.open(active.html_url, '_blank', 'noopener,noreferrer')
                    break
                case 'x':
                    if (!active || !k.viewer) return
                    toggleCheckedRef.current(active.id, false)
                    break
                case '/':
                    document.getElementById('radar-search')?.focus()
                    break
                case '?':
                    setDialog('keys')
                    break
                default:
                    return
            }
            e.preventDefault()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])
    useEffect(() => {
        if (activeId === null) return
        document
            .querySelector(`[data-item-id="${activeId}"]`)
            ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, [activeId])
    const selected =
        selectedId === null ? null : (radar.items.find((i) => i.id === selectedId) ?? null)

    const login = (t: string, expiresAt: number | null) => {
        setToken(t)
        save(TOKEN_KEY, t)
        setTokenExpiresAt(expiresAt)
        setDialog(null)
    }

    /** Probe the token, testing writes on items from the viewer's own repositories if any. */
    const checkPermissions = () => {
        const viewer = radar.viewer
        const own = (i: (typeof radar.items)[number]) =>
            viewer !== null && i.repo.toLowerCase().startsWith(`${viewer.login.toLowerCase()}/`)
        const pick = (type: 'issue' | 'pr') =>
            radar.items.find((i) => i.type === type && own(i)) ??
            radar.items.find((i) => i.type === type) ??
            null
        return radar.client.checkPermissions({
            issue: pick('issue'),
            pr: pick('pr'),
            owners: viewer ? projectOwners(radar.effective, viewer.login) : []
        })
    }

    const resetAll = () => {
        for (const key of [
            'sources',
            'filters',
            'settings',
            TOKEN_KEY,
            'cache',
            'mutedRepos',
            'lastVisit',
            'views',
            'tokenExpiresAt',
            'errors'
        ])
            remove(key)
        window.location.reload()
    }

    const empty = radar.effective.length === 0

    return (
        <RepoActionsContext.Provider value={repoActions}>
            <div className='min-h-screen'>
                <Header
                    viewer={radar.viewer}
                    viewerLoading={radar.viewerLoading}
                    rateLimit={radar.rateLimit}
                    onLogin={() => setDialog('login')}
                    onLogout={logout}
                    onSettings={() => setDialog('settings')}
                    onRefresh={empty ? null : () => radar.refresh('auto')}
                    refreshing={radar.loading}
                />
                {radar.viewer && tokenExpiresAt !== null && expiresSoon(tokenExpiresAt, now) && (
                    <div className='bg-accent-yellow/15 text-accent-yellow border-accent-yellow/30 border-b px-4 py-2 text-center text-sm'>
                        {daysLeft(tokenExpiresAt, now) < 0
                            ? 'Your GitHub token has expired.'
                            : `Your GitHub token expires in ${daysLeft(tokenExpiresAt, now)} day(s), on ${new Date(tokenExpiresAt).toLocaleDateString()}.`}{' '}
                        <a
                            href={TOKEN_URL}
                            target='_blank'
                            rel='noreferrer'
                            className='font-semibold underline'
                        >
                            Create a new one
                        </a>
                        , then log out and back in with it.
                    </div>
                )}
                <Hero empty={empty} />
                <main className='mx-auto grid max-w-[112rem] grid-cols-1 gap-5 px-4 pb-24 lg:grid-cols-[19rem_1fr] 2xl:grid-cols-[21rem_1fr] 2xl:gap-6 2xl:px-8'>
                    <div className='min-w-0 space-y-5'>
                        <SourcesPanel
                            sources={sources}
                            effective={radar.effective}
                            viewer={radar.viewer}
                            onAdd={(s) => setSources((list) => addSource(list, s))}
                            onRemove={removeSourceAndPrune}
                            onToast={toast}
                            hidden={filters.hiddenSources}
                            counts={sourceCounts}
                            onToggleHidden={toggleSource}
                            focused={focusedSource}
                            onFocus={focusSource}
                            muted={muted}
                            onUnmute={(r) => setMutedRepos((list) => toggleMuted(list, r))}
                            filters={filters}
                        />
                        {!empty && (
                            <ViewsPanel
                                views={views}
                                filters={filters}
                                onChange={setViews}
                                onApply={(f) =>
                                    setFilters(
                                        pruneFilters(
                                            { ...DEFAULT_FILTERS, ...f },
                                            radar.items,
                                            radar.effective
                                        )
                                    )
                                }
                            />
                        )}
                        {!radar.viewer && !radar.viewerLoading && (
                            <div className='bg-surface border-line rounded-xl border p-4 text-sm'>
                                <p className='font-semibold'>
                                    See private repositories and act from here
                                </p>
                                <p className='text-muted mt-1'>
                                    Log in with a personal access token to include private
                                    repositories, get a much higher API rate limit, and upvote,
                                    comment, label, assign, close or reopen items.
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
                                    <StatsRow
                                        all={scoped}
                                        shown={shown}
                                        now={now}
                                        newCount={
                                            lastVisit === null
                                                ? null
                                                : scoped.filter((i) => isNew(i, lastVisit)).length
                                        }
                                        onlyNew={filters.onlyNew}
                                        onToggleNew={() =>
                                            setFilters((f) => ({ ...f, onlyNew: !f.onlyNew }))
                                        }
                                    />
                                    {lastVisit !== null &&
                                        scoped.some((i) => isNew(i, lastVisit)) && (
                                            <Button
                                                size='sm'
                                                variant='ghost'
                                                onClick={markSeen}
                                                title='Clear every “new” marker'
                                            >
                                                Mark all seen
                                            </Button>
                                        )}
                                    {radar.viewer && shown.length > 0 && (
                                        <Button
                                            size='sm'
                                            variant='ghost'
                                            onClick={() =>
                                                setChecked(
                                                    allShownChecked ? new Set() : new Set(shownIds)
                                                )
                                            }
                                            title='Select every item matching the filters, for bulk actions'
                                        >
                                            {allShownChecked
                                                ? 'Unselect all'
                                                : `Select all ${shown.length} shown`}
                                        </Button>
                                    )}
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
                                                {timeAgo(
                                                    new Date(radar.fetchedAt).toISOString(),
                                                    now
                                                )}
                                            </span>
                                        ) : null}
                                        <Button
                                            size='sm'
                                            variant='ghost'
                                            onClick={(e) =>
                                                radar.refresh(e.shiftKey ? 'full' : 'auto')
                                            }
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
                                {radar.invalid.length > 0 && (
                                    <div className='text-accent-yellow flex flex-wrap items-center gap-2 text-xs'>
                                        <span>
                                            GitHub cannot search these sources: they do not exist,
                                            or your token cannot see them.
                                        </span>
                                        {radar.invalid.map((s) => (
                                            <button
                                                key={sourceKey(s)}
                                                type='button'
                                                className='rounded border border-current px-1.5 py-0.5 hover:bg-yellow-500/10'
                                                title='Remove this source'
                                                onClick={() => removeSourceAndPrune(s)}
                                            >
                                                {sourceLabel(s)} ✕
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {radar.truncated && (
                                    <p className='text-accent-yellow text-xs'>
                                        GitHub search returns at most 1000 results per query, and a
                                        single day in one repository still exceeded it: some items
                                        are missing.
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

                        {!empty && filters.group !== 'none' && groups.length > 1 && (
                            <div className='text-faint flex items-center justify-end gap-3 text-xs'>
                                <button
                                    type='button'
                                    onClick={() => setCollapsedKeys(groups.map((g) => g.key))}
                                    className='hover:text-white'
                                >
                                    Collapse all
                                </button>
                                <button
                                    type='button'
                                    onClick={() => setCollapsedKeys([])}
                                    className='hover:text-white'
                                >
                                    Expand all
                                </button>
                            </div>
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
                                <section key={g.key} className='grid gap-2 2xl:grid-cols-2'>
                                    {g.key && (
                                        <h2 className='group mt-2 flex items-center gap-2 text-sm font-extrabold 2xl:col-span-2'>
                                            <button
                                                type='button'
                                                onClick={() => toggleGroup(g.key)}
                                                aria-expanded={!collapsedKeys.has(g.key)}
                                                className='flex min-w-0 items-center gap-2 rounded-lg px-1 py-0.5 text-left hover:bg-white/8'
                                            >
                                                <span
                                                    aria-hidden
                                                    className={clsx(
                                                        'text-faint inline-block text-[10px] transition-transform',
                                                        collapsedKeys.has(g.key)
                                                            ? '-rotate-90'
                                                            : 'rotate-0'
                                                    )}
                                                >
                                                    ▼
                                                </span>
                                                <span className='truncate'>{g.key}</span>
                                                <span className='text-faint font-mono text-xs'>
                                                    {g.items.length}
                                                </span>
                                            </button>
                                            {filters.group === 'repo' && (
                                                <RepoMenu repo={g.key} onToast={toast} subtle />
                                            )}
                                        </h2>
                                    )}
                                    {!collapsedKeys.has(g.key) &&
                                        g.items.map((item) => (
                                            <ItemCard
                                                key={item.id}
                                                item={item}
                                                viewerLogin={radar.viewer?.login ?? null}
                                                now={now}
                                                fresh={isNew(item, lastVisit)}
                                                active={item.id === activeId}
                                                selected={item.id === selectedId}
                                                onSelect={() => {
                                                    setSelectedId(item.id)
                                                    setActiveId(item.id)
                                                }}
                                                checked={checked.has(item.id)}
                                                onCheck={
                                                    radar.viewer
                                                        ? (range) => toggleChecked(item.id, range)
                                                        : undefined
                                                }
                                                onRepoClick={focusRepo}
                                                onToast={toast}
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
                        {radar.viewer && checkedItems.length > 0 && (
                            <BulkBar
                                items={checkedItems}
                                client={radar.client}
                                viewer={radar.viewer}
                                onPatch={radar.patchItem}
                                onToast={toast}
                                onClear={() => setChecked(new Set())}
                                loadProjects={
                                    radar.projectsAvailable === false
                                        ? undefined
                                        : radar.loadProjects
                                }
                            />
                        )}
                        {shown.length > visible.length && (
                            <div className='flex flex-col items-center gap-1 py-4'>
                                <Button
                                    variant='secondary'
                                    onClick={() =>
                                        setPage({ key: pageKey, limit: limit + PAGE_SIZE })
                                    }
                                >
                                    Load more
                                </Button>
                                <span className='text-faint text-xs'>
                                    Showing {visible.length} of {shown.length}
                                </span>
                            </div>
                        )}
                    </div>
                </main>

                <footer className='text-faint mx-auto flex max-w-[112rem] flex-col items-center gap-2 px-4 pb-8 text-center text-xs'>
                    <a
                        href='https://github.com/dsebastien/github-radar'
                        target='_blank'
                        rel='noreferrer'
                        className='inline-flex items-center gap-2 rounded-lg bg-white/8 px-3 py-1.5 font-semibold text-white transition hover:bg-white/14'
                    >
                        <GitHubIcon />
                        GitHub Radar is open source (MIT)
                    </a>
                    <p>
                        Made by{' '}
                        <a
                            href='https://dsebastien.net'
                            target='_blank'
                            rel='noreferrer'
                            className='hover:text-white'
                        >
                            Sébastien Dubois
                        </a>
                        . Nothing leaves your browser except requests to api.github.com. Press{' '}
                        <kbd className='font-mono'>?</kbd> for keyboard shortcuts.
                    </p>
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
                            loadProjects={projectsOn ? radar.loadProjects : undefined}
                        />
                    </>
                )}
                {dialog === 'keys' && (
                    <Modal title='Keyboard shortcuts' onClose={() => setDialog(null)}>
                        <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm'>
                            {SHORTCUTS.map(([keys, what]) => (
                                <div key={keys} className='contents'>
                                    <dt>
                                        <kbd className='bg-well rounded px-1.5 py-0.5 font-mono text-xs'>
                                            {keys}
                                        </kbd>
                                    </dt>
                                    <dd className='text-muted'>{what}</dd>
                                </div>
                            ))}
                        </dl>
                    </Modal>
                )}
                {dialog === 'login' && (
                    <LoginDialog onClose={() => setDialog(null)} onToken={login} />
                )}
                {dialog === 'settings' && (
                    <SettingsDialog
                        settings={settings}
                        onChange={setSettings}
                        loggedIn={radar.viewer !== null}
                        projectsAvailable={radar.projectsAvailable}
                        tokenExpiresAt={tokenExpiresAt}
                        onTokenExpiresAt={setTokenExpiresAt}
                        onCheckPermissions={checkPermissions}
                        diagnostics={{
                            rateLimits: radar.rateLimits,
                            cacheInfo: radar.cacheInfo,
                            onResetCache: radar.resetCache
                        }}
                        onClose={() => setDialog(null)}
                        onReset={resetAll}
                    />
                )}
                <Toasts
                    toasts={toasts}
                    onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))}
                />
            </div>
        </RepoActionsContext.Provider>
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
