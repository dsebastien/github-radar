import { serializeSources } from './sources'
import { DEFAULT_FILTERS, type Filters, type Source } from './types'

/** Allowed values of the enum filters; anything else in a URL is ignored. */
const ENUMS: Partial<Record<keyof Filters, readonly string[]>> = {
    type: ['all', 'issue', 'pr'],
    state: ['open', 'closed', 'all'],
    mine: ['any', 'assigned', 'authored', 'involved'],
    attention: ['any', 'stale', 'dormant', 'unlabeled', 'unassigned', 'draft'],
    review: [
        'any',
        'needs-my-review',
        'review-required',
        'approved',
        'changes-requested',
        'failing',
        'ready'
    ],
    sort: ['updated', 'created', 'comments', 'title'],
    group: ['none', 'repo', 'author']
}

const KEYS = Object.keys(DEFAULT_FILTERS) as Array<keyof Filters>

/**
 * The filters as URL parameters, only where they differ from the defaults. Lists repeat their
 * key (`labels=a&labels=b`) so values may contain commas; booleans are `1`.
 */
export function serializeView(f: Filters): URLSearchParams {
    const params = new URLSearchParams()
    for (const key of KEYS) {
        const value = f[key]
        const fallback = DEFAULT_FILTERS[key]
        if (Array.isArray(value)) for (const v of value) params.append(key, v)
        else if (typeof value === 'boolean') {
            if (value !== fallback) params.set(key, value ? '1' : '0')
        } else if (value !== fallback) params.set(key, value)
    }
    return params
}

/** Inverse of serializeView: the filter keys present in the URL, validated. */
export function parseView(params: URLSearchParams): Partial<Filters> {
    const out: Record<string, unknown> = {}
    for (const key of KEYS) {
        if (!params.has(key)) continue
        const fallback = DEFAULT_FILTERS[key]
        if (Array.isArray(fallback)) out[key] = params.getAll(key).filter(Boolean)
        else if (typeof fallback === 'boolean') out[key] = params.get(key) === '1'
        else {
            const v = params.get(key) ?? ''
            const allowed = ENUMS[key]
            if (!allowed || allowed.includes(v)) out[key] = v
        }
    }
    return out
}

/** Every URL parameter this app reads, so a loaded preset can be removed from the address. */
export const VIEW_PARAMS: string[] = ['sources', ...KEYS]

/** A link that restores the sources and the whole view (filters, sort, grouping). */
export function shareUrl(base: string, sources: Source[], filters: Filters): string {
    const url = new URL(base)
    const params = serializeView(filters)
    const search = new URLSearchParams()
    if (sources.length) search.set('sources', serializeSources(sources))
    for (const [k, v] of params) search.append(k, v)
    url.search = search.toString()
    url.hash = ''
    return url.toString()
}

export interface SavedView {
    name: string
    filters: Filters
}

/** Save a view under a name, replacing one with the same name (case-insensitive). */
export function saveView(views: SavedView[], name: string, filters: Filters): SavedView[] {
    const n = name.trim()
    if (!n) return views
    const rest = views.filter((v) => v.name.toLowerCase() !== n.toLowerCase())
    return [...rest, { name: n, filters }]
}

/** The saved view matching the filters exactly, if any. */
export function activeView(views: SavedView[], filters: Filters): SavedView | null {
    const key = JSON.stringify({ ...DEFAULT_FILTERS, ...filters })
    return views.find((v) => JSON.stringify({ ...DEFAULT_FILTERS, ...v.filters }) === key) ?? null
}
