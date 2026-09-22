const PREFIX = 'github-radar:'

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/**
 * Read a persisted value. Plain-object fallbacks are merged over so that keys
 * added in later versions get their defaults. Any failure yields the fallback:
 * the app must work without storage (private mode, blocked site data).
 */
export function load<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(PREFIX + key)
        if (raw === null) return fallback
        const parsed: unknown = JSON.parse(raw)
        if (isPlainObject(parsed) && isPlainObject(fallback)) return { ...fallback, ...parsed }
        return parsed as T
    } catch {
        return fallback
    }
}

export function save<T>(key: string, value: T): void {
    try {
        localStorage.setItem(PREFIX + key, JSON.stringify(value))
    } catch {
        /* quota exceeded or storage blocked: the in-memory state still works */
    }
}

export function remove(key: string): void {
    try {
        localStorage.removeItem(PREFIX + key)
    } catch {
        /* ignore */
    }
}

/** Stored size of a key in bytes (UTF-16, as browsers count against the quota); 0 if absent. */
export function storedSize(key: string): number {
    try {
        return (localStorage.getItem(PREFIX + key)?.length ?? 0) * 2
    } catch {
        return 0
    }
}
