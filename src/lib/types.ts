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

/** An issue or a pull request, normalized from the GitHub Search API. */
export interface Item {
    id: number
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
export type AttentionFilter = 'any' | 'stale' | 'dormant' | 'unlabeled' | 'unassigned' | 'draft'

export interface Filters {
    text: string
    type: TypeFilter
    state: StateFilter
    labels: string[]
    repos: string[]
    authors: string[]
    assignees: string[]
    mine: MineFilter
    attention: AttentionFilter
    hideDrafts: boolean
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
    mine: 'any',
    attention: 'any',
    hideDrafts: false,
    sort: 'updated',
    group: 'none'
}

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

export interface RepoLabel {
    name: string
    color: string
    description: string | null
}
