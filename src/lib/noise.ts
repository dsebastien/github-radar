import { DORMANT_DAYS } from './filtering'
import type { Actor, Item, RepoInfo } from './types'

const DAY = 86_400_000

/** Well-known automation accounts that do not always carry the `[bot]` suffix. */
const BOT_LOGINS = /^(dependabot|renovate|github-actions|dependabot-preview|renovate-bot)$/i

/** A GitHub App or automation account: typed Bot by GitHub, `[bot]` login, or a known name. */
export function isBot(actor: Actor | null): boolean {
    if (!actor) return false
    return actor.bot === true || /\[bot\]$/i.test(actor.login) || BOT_LOGINS.test(actor.login)
}

export type RepoStatus = 'archived' | 'dormant'

/**
 * Archived wins over dormant; a repository is dormant when nothing was pushed to it for
 * DORMANT_DAYS. Unknown repositories (and empty ones) have no status. Pure: `now` is injected.
 */
export function repoStatus(info: RepoInfo | undefined, now: number): RepoStatus | null {
    if (!info) return null
    if (info.archived) return 'archived'
    if (info.pushedAt && now - Date.parse(info.pushedAt) >= DORMANT_DAYS * DAY) return 'dormant'
    return null
}

export interface NoiseRules {
    /** `owner/name` of muted repositories, compared case-insensitively. */
    mutedRepos: string[]
    hideBots: boolean
    hideArchived?: boolean
    hideDormant?: boolean
    /** Per lowercased `owner/name`; repositories missing from it are never hidden. */
    repoInfo?: Record<string, RepoInfo>
    now?: number
}

/**
 * Drop items the user decided are noise. Applied before stats, facets and source counts, so
 * that everything shown follows the rules; mutedCounts() keeps the muted part visible.
 */
export function removeNoise(items: Item[], rules: NoiseRules): Item[] {
    const byStatus = (rules.hideArchived || rules.hideDormant) && rules.repoInfo
    if (rules.mutedRepos.length === 0 && !rules.hideBots && !byStatus) return items
    const muted = new Set(rules.mutedRepos.map((r) => r.toLowerCase()))
    const now = rules.now ?? Date.now()
    const hiddenStatus = (repo: string) => {
        if (!byStatus) return false
        const status = repoStatus(rules.repoInfo?.[repo.toLowerCase()], now)
        return (
            (status === 'archived' && rules.hideArchived === true) ||
            (status === 'dormant' && rules.hideDormant === true)
        )
    }
    return items.filter(
        (i) =>
            !muted.has(i.repo.toLowerCase()) &&
            !(rules.hideBots && isBot(i.author)) &&
            !hiddenStatus(i.repo)
    )
}

/** Items per repository status, for the "hide archived / dormant" toggles. */
export function statusCounts(
    items: Item[],
    repoInfo: Record<string, RepoInfo>,
    now: number
): Record<RepoStatus, number> {
    const counts: Record<RepoStatus, number> = { archived: 0, dormant: 0 }
    for (const i of items) {
        const status = repoStatus(repoInfo[i.repo.toLowerCase()], now)
        if (status) counts[status]++
    }
    return counts
}

/** Items per muted repository, for the "N muted" summary. Muted repos without items count 0. */
export function mutedCounts(items: Item[], mutedRepos: string[]): Record<string, number> {
    const counts: Record<string, number> = Object.fromEntries(mutedRepos.map((r) => [r, 0]))
    const byLower = new Map(mutedRepos.map((r) => [r.toLowerCase(), r]))
    for (const i of items) {
        const key = byLower.get(i.repo.toLowerCase())
        if (key !== undefined) counts[key] = (counts[key] ?? 0) + 1
    }
    return counts
}

export function toggleMuted(mutedRepos: string[], repo: string): string[] {
    const lower = repo.toLowerCase()
    return mutedRepos.some((r) => r.toLowerCase() === lower)
        ? mutedRepos.filter((r) => r.toLowerCase() !== lower)
        : [...mutedRepos, repo]
}
