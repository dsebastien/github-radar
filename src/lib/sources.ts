import type { Source, SourceKind, Viewer } from './types'

/**
 * Parse free-form user input into a source.
 *
 * Accepts: "dsebastien", "org:knowii-oss", "user:dsebastien", "@dsebastien",
 * "dsebastien/obsidian-typefully", "https://github.com/knowii-oss",
 * "github.com/dsebastien/foo.git". Returns null when the input is not a
 * recognizable GitHub user, org or repo reference.
 */
export function parseSource(input: string): Source | null {
    let v = input.trim()
    if (!v) return null
    let kind: SourceKind | null = null
    const prefixed = /^(user|org|repo):(.+)$/i.exec(v)
    if (prefixed?.[1] && prefixed[2]) {
        kind = prefixed[1].toLowerCase() as SourceKind
        v = prefixed[2].trim()
    }
    v = v
        .replace(/^https?:\/\//i, '')
        .replace(/^(www\.)?github\.com\//i, '')
        .replace(/\.git$/i, '')
        .replace(/\/+$/, '')
        .replace(/^@/, '')
    if (!/^[\w.-]+(\/[\w.-]+)?$/.test(v)) return null
    if (v.includes('/')) return { kind: 'repo', value: v }
    if (kind === 'repo') return null
    return { kind: kind ?? 'user', value: v }
}

/** Case-insensitive identity of a source, used for deduplication. */
export function sourceKey(s: Source): string {
    return `${s.kind}:${s.value.toLowerCase()}`
}

/** Human-readable form, also the serialized form in URLs. */
export function sourceLabel(s: Source): string {
    return s.kind === 'repo' ? s.value : `${s.kind}:${s.value}`
}

export function addSource(list: Source[], s: Source): Source[] {
    const key = sourceKey(s)
    return list.some((x) => sourceKey(x) === key) ? list : [...list, s]
}

export function removeSource(list: Source[], s: Source): Source[] {
    const key = sourceKey(s)
    return list.filter((x) => sourceKey(x) !== key)
}

/** Serialize sources for a shareable URL: `?sources=user:a,org:b,c/d`. */
export function serializeSources(list: Source[]): string {
    return list.map(sourceLabel).join(',')
}

/** Inverse of serializeSources. Unparseable entries are dropped. */
export function deserializeSources(param: string | null): Source[] {
    if (!param) return []
    return param
        .split(',')
        .map(parseSource)
        .filter((s): s is Source => s !== null)
        .reduce<Source[]>(addSource, [])
}

/**
 * The effective sources for a search: the configured ones plus, when the viewer
 * is logged in and opted in, their own account and every org they belong to.
 */
export function effectiveSources(
    configured: Source[],
    viewer: Viewer | null,
    includeMine: boolean
): Source[] {
    if (!viewer || !includeMine) return configured
    let out = addSource(configured, { kind: 'user', value: viewer.login })
    for (const org of viewer.orgs) out = addSource(out, { kind: 'org', value: org })
    return out
}
