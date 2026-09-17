import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GitHubClient, GitHubError, type SearchProgress } from '@/lib/github'
import { effectiveSources, sourceKey } from '@/lib/sources'
import { load, remove, save } from '@/lib/storage'
import type { Item, RateLimit, Settings, Source, StateFilter, Viewer } from '@/lib/types'

interface Cache {
    key: string
    items: Item[]
    /** When the last (incremental or full) fetch started. */
    fetchedAt: number
    /** When the last full fetch started; incremental fetches merge on top of it. */
    fullFetchedAt: number
    truncated: boolean
}

/** Incremental fetches overlap the previous window slightly to survive clock skew. */
const OVERLAP_MS = 5 * 60_000
/** After this long, the next refresh is a full one so drift (transfers, deletions) is corrected. */
const FULL_REFRESH_MS = 6 * 60 * 60_000

export interface RadarState {
    client: GitHubClient
    viewer: Viewer | null
    viewerLoading: boolean
    items: Item[]
    fetchedAt: number | null
    truncated: boolean
    loading: boolean
    progress: SearchProgress | null
    error: string | null
    rateLimit: RateLimit | null
    effective: Source[]
    /** Incremental by default; `full` discards the cache and refetches everything. */
    refresh: (mode?: 'auto' | 'full') => void
    patchItem: (id: number, patch: Partial<Item>) => void
}

const CACHE_KEY = 'cache'

/**
 * Owns everything that talks to GitHub: the client, the viewer, the item list,
 * its cache, and refresh scheduling. The UI only reads state and calls refresh().
 */
export function useRadar(
    token: string | null,
    sources: Source[],
    state: StateFilter,
    settings: Settings,
    onAuthError: () => void
): RadarState {
    const [rateLimit, setRateLimit] = useState<RateLimit | null>(null)
    const client = useMemo(() => new GitHubClient(token, setRateLimit), [token])

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
    const cacheKey = useMemo(
        () => `${state}|${effective.map(sourceKey).sort().join(',')}`,
        [effective, state]
    )

    const [cache, setCache] = useState<Cache | null>(() => {
        const c = load<Cache | null>(CACHE_KEY, null)
        return c && typeof c.fullFetchedAt === 'number' ? c : null
    })
    const [loading, setLoading] = useState(false)
    const [progress, setProgress] = useState<SearchProgress | null>(null)
    const [error, setError] = useState<string | null>(null)
    const abortRef = useRef<AbortController | null>(null)
    const cacheRef = useRef<Cache | null>(null)
    useEffect(() => {
        cacheRef.current = cache
    }, [cache])

    /** A full fetch replaces the cache; an incremental one merges items updated since the last fetch. */
    const run = useCallback(
        async (mode: 'auto' | 'full' = 'auto') => {
            abortRef.current?.abort()
            if (effective.length === 0) {
                setCache(null)
                remove(CACHE_KEY)
                setError(null)
                return
            }
            const controller = new AbortController()
            abortRef.current = controller
            setLoading(true)
            setError(null)
            setProgress(null)
            const base = cacheRef.current
            const incremental =
                mode === 'auto' &&
                base !== null &&
                base.key === cacheKey &&
                Date.now() - base.fullFetchedAt < FULL_REFRESH_MS
            try {
                const startedAt = Date.now()
                const result = await client.search(effective, state, {
                    signal: controller.signal,
                    onProgress: setProgress,
                    ...(incremental
                        ? { since: new Date(base.fetchedAt - OVERLAP_MS).toISOString() }
                        : {})
                })
                if (controller.signal.aborted) return
                let items = result.items
                if (incremental) {
                    const byId = new Map(base.items.map((i) => [i.id, i]))
                    for (const item of result.items) {
                        if (state === 'all' || item.state === state) byId.set(item.id, item)
                        else byId.delete(item.id)
                    }
                    items = Array.from(byId.values())
                }
                const next: Cache = {
                    key: cacheKey,
                    items,
                    fetchedAt: startedAt,
                    fullFetchedAt: incremental ? base.fullFetchedAt : startedAt,
                    truncated: incremental ? base.truncated : result.truncated
                }
                setCache(next)
                save(CACHE_KEY, next)
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
        [client, effective, state, cacheKey, onAuthError]
    )

    // Fetch when the effective query changes, but wait for the viewer when a token is set
    // so that "include mine" does not trigger a second, wider fetch a moment later.
    const waitingForViewer = token !== null && viewerLoading
    useEffect(() => {
        if (waitingForViewer) return
        const fresh = cache?.key === cacheKey && Date.now() - cache.fetchedAt < 60_000
        if (fresh) return
        const id = window.setTimeout(() => void run('auto'), 0)
        return () => window.clearTimeout(id)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- run only when the query identity changes
    }, [cacheKey, waitingForViewer])

    useEffect(() => {
        if (settings.refreshMinutes <= 0) return
        const id = window.setInterval(() => void run(), settings.refreshMinutes * 60_000)
        return () => window.clearInterval(id)
    }, [run, settings.refreshMinutes])

    const patchItem = useCallback((id: number, patch: Partial<Item>) => {
        setCache((c) => {
            if (!c) return c
            const next = { ...c, items: c.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }
            save(CACHE_KEY, next)
            return next
        })
    }, [])

    const matches = cache?.key === cacheKey
    return {
        client,
        viewer,
        viewerLoading,
        // While a full load is running with no matching cache, show the pages already fetched.
        items: matches ? cache.items : loading && progress ? progress.items : [],
        fetchedAt: matches ? cache.fetchedAt : null,
        truncated: matches ? cache.truncated : false,
        loading,
        progress,
        error,
        rateLimit,
        effective,
        refresh: (mode = 'auto') => void run(mode),
        patchItem
    }
}
