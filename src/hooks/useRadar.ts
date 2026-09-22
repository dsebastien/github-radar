import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GitHubClient, GitHubError, type SearchProgress } from '@/lib/github'
import { applyEnrichment, carryEnrichment, ENRICH_BATCH, needsEnrichment } from '@/lib/enrichment'
import { itemSources } from '@/lib/filtering'
import { applyProjects, carryProjects, needsProjects, projectOwners } from '@/lib/projects'
import { effectiveSources, sourceKey } from '@/lib/sources'
import { load, remove, save } from '@/lib/storage'
import type {
    Involvement,
    Item,
    Project,
    RateLimit,
    Settings,
    Source,
    StateFilter,
    Viewer
} from '@/lib/types'

interface SourceStamp {
    /** When the last (incremental or full) fetch of this source started. */
    fetchedAt: number
    /** When the last full fetch of this source started. */
    fullFetchedAt: number
}

interface Cache {
    /** Bumped when the item shape changes, so an older cache is refetched instead of misread. */
    version?: number
    /** The item state the cache was fetched for; a different state discards it. */
    state: StateFilter
    items: Item[]
    /** Per source key: when it was last fetched. Sources without a stamp were never fetched. */
    stamps: Record<string, SourceStamp>
    truncated: boolean
    /** Sources GitHub refused to search at the last fetch (missing, or not visible). */
    invalid?: Source[]
    /** Items the viewer is mentioned in, asked to review, or commented on (logged in). */
    involvement?: Involvement
}

/** A fresh search result keeps the cached enrichments until they are refetched. */
const carry = (prev: Item | undefined, next: Item) =>
    carryProjects(prev, carryEnrichment(prev, next))

/** Incremental fetches overlap the previous window slightly to survive clock skew. */
const OVERLAP_MS = 5 * 60_000
/** After this long, the next refresh of a source is a full one so drift (transfers, deletions) is corrected. */
const FULL_REFRESH_MS = 6 * 60 * 60_000
/** A source fetched this recently is not refetched just because it became visible again. */
const FRESH_MS = 60_000

export interface RadarState {
    client: GitHubClient
    viewer: Viewer | null
    viewerLoading: boolean
    items: Item[]
    fetchedAt: number | null
    truncated: boolean
    /** Visible sources GitHub refused to search: they do not exist or the token cannot see them. */
    invalid: Source[]
    loading: boolean
    progress: SearchProgress | null
    error: string | null
    rateLimit: RateLimit | null
    /** Every source that could be searched (configured + the viewer's own). */
    effective: Source[]
    /** Incremental by default; `full` refetches every visible source from scratch. */
    refresh: (mode?: 'auto' | 'full') => void
    patchItem: (id: number, patch: Partial<Item>) => void
    /** From the last refresh, logged in only. */
    involvement: Involvement | null
    /** null until known; false when the token cannot read projects (no Projects permission). */
    projectsAvailable: boolean | null
    /** Projects of the source owners and the viewer, loaded on demand (logged in only). */
    projects: Project[] | null
    loadProjects: () => Promise<Project[]>
}

const ignoreExpiry = () => {}

const CACHE_KEY = 'cache'
/** 2: items carry `node_id` (GraphQL enrichment). */
const CACHE_VERSION = 2

function loadCache(): Cache | null {
    const c = load<Cache | null>(CACHE_KEY, null)
    return c &&
        c.version === CACHE_VERSION &&
        typeof c.stamps === 'object' &&
        Array.isArray(c.items)
        ? c
        : null
}

/**
 * Owns everything that talks to GitHub: the client, the viewer, the item list,
 * its cache, and refresh scheduling. The UI only reads state and calls refresh().
 *
 * Fetches are scoped to the *visible* sources (effective minus hidden): hiding a
 * source aborts and restarts any in-flight fetch without it, and showing a source
 * only fetches it when its cached items are missing or stale. Results merge into
 * one cache stamped per source, so toggling visibility is instant.
 */
export function useRadar(
    token: string | null,
    sources: Source[],
    hiddenSources: string[],
    state: StateFilter,
    settings: Settings,
    onAuthError: () => void,
    onTokenExpiry: (expiresAt: number) => void = ignoreExpiry
): RadarState {
    const [rateLimit, setRateLimit] = useState<RateLimit | null>(null)
    // onTokenExpiry must be stable (a state setter): a new one would recreate the client.
    const client = useMemo(
        () => new GitHubClient(token, setRateLimit, undefined, onTokenExpiry),
        [token, onTokenExpiry]
    )

    // Keyed by token so that a token change yields `null` immediately without a setState in an effect.
    const [viewerFor, setViewerFor] = useState<{ token: string | null; viewer: Viewer | null }>({
        token: null,
        viewer: null
    })
    const viewer = viewerFor.token === token ? viewerFor.viewer : null
    const viewerLoading = token !== null && viewerFor.token !== token
    useEffect(() => {
        if (!token) return
        let cancelled = false
        client
            .viewer()
            .then((v) => {
                if (!cancelled) setViewerFor({ token, viewer: v })
            })
            .catch((e: unknown) => {
                if (cancelled) return
                if (e instanceof GitHubError && e.status === 401) onAuthError()
                setViewerFor({ token, viewer: null })
            })
        return () => {
            cancelled = true
        }
    }, [client, token, onAuthError])

    const effective = useMemo(
        () => effectiveSources(sources, viewer, settings.includeMine),
        [sources, viewer, settings.includeMine]
    )
    const visible = useMemo(() => {
        const hidden = new Set(hiddenSources)
        return effective.filter((s) => !hidden.has(sourceKey(s)))
    }, [effective, hiddenSources])
    const scopeKey = useMemo(
        () => `${state}|${visible.map(sourceKey).sort().join(',')}`,
        [visible, state]
    )

    const [cache, setCache] = useState<Cache | null>(loadCache)
    const [loading, setLoading] = useState(false)
    const [progress, setProgress] = useState<SearchProgress | null>(null)
    const [error, setError] = useState<string | null>(null)
    const abortRef = useRef<AbortController | null>(null)
    // Keyed by token like the viewer: a new token starts unknown again.
    const [projectsFor, setProjectsFor] = useState<{
        token: string | null
        available: boolean | null
        list: Project[] | null
    }>({ token, available: null, list: null })
    const projectsState =
        projectsFor.token === token ? projectsFor : { token, available: null, list: null }
    const setProjectsAvailable = useCallback(
        (available: boolean) =>
            setProjectsFor((p) => ({
                ...(p.token === token ? p : { list: null }),
                token,
                available
            })),
        [token]
    )
    const projectsRef = useRef<boolean | null>(null)
    useEffect(() => {
        projectsRef.current = projectsState.available
    }, [projectsState.available])
    const cacheRef = useRef<Cache | null>(null)
    useEffect(() => {
        cacheRef.current = cache
    }, [cache])

    /** The cache, unless it was fetched for another item state. */
    const usable = cache && cache.state === state ? cache : null

    const run = useCallback(
        async (mode: 'auto' | 'full' = 'auto') => {
            abortRef.current?.abort()
            if (visible.length === 0) {
                setLoading(false)
                setProgress(null)
                setError(null)
                return
            }
            const controller = new AbortController()
            abortRef.current = controller
            setLoading(true)
            setError(null)
            setProgress(null)

            const base =
                cacheRef.current && cacheRef.current.state === state ? cacheRef.current : null
            const now = Date.now()
            const stamp = (s: Source) => base?.stamps[sourceKey(s)]
            // Sources never fetched, or fetched too long ago, need a full pass; the rest go incremental.
            const full =
                mode === 'full'
                    ? visible
                    : visible.filter((s) => {
                          const st = stamp(s)
                          return !st || now - st.fullFetchedAt >= FULL_REFRESH_MS
                      })
            const fullKeys = new Set(full.map(sourceKey))
            const partial = visible.filter((s) => !fullKeys.has(sourceKey(s)))

            try {
                const byId = new Map<number, Item>((base?.items ?? []).map((i) => [i.id, i]))
                const previous = new Map(byId)
                let truncated = base?.truncated ?? false
                const fetchedKeys = new Set(visible.map(sourceKey))
                const invalid = (base?.invalid ?? []).filter((s) => !fetchedKeys.has(sourceKey(s)))
                const stamps: Record<string, SourceStamp> = { ...(base?.stamps ?? {}) }
                let fetchedBefore = 0
                const onProgress = (p: SearchProgress) =>
                    setProgress({
                        ...p,
                        fetched: fetchedBefore + p.fetched,
                        total: fetchedBefore + p.total
                    })

                if (full.length > 0) {
                    const result = await client.search(full, state, {
                        signal: controller.signal,
                        onProgress
                    })
                    if (controller.signal.aborted) return
                    // Replace what we knew about these sources with the fresh, complete result.
                    for (const [id, item] of byId) {
                        if (itemSources(item, full).length > 0) byId.delete(id)
                    }
                    for (const item of result.items)
                        byId.set(item.id, carry(previous.get(item.id), item))
                    truncated = result.truncated
                    invalid.push(...result.invalid)
                    for (const s of full)
                        stamps[sourceKey(s)] = { fetchedAt: now, fullFetchedAt: now }
                    fetchedBefore = result.items.length
                }
                if (partial.length > 0) {
                    const oldest = Math.min(...partial.map((s) => stamp(s)?.fetchedAt ?? now))
                    const result = await client.search(partial, state, {
                        signal: controller.signal,
                        onProgress,
                        since: new Date(oldest - OVERLAP_MS).toISOString()
                    })
                    if (controller.signal.aborted) return
                    invalid.push(...result.invalid)
                    for (const item of result.items) {
                        if (state === 'all' || item.state === state)
                            byId.set(item.id, carry(previous.get(item.id), item))
                        else byId.delete(item.id)
                    }
                    for (const s of partial) {
                        const st = stamp(s)
                        stamps[sourceKey(s)] = {
                            fetchedAt: now,
                            fullFetchedAt: st?.fullFetchedAt ?? now
                        }
                    }
                }
                const next: Cache = {
                    version: CACHE_VERSION,
                    state,
                    items: Array.from(byId.values()),
                    stamps,
                    truncated,
                    invalid
                }
                setCache(next)
                save(CACHE_KEY, next)

                // Review and CI state of pull requests, then project memberships: GraphQL, so
                // logged in only. Failures leave the items as they are; the next refresh retries.
                if (client.authenticated) {
                    let items = next.items
                    const targets = needsEnrichment(items)
                    for (let i = 0; i < targets.length; i += ENRICH_BATCH) {
                        const ids = targets.slice(i, i + ENRICH_BATCH).map((t) => t.node_id)
                        try {
                            const nodes = await client.pullRequestDetails(ids, controller.signal)
                            if (controller.signal.aborted) return
                            items = applyEnrichment(items, nodes)
                        } catch (e) {
                            if (controller.signal.aborted) return
                            setError(
                                `Pull request details could not be loaded: ${
                                    e instanceof Error ? e.message : String(e)
                                }`
                            )
                            break
                        }
                    }
                    if (projectsRef.current === null && viewer) {
                        const readable = await client.canReadProjects(
                            projectOwners(visible, viewer.login),
                            controller.signal
                        )
                        if (controller.signal.aborted) return
                        projectsRef.current = readable
                        setProjectsAvailable(readable)
                    }
                    if (projectsRef.current === true) {
                        const stale = needsProjects(items, Date.now())
                        for (let i = 0; i < stale.length; i += ENRICH_BATCH) {
                            const ids = stale.slice(i, i + ENRICH_BATCH).map((t) => t.node_id)
                            try {
                                const nodes = await client.projectMemberships(
                                    ids,
                                    controller.signal
                                )
                                if (controller.signal.aborted) return
                                items = applyProjects(items, nodes, Date.now())
                            } catch (e) {
                                if (controller.signal.aborted) return
                                if (e instanceof GitHubError && e.status === 403) {
                                    setProjectsAvailable(false)
                                } else {
                                    setError(
                                        `Project memberships could not be loaded: ${
                                            e instanceof Error ? e.message : String(e)
                                        }`
                                    )
                                }
                                break
                            }
                        }
                    }
                    // Involvement searches (mentions, review requests, comments): a few more
                    // queries per refresh, merged as flags. Kept from the last success on error.
                    let involvement = base?.involvement
                    try {
                        involvement = await client.involvement(state, controller.signal)
                        if (controller.signal.aborted) return
                    } catch (e) {
                        if (controller.signal.aborted) return
                        setError(
                            `Mentions, review requests and comments could not be loaded: ${
                                e instanceof Error ? e.message : String(e)
                            }`
                        )
                    }
                    if (items !== next.items || involvement !== next.involvement) {
                        const enriched = { ...next, items, involvement }
                        setCache(enriched)
                        save(CACHE_KEY, enriched)
                    }
                }
            } catch (e: unknown) {
                if (controller.signal.aborted) return
                if (e instanceof GitHubError && e.status === 401) onAuthError()
                setError(e instanceof Error ? e.message : String(e))
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false)
                    setProgress(null)
                }
            }
        },
        [client, visible, state, onAuthError, setProjectsAvailable, viewer]
    )

    // Fetch when the visible scope changes: an in-flight fetch is aborted and restarted for the
    // new scope; sources with fresh cached items are left alone. Waits for the viewer when a
    // token is set so that "include mine" does not trigger a second, wider fetch a moment later.
    const waitingForViewer = token !== null && viewerLoading
    useEffect(() => {
        if (waitingForViewer) return
        const inFlight = abortRef.current !== null && !abortRef.current.signal.aborted
        const c = cacheRef.current
        const needsFetch = visible.some((s) => {
            const st = c && c.state === state ? c.stamps[sourceKey(s)] : undefined
            return !st || Date.now() - st.fetchedAt >= FRESH_MS
        })
        if (!inFlight && !needsFetch) return
        const id = window.setTimeout(() => void run('auto'), 0)
        return () => window.clearTimeout(id)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- run only when the scope identity changes
    }, [scopeKey, waitingForViewer])

    useEffect(() => {
        if (settings.refreshMinutes <= 0) return
        const id = window.setInterval(() => void run('auto'), settings.refreshMinutes * 60_000)
        return () => window.clearInterval(id)
    }, [run, settings.refreshMinutes])

    const loadProjects = useCallback(async () => {
        if (projectsState.list) return projectsState.list
        if (!viewer) return []
        const lists = await Promise.all(
            projectOwners(effective, viewer.login).map((o) =>
                client.ownerProjects(o).catch(() => [])
            )
        )
        const seen = new Set<string>()
        const list = lists.flat().filter((p) => !seen.has(p.id) && seen.add(p.id))
        setProjectsFor((p) => ({ ...p, token, list }))
        return list
    }, [client, effective, viewer, token, projectsState.list])

    const patchItem = useCallback((id: number, patch: Partial<Item>) => {
        setCache((c) => {
            if (!c) return c
            const next = { ...c, items: c.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }
            save(CACHE_KEY, next)
            return next
        })
    }, [])

    // While a fetch is running, show the pages already received on top of the cache.
    const items = useMemo(() => {
        const cached = usable?.items ?? []
        if (!loading || !progress || progress.items.length === 0) return cached
        const byId = new Map(cached.map((i) => [i.id, i]))
        for (const item of progress.items) byId.set(item.id, item)
        return Array.from(byId.values())
    }, [usable, loading, progress])

    const invalid = useMemo(() => {
        const keys = new Set(visible.map(sourceKey))
        return (usable?.invalid ?? []).filter((s) => keys.has(sourceKey(s)))
    }, [usable, visible])

    const fetchedAt = useMemo(() => {
        if (!usable || visible.length === 0) return null
        const times = visible.map((s) => usable.stamps[sourceKey(s)]?.fetchedAt ?? 0)
        const oldest = Math.min(...times)
        return oldest > 0 ? oldest : null
    }, [usable, visible])

    return {
        client,
        viewer,
        viewerLoading,
        items,
        fetchedAt,
        truncated: usable?.truncated ?? false,
        invalid,
        loading,
        progress,
        error,
        rateLimit,
        effective,
        refresh: (mode = 'auto') => void run(mode),
        patchItem,
        involvement: (token !== null && usable?.involvement) || null,
        projectsAvailable: projectsState.available,
        projects: projectsState.list,
        loadProjects
    }
}

export function clearRadarCache(): void {
    remove(CACHE_KEY)
}
