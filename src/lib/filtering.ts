import { matchesReview } from './enrichment'
import { matchesProjects } from './projects'
import { sourceKey } from './sources'
import {
    NO_MILESTONE,
    NO_PROJECT,
    type AttentionFilter,
    type Filters,
    type GroupKey,
    type Item,
    type SortKey,
    type Source
} from './types'

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

/**
 * Created or updated after the previous visit (epoch ms). Nothing is new on a first visit,
 * when there is no previous visit to compare with.
 */
export function isNew(item: Item, lastVisit: number | null): boolean {
    return lastVisit !== null && Date.parse(item.updated_at) > lastVisit
}

export interface FilterContext {
    now: number
    /** When the previous visit ended, for the "new" filter; null on a first visit. */
    lastVisit?: number | null
    viewerLogin: string | null
    /** The effective sources, used to resolve which source(s) an item came from. */
    sources: Source[]
}

/** The sources an item belongs to: its repo, or the user/org owning that repo. */
export function itemSources(item: Item, sources: Source[]): Source[] {
    const repo = item.repo.toLowerCase()
    const owner = repo.split('/')[0] ?? ''
    return sources.filter((s) =>
        s.kind === 'repo' ? s.value.toLowerCase() === repo : s.value.toLowerCase() === owner
    )
}

/** Items whose every source is hidden are gone from the list; the rest remain. */
export function visibleBySources(
    items: Item[],
    sources: Source[],
    hiddenSources: string[]
): Item[] {
    if (hiddenSources.length === 0) return items
    const hidden = new Set(hiddenSources)
    return items.filter((item) => {
        const origins = itemSources(item, sources)
        return origins.length === 0 || origins.some((s) => !hidden.has(sourceKey(s)))
    })
}

/**
 * Drop repo, label, author and assignee selections that no visible item can
 * satisfy any more (after hiding, focusing or removing a source), so the list
 * never goes empty because of a filter the user cannot see the reason for.
 */
export function pruneFilters(f: Filters, items: Item[], sources: Source[]): Filters {
    const visible = visibleBySources(items, sources, f.hiddenSources)
    const lower = (v: string) => v.toLowerCase()
    const repos = new Set(visible.map((i) => lower(i.repo)))
    const labels = new Set(visible.flatMap((i) => i.labels.map((l) => lower(l.name))))
    const authors = new Set(visible.flatMap((i) => (i.author ? [lower(i.author.login)] : [])))
    const assignees = new Set(visible.flatMap((i) => i.assignees.map((a) => lower(a.login))))
    const milestones = new Set(visible.map((i) => lower(i.milestone ?? NO_MILESTONE)))
    const projects = new Set(
        visible.flatMap((i) =>
            i.projects
                ? i.projects.length
                    ? i.projects.map((p) => lower(p.projectId))
                    : [lower(NO_PROJECT)]
                : []
        )
    )
    const keep = (list: string[], set: Set<string>) => list.filter((v) => set.has(lower(v)))
    const next = {
        ...f,
        repos: keep(f.repos, repos),
        labels: keep(f.labels, labels),
        authors: keep(f.authors, authors),
        assignees: keep(f.assignees, assignees),
        milestones: keep(f.milestones, milestones),
        projects: keep(f.projects, projects)
    }
    const unchanged =
        next.repos.length === f.repos.length &&
        next.labels.length === f.labels.length &&
        next.authors.length === f.authors.length &&
        next.assignees.length === f.assignees.length &&
        next.milestones.length === f.milestones.length &&
        next.projects.length === f.projects.length
    return unchanged ? f : next
}

/** Items per source key, for the sources panel. */
export function countBySource(items: Item[], sources: Source[]): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const item of items) {
        for (const s of itemSources(item, sources)) {
            const key = sourceKey(s)
            counts[key] = (counts[key] ?? 0) + 1
        }
    }
    return counts
}

/** Apply every filter. Sorting and grouping are separate, composable steps. */
export function applyFilters(items: Item[], f: Filters, ctx: FilterContext): Item[] {
    return items.filter((item) => {
        if (f.type !== 'all' && item.type !== f.type) return false
        if (f.state !== 'all' && item.state !== f.state) return false
        if (f.hideDrafts && item.draft) return false
        if (f.onlyNew && !isNew(item, ctx.lastVisit ?? null)) return false
        if (f.hiddenSources.length > 0) {
            const hidden = new Set(f.hiddenSources)
            const origins = itemSources(item, ctx.sources)
            // An item stays visible as long as one of its sources is visible.
            if (origins.length > 0 && origins.every((s) => hidden.has(sourceKey(s)))) return false
        }
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
        if (f.milestones.length > 0 && !hasAny([item.milestone ?? NO_MILESTONE], f.milestones))
            return false
        if (!matchesProjects(item, f.projects)) return false
        if (f.mine !== 'any') {
            const me = ctx.viewerLogin?.toLowerCase()
            if (!me) return false
            const authored = item.author?.login.toLowerCase() === me
            const assigned = item.assignees.some((a) => a.login.toLowerCase() === me)
            if (f.mine === 'authored' && !authored) return false
            if (f.mine === 'assigned' && !assigned) return false
            if (f.mine === 'involved' && !authored && !assigned) return false
        }
        if (!matchesReview(item, f.review, ctx.viewerLogin)) return false
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
    /** By title across repositories; `repos` is how many repositories share the title. */
    milestones: Array<{ title: string; count: number; repos: number }>
    /** Only items whose memberships are known count; empty when none are. */
    projects: Array<{ id: string; title: string; count: number }>
}

/** Distinct filter values with counts, computed from the full (unfiltered) item set. */
export function computeFacets(items: Item[]): Facets {
    const labels = new Map<string, { name: string; color: string; count: number }>()
    const repos = new Map<string, number>()
    const authors = new Map<string, { login: string; avatar_url: string; count: number }>()
    const assignees = new Map<string, { login: string; avatar_url: string; count: number }>()
    const milestones = new Map<string, { title: string; count: number; repos: Set<string> }>()
    const projects = new Map<string, { id: string; title: string; count: number }>()
    for (const item of items) {
        if (item.projects) {
            const links = item.projects.length
                ? item.projects.map((p) => ({ id: p.projectId, title: p.title }))
                : [{ id: NO_PROJECT, title: NO_PROJECT }]
            for (const l of links) {
                const e = projects.get(l.id)
                if (e) e.count++
                else projects.set(l.id, { ...l, count: 1 })
            }
        }
        const title = item.milestone ?? NO_MILESTONE
        const m = milestones.get(title.toLowerCase())
        if (m) {
            m.count++
            m.repos.add(item.repo)
        } else milestones.set(title.toLowerCase(), { title, count: 1, repos: new Set([item.repo]) })
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
        assignees: Array.from(assignees.values()).sort(byCount),
        milestones: Array.from(milestones.values())
            .map((m) => ({ title: m.title, count: m.count, repos: m.repos.size }))
            .sort((a, b) =>
                // "No milestone" last, the rest by count.
                a.title === NO_MILESTONE ? 1 : b.title === NO_MILESTONE ? -1 : byCount(a, b)
            ),
        projects: Array.from(projects.values()).sort((a, b) =>
            a.id === NO_PROJECT ? 1 : b.id === NO_PROJECT ? -1 : byCount(a, b)
        )
    }
}
