import { describe, expect, test } from 'bun:test'
import { isBot, mutedCounts, removeNoise, toggleMuted } from './noise'
import type { Actor, Item } from './types'

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
