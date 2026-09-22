import { describe, expect, test } from 'bun:test'
import {
    applyProjects,
    carryProjects,
    matchesProjects,
    needsProjects,
    PROJECTS_TTL,
    projectOwners,
    toProject
} from './projects'
import type { Item } from './types'

const NOW = Date.parse('2026-09-22T12:00:00Z')

function item(over: Partial<Item> & { id: number }): Item {
    return {
        node_id: `N${over.id}`,
        number: over.id,
        title: '',
        html_url: '',
        repo: 'o/r',
        type: 'issue',
        state: 'open',
        draft: false,
        labels: [],
        author: null,
        assignees: [],
        comments: 0,
        reactions: 0,
        created_at: '',
        updated_at: '2026-09-20T00:00:00Z',
        milestone: null,
        ...over
    }
}

const fresh = { projects: [], projectsAt: NOW - 1000, projectsFor: '2026-09-20T00:00:00Z' }

describe('needsProjects', () => {
    test('never fetched, item changed, or older than the TTL', () => {
        const items = [
            item({ id: 1 }),
            item({ id: 2, ...fresh }),
            item({ id: 3, ...fresh, projectsFor: '2026-09-01T00:00:00Z' }),
            item({ id: 4, ...fresh, projectsAt: NOW - PROJECTS_TTL })
        ]
        expect(needsProjects(items, NOW).map((i) => i.id)).toEqual([1, 3, 4])
    })
})

describe('applyProjects', () => {
    test('maps memberships with status and stamps them', () => {
        const [a, b] = applyProjects(
            [item({ id: 1 }), item({ id: 2 })],
            [
                {
                    id: 'N1',
                    projectItems: {
                        nodes: [
                            {
                                id: 'PVTI_1',
                                project: { id: 'P1', title: 'Roadmap' },
                                fieldValueByName: { name: 'Todo' }
                            },
                            { id: 'PVTI_2', project: null, fieldValueByName: null },
                            null
                        ]
                    }
                }
            ],
            NOW
        )
        expect(a!.projects).toEqual([
            { projectId: 'P1', itemId: 'PVTI_1', title: 'Roadmap', status: 'Todo' }
        ])
        expect(a!.projectsAt).toBe(NOW)
        expect(a!.projectsFor).toBe(a!.updated_at)
        expect(b!.projects).toBeUndefined()
    })
})

describe('carryProjects', () => {
    test('keeps cached memberships on a fresh search result', () => {
        const prev = item({ id: 1, ...fresh })
        expect(carryProjects(prev, item({ id: 1 })).projectsAt).toBe(fresh.projectsAt)
    })
})

describe('matchesProjects', () => {
    const inP1 = item({
        id: 1,
        projects: [{ projectId: 'P1', itemId: 'x', title: 'R', status: null }]
    })
    const inNone = item({ id: 2, projects: [] })
    const unknown = item({ id: 3 })
    test('by project id, or in no project', () => {
        expect(matchesProjects(inP1, ['P1'])).toBe(true)
        expect(matchesProjects(inNone, ['P1'])).toBe(false)
        expect(matchesProjects(inNone, ['(none)'])).toBe(true)
        expect(matchesProjects(inP1, ['(none)'])).toBe(false)
    })
    test('items not enriched match only when no project filter is set', () => {
        expect(matchesProjects(unknown, [])).toBe(true)
        expect(matchesProjects(unknown, ['(none)'])).toBe(false)
    })
})

describe('toProject', () => {
    test('keeps the Status field only when it is a single select', () => {
        const raw = {
            id: 'P1',
            title: 'Roadmap',
            number: 3,
            url: 'u',
            closed: false,
            owner: { login: 'o' }
        }
        expect(
            toProject({ ...raw, field: { id: 'F', options: [{ id: 'a', name: 'Todo' }] } }).status
        ).toEqual({ fieldId: 'F', options: [{ id: 'a', name: 'Todo' }] })
        expect(toProject({ ...raw, field: {} }).status).toBeNull()
        expect(toProject({ ...raw, field: null }).status).toBeNull()
    })
})

describe('projectOwners', () => {
    test('source owners and the viewer, deduplicated case-insensitively', () => {
        expect(
            projectOwners(
                [
                    { kind: 'user', value: 'me' },
                    { kind: 'repo', value: 'Acme/tool' },
                    { kind: 'org', value: 'acme' }
                ],
                'Me'
            )
        ).toEqual(['me', 'Acme'])
    })
})
