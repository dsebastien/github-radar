import type { AttentionFilter, Filters, GroupKey, Item, SortKey } from './types'

const DAY = 86_400_000
export const STALE_DAYS = 30
export const DORMANT_DAYS = 90

export type AttentionFlag = Exclude<AttentionFilter, 'any'>

/**
 * Signals that an item may need a human: untouched for a while, missing
 * triage metadata, or a PR still in draft. Pure: `now` is injected.
 */
export function attentionFlags(item: Item, now: number): AttentionFlag[] {
    const flags: AttentionFlag[] = []
    const idleDays = (now - new Date(item.updated_at).getTime()) / DAY
    if (idleDays >= DORMANT_DAYS) flags.push('dormant')
    else if (idleDays >= STALE_DAYS) flags.push('stale')
    if (item.labels.length === 0) flags.push('unlabeled')
    if (item.assignees.length === 0) flags.push('unassigned')
    if (item.draft) flags.push('draft')
    return flags
}

function matchesText(item: Item, needle: string): boolean {
    const n = needle.trim().toLowerCase()
    if (!n) return true
    if (/^#?\d+$/.test(n)) return String(item.number) === n.replace('#', '')
    const hay =
        `${item.title} ${item.repo} #${item.number} ${item.author?.login ?? ''} ${item.labels
            .map((l) => l.name)
            .join(' ')}`.toLowerCase()
    return n.split(/\s+/).every((word) => hay.includes(word))
}

function hasAny(values: string[], wanted: string[]): boolean {
    if (wanted.length === 0) return true
    const set = new Set(values.map((v) => v.toLowerCase()))
    return wanted.some((w) => set.has(w.toLowerCase()))
}

export interface FilterContext {
    now: number
    viewerLogin: string | null
}

/** Apply every filter. Sorting and grouping are separate, composable steps. */
export function applyFilters(items: Item[], f: Filters, ctx: FilterContext): Item[] {
    return items.filter((item) => {
        if (f.type !== 'all' && item.type !== f.type) return false
        if (f.state !== 'all' && item.state !== f.state) return false
        if (f.hideDrafts && item.draft) return false
        if (!matchesText(item, f.text)) return false
        if (
            !hasAny(
                item.labels.map((l) => l.name),
                f.labels
            )
        )
            return false
        if (f.repos.length > 0 && !hasAny([item.repo], f.repos)) return false
        if (f.authors.length > 0 && !hasAny(item.author ? [item.author.login] : [], f.authors))
            return false
        if (
            !hasAny(
                item.assignees.map((a) => a.login),
                f.assignees
            )
        )
            return false
        if (f.mine !== 'any') {
            const me = ctx.viewerLogin?.toLowerCase()
            if (!me) return false
            const authored = item.author?.login.toLowerCase() === me
            const assigned = item.assignees.some((a) => a.login.toLowerCase() === me)
            if (f.mine === 'authored' && !authored) return false
            if (f.mine === 'assigned' && !assigned) return false
            if (f.mine === 'involved' && !authored && !assigned) return false
        }
        if (f.attention !== 'any' && !attentionFlags(item, ctx.now).includes(f.attention))
            return false
        return true
    })
}

export function sortItems(items: Item[], sort: SortKey): Item[] {
    const copy = [...items]
    switch (sort) {
        case 'updated':
            return copy.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        case 'created':
            return copy.sort((a, b) => b.created_at.localeCompare(a.created_at))
        case 'comments':
            return copy.sort(
                (a, b) => b.comments - a.comments || b.updated_at.localeCompare(a.updated_at)
            )
        case 'title':
            return copy.sort((a, b) =>
                a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
            )
    }
}

export interface Group {
    key: string
    items: Item[]
}

/** Group already-sorted items, preserving order within each group. Groups are ordered by size. */
export function groupItems(items: Item[], group: GroupKey): Group[] {
    if (group === 'none') return [{ key: '', items }]
    const map = new Map<string, Item[]>()
    for (const item of items) {
        const key = group === 'repo' ? item.repo : (item.author?.login ?? 'ghost')
        const bucket = map.get(key)
        if (bucket) bucket.push(item)
        else map.set(key, [item])
    }
    return Array.from(map, ([key, items]) => ({ key, items })).sort(
        (a, b) => b.items.length - a.items.length || a.key.localeCompare(b.key)
    )
}

export interface Facets {
    labels: Array<{ name: string; color: string; count: number }>
    repos: Array<{ name: string; count: number }>
    authors: Array<{ login: string; avatar_url: string; count: number }>
    assignees: Array<{ login: string; avatar_url: string; count: number }>
}

/** Distinct filter values with counts, computed from the full (unfiltered) item set. */
export function computeFacets(items: Item[]): Facets {
    const labels = new Map<string, { name: string; color: string; count: number }>()
    const repos = new Map<string, number>()
    const authors = new Map<string, { login: string; avatar_url: string; count: number }>()
    const assignees = new Map<string, { login: string; avatar_url: string; count: number }>()
    for (const item of items) {
        for (const l of item.labels) {
            const e = labels.get(l.name)
            if (e) e.count++
            else labels.set(l.name, { name: l.name, color: l.color, count: 1 })
        }
        repos.set(item.repo, (repos.get(item.repo) ?? 0) + 1)
        if (item.author) {
            const e = authors.get(item.author.login)
            if (e) e.count++
            else authors.set(item.author.login, { ...item.author, count: 1 })
        }
        for (const a of item.assignees) {
            const e = assignees.get(a.login)
            if (e) e.count++
            else assignees.set(a.login, { ...a, count: 1 })
        }
    }
    const byCount = <T extends { count: number }>(a: T, b: T) => b.count - a.count
    return {
        labels: Array.from(labels.values()).sort(byCount),
        repos: Array.from(repos, ([name, count]) => ({ name, count })).sort(byCount),
        authors: Array.from(authors.values()).sort(byCount),
        assignees: Array.from(assignees.values()).sort(byCount)
    }
}
