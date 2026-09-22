export type SourceKind = 'user' | 'org' | 'repo'

/** A place to look for items: a user, an organization, or a single repository. */
export interface Source {
    kind: SourceKind
    /** `login` for users and orgs, `owner/name` for repos */
    value: string
}

export interface Label {
    name: string
    color: string
    description: string | null
}

export interface Actor {
    login: string
    avatar_url: string
    html_url: string
}

export type ItemType = 'issue' | 'pr'
export type ItemState = 'open' | 'closed'

export type ReviewState = 'approved' | 'changes_requested' | 'review_required' | 'none'
export type ChecksState = 'success' | 'failure' | 'pending' | 'none'
export type MergeableState = 'mergeable' | 'conflicting' | 'unknown'

/** Review and CI state of a pull request, from the GraphQL enrichment (logged in only). */
export interface PrDetails {
    review: ReviewState
    checks: ChecksState
    mergeable: MergeableState
    /** Logins of the users whose review is requested (teams are not listed). */
    reviewRequests: string[]
    /** The item's `updated_at` when this was fetched: a newer item needs fresh details. */
    for: string
}

/** An item's membership in a GitHub Project (v2), with its Status field value. */
export interface ProjectLink {
    projectId: string
    /** The project item id (not the issue's), needed to set fields. */
    itemId: string
    title: string
    status: string | null
}

/** A GitHub Project (v2) the viewer can add items to, with its Status field options. */
export interface Project {
    id: string
    title: string
    number: number
    owner: string
    url: string
    /** The single-select "Status" field, when the project has one. */
    status: { fieldId: string; options: Array<{ id: string; name: string }> } | null
}

/** An issue or a pull request, normalized from the GitHub Search API. */
export interface Item {
    id: number
    /** GraphQL node id, used to enrich items in batches. */
    node_id: string
    number: number
    title: string
    html_url: string
    repo: string
    type: ItemType
    state: ItemState
    draft: boolean
    labels: Label[]
    author: Actor | null
    assignees: Actor[]
    comments: number
    reactions: number
    created_at: string
    updated_at: string
    milestone: string | null
    /** Pull requests only, once enriched. */
    pr?: PrDetails
    /** Project memberships, once enriched (logged in with the Projects permission). */
    projects?: ProjectLink[]
    /** When `projects` was fetched (epoch ms) and for which `updated_at`. */
    projectsAt?: number
    projectsFor?: string
}

export interface Viewer {
    login: string
    avatar_url: string
    html_url: string
    name: string | null
    orgs: string[]
}

export type TypeFilter = 'all' | 'issue' | 'pr'
export type StateFilter = 'open' | 'closed' | 'all'
export type SortKey = 'updated' | 'created' | 'comments' | 'title'
export type GroupKey = 'none' | 'repo' | 'author'
export type MineFilter = 'any' | 'assigned' | 'authored' | 'involved'
export type ReviewFilter =
    | 'any'
    | 'needs-my-review'
    | 'review-required'
    | 'approved'
    | 'changes-requested'
    | 'failing'
    | 'ready'
export type AttentionFilter = 'any' | 'stale' | 'dormant' | 'unlabeled' | 'unassigned' | 'draft'

export interface Filters {
    text: string
    type: TypeFilter
    state: StateFilter
    labels: string[]
    repos: string[]
    authors: string[]
    assignees: string[]
    /** Milestone titles (matched across repositories), or NO_MILESTONE. */
    milestones: string[]
    /** Project ids, or NO_PROJECT. */
    projects: string[]
    mine: MineFilter
    attention: AttentionFilter
    hideDrafts: boolean
    /** Pull request review and CI state; items that are not enriched PRs never match. */
    review: ReviewFilter
    /** Source keys (see sourceKey) whose items are hidden. */
    hiddenSources: string[]
    sort: SortKey
    group: GroupKey
}

export const DEFAULT_FILTERS: Filters = {
    text: '',
    type: 'all',
    state: 'open',
    labels: [],
    repos: [],
    authors: [],
    assignees: [],
    milestones: [],
    projects: [],
    mine: 'any',
    attention: 'any',
    hideDrafts: false,
    review: 'any',
    hiddenSources: [],
    sort: 'updated',
    group: 'none'
}

/** Milestone filter value for items without a milestone. */
export const NO_MILESTONE = '(none)'
/** Project filter value for items in no project. */
export const NO_PROJECT = '(none)'

export interface Settings {
    /** When logged in, also search the viewer's own account and every org they belong to. */
    includeMine: boolean
    /** Auto refresh interval in minutes, 0 = off. */
    refreshMinutes: number
}

export const DEFAULT_SETTINGS: Settings = {
    includeMine: true,
    refreshMinutes: 15
}

export interface RateLimit {
    limit: number
    remaining: number
    resetAt: number
}

export interface Comment {
    id: number
    author: Actor | null
    body_html: string
    created_at: string
    html_url: string
}

export interface ItemDetail {
    body_html: string
    viewerReacted: boolean
    comments: Comment[]
}

export interface Milestone {
    number: number
    title: string
    due_on: string | null
}

export interface RepoLabel {
    name: string
    color: string
    description: string | null
}
