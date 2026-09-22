const DAY = 86_400_000
/** Warn this long before the token expires. */
export const EXPIRY_WARNING_MS = 7 * DAY

/**
 * Parse GitHub's `github-authentication-token-expiration` header, for example
 * `2026-10-01 12:00:00 UTC` or `2026-10-01 12:00:00 -0800`. Null when absent (a token without
 * expiry) or unreadable.
 */
export function parseTokenExpiration(header: string | null): number | null {
    if (!header) return null
    const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) (UTC|[+-]\d{4})$/.exec(header.trim())
    if (!m) return null
    const zone = m[3] === 'UTC' ? 'Z' : `${m[3]!.slice(0, 3)}:${m[3]!.slice(3)}`
    const t = Date.parse(`${m[1]}T${m[2]}${zone}`)
    return Number.isNaN(t) ? null : t
}

/** Whole days left before expiry, rounded down; negative once expired. */
export function daysLeft(expiresAt: number, now: number): number {
    return Math.floor((expiresAt - now) / DAY)
}

export function expiresSoon(expiresAt: number | null, now: number): boolean {
    return expiresAt !== null && expiresAt - now <= EXPIRY_WARNING_MS
}

export type ProbeResult = 'yes' | 'no' | 'unknown'

/**
 * Permission probes send a deliberately invalid write (for example `state: "probe"`) that
 * GitHub rejects before changing anything. The permission check runs first, so a 422
 * validation error (or a success that changed nothing) means the token may write, while 403 or
 * 404 means it may not.
 */
export function classifyWriteProbe(status: number): ProbeResult {
    if (status === 422 || (status >= 200 && status < 300)) return 'yes'
    if (status === 403 || status === 404) return 'no'
    return 'unknown'
}

export interface PermissionCheck {
    name: string
    result: ProbeResult
    detail: string
}

/** `YYYY-MM-DD` for a date input, in local time; empty when unknown. */
export function toDateInput(t: number | null): string {
    if (t === null) return ''
    const d = new Date(t)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** A date input's value as the end of that local day; null when empty or invalid. */
export function fromDateInput(value: string): number | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (!m) return null
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59).getTime()
}
