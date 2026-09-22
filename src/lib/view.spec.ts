import { describe, expect, test } from 'bun:test'
import { activeView, parseView, saveView, serializeView, shareUrl } from './view'
import { DEFAULT_FILTERS, type Filters } from './types'

const triage: Filters = {
    ...DEFAULT_FILTERS,
    type: 'pr',
    labels: ['bug', 'needs, triage'],
    review: 'needs-my-review',
    hideBots: true,
    group: 'repo',
    text: 'crash'
}

describe('serializeView / parseView', () => {
    test('only what differs from the defaults', () => {
        expect(serializeView(DEFAULT_FILTERS).toString()).toBe('')
        expect(serializeView(triage).toString()).toBe(
            'text=crash&type=pr&labels=bug&labels=needs%2C+triage&hideBots=1&review=needs-my-review&group=repo'
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
        expect(activeView(views, { ...triage, hideBots: false })?.name).toBe('Triage')
        expect(activeView(views, triage)).toBeNull()
    })
})
