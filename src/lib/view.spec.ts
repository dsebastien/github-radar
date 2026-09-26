import { describe, expect, test } from 'bun:test'
import {
    activeView,
    FILTERS_VERSION,
    parseView,
    saveView,
    serializeView,
    shareUrl,
    upgradeFilters
} from './view'
import { DEFAULT_FILTERS, type Filters } from './types'

const triage: Filters = {
    ...DEFAULT_FILTERS,
    type: 'pr',
    labels: ['bug', 'needs, triage'],
    review: 'needs-my-review',
    hideBots: false,
    group: 'repo',
    text: 'crash'
}

describe('serializeView / parseView', () => {
    test('only what differs from the defaults', () => {
        expect(serializeView(DEFAULT_FILTERS).toString()).toBe('')
        expect(serializeView(triage).toString()).toBe(
            'text=crash&type=pr&labels=bug&labels=needs%2C+triage&hideBots=0&review=needs-my-review&group=repo'
        )
    })
    test('round trip, commas in values included', () => {
        expect({ ...DEFAULT_FILTERS, ...parseView(serializeView(triage)) }).toEqual(triage)
    })
    test('invalid enum values and unknown keys are ignored', () => {
        expect(parseView(new URLSearchParams('type=nope&sort=title&foo=bar'))).toEqual({
            sort: 'title'
        })
    })
})

describe('shareUrl', () => {
    test('sources first, then the view, no hash', () => {
        expect(
            shareUrl('https://x.dev/?old=1#top', [{ kind: 'org', value: 'acme' }], {
                ...DEFAULT_FILTERS,
                state: 'closed'
            })
        ).toBe('https://x.dev/?sources=org%3Aacme&state=closed')
    })
})

describe('saved views', () => {
    test('saving under an existing name replaces it', () => {
        const views = saveView(saveView([], 'PRs', triage), 'prs ', DEFAULT_FILTERS)
        expect(views).toEqual([{ name: 'prs', filters: DEFAULT_FILTERS }])
        expect(saveView(views, '  ', triage)).toBe(views)
    })
    test('active view matches filters exactly, tolerating keys added later', () => {
        const { hideBots: _, ...older } = triage
        const views = [{ name: 'Triage', filters: older as Filters }]
        expect(activeView(views, { ...triage, hideBots: true })?.name).toBe('Triage')
        expect(activeView(views, triage)).toBeNull()
    })
})

describe('upgradeFilters', () => {
    const custom = { ...DEFAULT_FILTERS, type: 'pr' as const }
    const off = { hideDrafts: false, hideBots: false, hideArchived: false, hideDormant: false }

    test('from 0, turns every hide toggle on once', () => {
        expect(upgradeFilters({ ...custom, ...off }, 0)).toEqual(custom)
    })

    test('from 1, turns the drafts and bots toggles on, keeps archived and dormant as chosen', () => {
        const old = { ...custom, ...off }
        expect(upgradeFilters(old, 1)).toEqual({ ...old, hideDrafts: true, hideBots: true })
        expect(upgradeFilters(old, FILTERS_VERSION)).toBe(old)
    })

    test('a shared view that turns them off keeps them off', () => {
        const params = serializeView({ ...DEFAULT_FILTERS, hideArchived: false, hideBots: false })
        expect(params.toString()).toBe('hideBots=0&hideArchived=0')
        expect(parseView(params)).toEqual({ hideArchived: false, hideBots: false })
    })
})
