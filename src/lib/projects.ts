import { NO_PROJECT, type Item, type Project, type ProjectLink } from './types'

/**
 * Project membership and status do not bump an item's `updated_at`, so they are refetched
 * when the item changed and, regardless, after this long.
 */
export const PROJECTS_TTL = 6 * 60 * 60_000

/** The subset of a GraphQL Issue/PullRequest node the project enrichment asks for. */
export interface RawProjectsNode {
    id: string
    projectItems: {
        nodes: Array<{
            id: string
            project: { id: string; title: string } | null
            fieldValueByName: { name?: string | null } | null
        } | null>
    } | null
}

export interface RawProject {
    id: string
    title: string
    number: number
    url: string
    closed: boolean
    owner: { login: string }
    field: { id?: string; options?: Array<{ id: string; name: string }> } | null
}

export function needsProjects(items: Item[], now: number): Item[] {
    return items.filter(
        (i) =>
            i.node_id &&
            (!i.projects ||
                i.projectsFor !== i.updated_at ||
                now - (i.projectsAt ?? 0) >= PROJECTS_TTL)
    )
}

export function toProjectLinks(raw: RawProjectsNode): ProjectLink[] {
    return (raw.projectItems?.nodes ?? []).flatMap((n) =>
        n?.project
            ? [
                  {
                      projectId: n.project.id,
                      itemId: n.id,
                      title: n.project.title,
                      status: n.fieldValueByName?.name ?? null
                  }
              ]
            : []
    )
}

/** Merge project memberships into items, by node id. Items without a result are unchanged. */
export function applyProjects(items: Item[], nodes: RawProjectsNode[], now: number): Item[] {
    const byNode = new Map(nodes.map((n) => [n.id, n]))
    return items.map((i) => {
        const n = byNode.get(i.node_id)
        return n
            ? { ...i, projects: toProjectLinks(n), projectsAt: now, projectsFor: i.updated_at }
            : i
    })
}

/** Keep the cached memberships on a freshly searched item until they are refetched. */
export function carryProjects(prev: Item | undefined, next: Item): Item {
    return prev?.projects && !next.projects
        ? {
              ...next,
              projects: prev.projects,
              projectsAt: prev.projectsAt,
              projectsFor: prev.projectsFor
          }
        : next
}

export function toProject(raw: RawProject): Project {
    const field = raw.field?.id && raw.field.options ? raw.field : null
    return {
        id: raw.id,
        title: raw.title,
        number: raw.number,
        owner: raw.owner.login,
        url: raw.url,
        status: field ? { fieldId: field.id!, options: field.options! } : null
    }
}

/** Project filter: any of the selected project ids, or NO_PROJECT for items in none. */
export function matchesProjects(item: Item, wanted: string[]): boolean {
    if (wanted.length === 0) return true
    // Not enriched: membership is unknown, so the item cannot be claimed either way.
    if (!item.projects) return false
    if (item.projects.length === 0) return wanted.includes(NO_PROJECT)
    return item.projects.some((p) => wanted.includes(p.projectId))
}

/** Owners whose projects can hold the items: every source owner plus the viewer. */
export function projectOwners(sources: Array<{ kind: string; value: string }>, viewer: string) {
    const owners = new Map<string, string>()
    for (const login of [...sources.map((s) => s.value.split('/')[0]!), viewer])
        if (!owners.has(login.toLowerCase())) owners.set(login.toLowerCase(), login)
    return Array.from(owners.values())
}
