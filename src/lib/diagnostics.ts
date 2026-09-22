import { load, save } from './storage'

export interface LoggedError {
    at: number
    message: string
    /** Where it happened: "refresh", "action", "crash", "unhandled"… */
    context: string
}

const KEY = 'errors'
/** Keep the most recent errors only. */
export const MAX_ERRORS = 20

/** Prepend an error, newest first, dropping the oldest beyond the limit. Pure. */
export function appendError(log: LoggedError[], entry: LoggedError): LoggedError[] {
    return [entry, ...log].slice(0, MAX_ERRORS)
}

let listeners: Array<(log: LoggedError[]) => void> = []

/** Record an error in the persisted log (it survives the reload after a crash). */
export function recordError(message: string, context: string, at = Date.now()): void {
    const next = appendError(readErrors(), { at, message, context })
    save(KEY, next)
    for (const l of listeners) l(next)
}

export function readErrors(): LoggedError[] {
    const log = load<LoggedError[]>(KEY, [])
    return Array.isArray(log) ? log : []
}

export function clearErrors(): void {
    save(KEY, [])
    for (const l of listeners) l([])
}

export function subscribeErrors(listener: (log: LoggedError[]) => void): () => void {
    listeners.push(listener)
    return () => {
        listeners = listeners.filter((l) => l !== listener)
    }
}

export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}
