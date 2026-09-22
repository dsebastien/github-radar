import type { Item } from './types'

export interface BulkFailure {
    item: Item
    message: string
}

/**
 * Run one action per item, one at a time (GitHub's secondary rate limits punish bursts of
 * writes). Nothing is atomic: every item is tried, failures are collected and returned.
 * Stops early, without failing the rest, when the signal aborts.
 */
export async function runBulk(
    items: Item[],
    action: (item: Item) => Promise<void>,
    onProgress: (done: number, total: number) => void = () => {},
    signal?: AbortSignal
): Promise<BulkFailure[]> {
    const failures: BulkFailure[] = []
    let done = 0
    onProgress(0, items.length)
    for (const item of items) {
        if (signal?.aborted) break
        try {
            await action(item)
        } catch (e) {
            failures.push({ item, message: e instanceof Error ? e.message : String(e) })
        }
        onProgress(++done, items.length)
    }
    return failures
}

/**
 * Ids between `anchor` and `target` in display order, both included, for shift-click range
 * selection. When the anchor is no longer shown, only the target is returned.
 */
export function rangeIds(order: number[], anchor: number | null, target: number): number[] {
    const b = order.indexOf(target)
    const a = anchor === null ? -1 : order.indexOf(anchor)
    if (b === -1) return []
    if (a === -1) return [target]
    return order.slice(Math.min(a, b), Math.max(a, b) + 1)
}

/** How many of the items an option applies to, for "applies to 7 of 12" hints. */
export function applicability(items: Item[], applies: (item: Item) => boolean) {
    const count = items.filter(applies).length
    return {
        count,
        total: items.length,
        none: count === 0,
        hint: count === items.length ? '' : `applies to ${count} of ${items.length}`
    }
}

export interface LabelOption {
    name: string
    color: string
    /** Selected items whose repository has this label. */
    available: number
    /** Selected items that already carry it. */
    applied: number
}

/**
 * Label names offered for a selection: every label of the selected items' repositories, with
 * how many selected items could take it and how many already have it. Names match
 * case-insensitively across repositories, like GitHub does within one.
 */
export function labelOptions(
    items: Item[],
    repoLabels: Record<string, Array<{ name: string; color: string }> | undefined>
): LabelOption[] {
    const byName = new Map<string, LabelOption>()
    for (const item of items) {
        for (const l of repoLabels[item.repo] ?? []) {
            const key = l.name.toLowerCase()
            const o = byName.get(key) ?? { name: l.name, color: l.color, available: 0, applied: 0 }
            o.available++
            if (item.labels.some((x) => x.name.toLowerCase() === key)) o.applied++
            byName.set(key, o)
        }
    }
    return Array.from(byName.values()).sort(
        (a, b) => b.available - a.available || a.name.localeCompare(b.name)
    )
}

export interface MilestoneOption {
    title: string
    /** Selected items whose repository has an open milestone with this title. */
    available: number
    /** Selected items already in it. */
    applied: number
    /** Repositories of the selection that lack it. */
    missingRepos: string[]
}

/**
 * Milestone titles offered for a selection, matched across repositories by title
 * (case-insensitive), with how many items could take each and which repositories lack it.
 */
export function milestoneOptions(
    items: Item[],
    repoMilestones: Record<string, Array<{ title: string }> | undefined>
): MilestoneOption[] {
    const repos = [...new Set(items.map((i) => i.repo))]
    const titles = new Map<string, string>()
    for (const r of repos)
        for (const m of repoMilestones[r] ?? []) {
            if (!titles.has(m.title.toLowerCase())) titles.set(m.title.toLowerCase(), m.title)
        }
    const has = (repo: string, key: string) =>
        (repoMilestones[repo] ?? []).some((m) => m.title.toLowerCase() === key)
    return Array.from(titles, ([key, title]) => ({
        title,
        available: items.filter((i) => has(i.repo, key)).length,
        applied: items.filter((i) => i.milestone?.toLowerCase() === key).length,
        missingRepos: repos.filter((r) => !has(r, key))
    })).sort((a, b) => b.available - a.available || a.title.localeCompare(b.title))
}
