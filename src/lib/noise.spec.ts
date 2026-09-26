import { describe, expect, test } from 'bun:test'
import { isBot, mutedCounts, removeNoise, repoStatus, statusCounts, toggleMuted } from './noise'
import type { Actor, Item, RepoInfo } from './types'

const actor = (login: string, bot?: boolean): Actor => ({
    login,
    avatar_url: '',
    html_url: '',
    ...(bot === undefined ? {} : { bot })
})

function item(id: number, repo: string, author: Actor | null): Item {
    return {
        id,
        node_id: `N${id}`,
        number: id,
        title: '',
        html_url: '',
        repo,
        type: 'pr',
        state: 'open',
        draft: false,
        labels: [],
        author,
        assignees: [],
        comments: 0,
        reactions: 0,
        created_at: '',
        updated_at: '',
        milestone: null
    }
}

describe('isBot', () => {
    test('typed bots, [bot] logins and well-known automation accounts', () => {
        expect(isBot(actor('dependabot[bot]'))).toBe(true)
        expect(isBot(actor('renovate'))).toBe(true)
        expect(isBot(actor('github-actions'))).toBe(true)
        expect(isBot(actor('some-app', true))).toBe(true)
        expect(isBot(actor('alice'))).toBe(false)
        expect(isBot(actor('botanist'))).toBe(false)
        expect(isBot(null)).toBe(false)
    })
})

describe('removeNoise', () => {
    const items = [
        item(1, 'o/r', actor('alice')),
        item(2, 'o/r', actor('dependabot[bot]')),
        item(3, 'O/Muted', actor('alice'))
    ]
    test('muted repositories (any case) and, when asked, bots', () => {
        expect(
            removeNoise(items, { mutedRepos: ['o/muted'], hideBots: false }).map((i) => i.id)
        ).toEqual([1, 2])
        expect(removeNoise(items, { mutedRepos: [], hideBots: true }).map((i) => i.id)).toEqual([
            1, 3
        ])
    })
    test('no rules returns the same array', () => {
        expect(removeNoise(items, { mutedRepos: [], hideBots: false })).toBe(items)
    })
    test('mutedCounts keeps the configured spelling and zero counts', () => {
        expect(mutedCounts(items, ['o/muted', 'x/y'])).toEqual({ 'o/muted': 1, 'x/y': 0 })
    })
    test('toggleMuted is case-insensitive', () => {
        expect(toggleMuted(['o/r'], 'O/R')).toEqual([])
        expect(toggleMuted([], 'o/r')).toEqual(['o/r'])
    })
})

describe('repository status', () => {
    const now = Date.parse('2026-09-26T00:00:00Z')
    const info: Record<string, RepoInfo> = {
        'o/archived': { archived: true, pushedAt: '2026-09-25T00:00:00Z' },
        'o/dormant': { archived: false, pushedAt: '2026-06-01T00:00:00Z' },
        'o/active': { archived: false, pushedAt: '2026-09-01T00:00:00Z' },
        'o/empty': { archived: false, pushedAt: null }
    }

    test('archived wins over dormant, 90 days without a push is dormant', () => {
        expect(repoStatus(info['o/archived'], now)).toBe('archived')
        expect(repoStatus({ archived: true, pushedAt: '2020-01-01T00:00:00Z' }, now)).toBe(
            'archived'
        )
        expect(repoStatus(info['o/dormant'], now)).toBe('dormant')
        expect(repoStatus(info['o/active'], now)).toBeNull()
        expect(repoStatus(info['o/empty'], now)).toBeNull()
        expect(repoStatus(undefined, now)).toBeNull()
    })

    test('the last commit on the default branch wins over the last push', () => {
        const botPushed = { archived: false, pushedAt: '2026-09-25T00:00:00Z' }
        expect(repoStatus({ ...botPushed, lastCommitAt: '2026-01-01T00:00:00Z' }, now)).toBe(
            'dormant'
        )
        expect(repoStatus({ ...botPushed, lastCommitAt: null }, now)).toBeNull()
        expect(
            repoStatus({ ...info['o/dormant']!, lastCommitAt: '2026-09-20T00:00:00Z' }, now)
        ).toBeNull()
    })

    const items = [
        item(1, 'o/Archived', actor('a')),
        item(2, 'o/dormant', actor('a')),
        item(3, 'o/active', actor('a')),
        item(4, 'o/unknown', actor('a'))
    ]
    const ids = (rules: { hideArchived?: boolean; hideDormant?: boolean }) =>
        removeNoise(items, { mutedRepos: [], hideBots: false, repoInfo: info, now, ...rules }).map(
            (i) => i.id
        )

    test('hides archived and dormant repositories independently, keeps unknown ones', () => {
        expect(ids({ hideArchived: true })).toEqual([2, 3, 4])
        expect(ids({ hideDormant: true })).toEqual([1, 3, 4])
        expect(ids({ hideArchived: true, hideDormant: true })).toEqual([3, 4])
        expect(ids({})).toEqual([1, 2, 3, 4])
    })

    test('counts items per status', () => {
        expect(statusCounts(items, info, now)).toEqual({ archived: 1, dormant: 1 })
    })
})
