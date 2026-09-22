import type { Actor, Item } from './types'

/** Well-known automation accounts that do not always carry the `[bot]` suffix. */
const BOT_LOGINS = /^(dependabot|renovate|github-actions|dependabot-preview|renovate-bot)$/i

/** A GitHub App or automation account: typed Bot by GitHub, `[bot]` login, or a known name. */
export function isBot(actor: Actor | null): boolean {
    if (!actor) return false
    return actor.bot === true || /\[bot\]$/i.test(actor.login) || BOT_LOGINS.test(actor.login)
}

export interface NoiseRules {
    /** `owner/name` of muted repositories, compared case-insensitively. */
    mutedRepos: string[]
    hideBots: boolean
}

/**
 * Drop items the user decided are noise. Applied before stats, facets and source counts, so
 * that everything shown follows the rules; mutedCounts() keeps the muted part visible.
 */
export function removeNoise(items: Item[], rules: NoiseRules): Item[] {
    if (rules.mutedRepos.length === 0 && !rules.hideBots) return items
    const muted = new Set(rules.mutedRepos.map((r) => r.toLowerCase()))
    return items.filter(
        (i) => !muted.has(i.repo.toLowerCase()) && !(rules.hideBots && isBot(i.author))
    )
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
