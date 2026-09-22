import { describe, expect, test } from 'bun:test'
import { appendError, formatBytes, MAX_ERRORS } from './diagnostics'

describe('appendError', () => {
    test('newest first, capped', () => {
        let log = appendError([], { at: 1, message: 'a', context: 'x' })
        log = appendError(log, { at: 2, message: 'b', context: 'x' })
        expect(log.map((e) => e.message)).toEqual(['b', 'a'])
        for (let i = 0; i < 30; i++)
            log = appendError(log, { at: i, message: `${i}`, context: 'x' })
        expect(log).toHaveLength(MAX_ERRORS)
        expect(log[0]!.message).toBe('29')
    })
})

describe('formatBytes', () => {
    test('bytes, kilobytes, megabytes', () => {
        expect(formatBytes(512)).toBe('512 B')
        expect(formatBytes(2048)).toBe('2.0 KB')
        expect(formatBytes(3 * 1024 * 1024)).toBe(`${(3).toFixed(2)} MB`)
    })
})
