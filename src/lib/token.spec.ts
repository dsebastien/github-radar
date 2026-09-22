import { describe, expect, test } from 'bun:test'
import {
    classifyWriteProbe,
    daysLeft,
    expiresSoon,
    fromDateInput,
    parseTokenExpiration,
    toDateInput
} from './token'

describe('parseTokenExpiration', () => {
    test('UTC and offset formats', () => {
        expect(parseTokenExpiration('2026-10-01 12:00:00 UTC')).toBe(
            Date.parse('2026-10-01T12:00:00Z')
        )
        expect(parseTokenExpiration('2026-10-01 12:00:00 -0800')).toBe(
            Date.parse('2026-10-01T20:00:00Z')
        )
    })
    test('absent or unreadable', () => {
        expect(parseTokenExpiration(null)).toBeNull()
        expect(parseTokenExpiration('soon')).toBeNull()
    })
})

describe('expiry', () => {
    const now = Date.parse('2026-09-22T12:00:00Z')
    test('warns within a week', () => {
        expect(expiresSoon(Date.parse('2026-09-29T12:00:00Z'), now)).toBe(true)
        expect(expiresSoon(Date.parse('2026-09-29T12:00:01Z'), now)).toBe(false)
        expect(expiresSoon(null, now)).toBe(false)
    })
    test('days left, rounded down, negative once expired', () => {
        expect(daysLeft(Date.parse('2026-09-25T11:00:00Z'), now)).toBe(2)
        expect(daysLeft(Date.parse('2026-09-21T12:00:00Z'), now)).toBe(-1)
    })
})

describe('classifyWriteProbe', () => {
    test('validation error means allowed, 403/404 means not', () => {
        expect(classifyWriteProbe(422)).toBe('yes')
        expect(classifyWriteProbe(200)).toBe('yes')
        expect(classifyWriteProbe(403)).toBe('no')
        expect(classifyWriteProbe(404)).toBe('no')
        expect(classifyWriteProbe(500)).toBe('unknown')
    })
})

describe('date input', () => {
    test('round trip at the end of the local day', () => {
        const t = fromDateInput('2026-10-01')!
        expect(toDateInput(t)).toBe('2026-10-01')
        expect(new Date(t).getHours()).toBe(23)
        expect(fromDateInput('')).toBeNull()
        expect(toDateInput(null)).toBe('')
    })
})
