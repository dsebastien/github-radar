import type { Source, StateFilter } from './types'

/** GitHub caps search queries at 256 characters; keep a margin. */
const MAX_QUERY_LENGTH = 240

function qualifier(s: Source): string {
    return `${s.kind}:${s.value}`
}

/**
 * Compose one GitHub Search API query. Qualifiers of the same family
 * (user/org/repo) are OR'ed implicitly by GitHub, so one query covers many
 * sources. `extra` narrows the query (for example `is:issue`) when a source has
 * more open items than the API's 1000-result ceiling.
 */
export function buildQuery(sources: Source[], state: StateFilter, extra: string[] = []): string {
    const parts = state === 'all' ? [] : [`state:${state}`]
    return [...parts, ...extra, ...sources.map(qualifier)].join(' ')
}

/** Split sources into chunks whose query (with `extra` qualifiers) stays under the length limit. */
export function chunkSources(
    sources: Source[],
    state: StateFilter,
    extra: string[] = []
): Source[][] {
    if (sources.length === 0) return []
    const chunks: Source[][] = []
    let chunk: Source[] = []
    for (const s of sources) {
        if (chunk.length > 0 && buildQuery([...chunk, s], state, extra).length > MAX_QUERY_LENGTH) {
            chunks.push(chunk)
            chunk = []
        }
        chunk.push(s)
    }
    chunks.push(chunk)
    return chunks
}

/** Every query needed to cover the sources, one per chunk. */
export function buildQueries(sources: Source[], state: StateFilter): string[] {
    return chunkSources(sources, state).map((chunk) => buildQuery(chunk, state))
}
