import { describe, expect, test } from 'bun:test'
import { isTypingTarget, stepId } from './keyboard'

describe('stepId', () => {
    const order = [4, 8, 15]
    test('moves and clamps at both ends', () => {
        expect(stepId(order, 4, 1)).toBe(8)
        expect(stepId(order, 15, 1)).toBe(15)
        expect(stepId(order, 4, -1)).toBe(4)
    })
    test('starts at the first going down, the last going up', () => {
        expect(stepId(order, null, 1)).toBe(4)
        expect(stepId(order, null, -1)).toBe(15)
        expect(stepId(order, 99, 1)).toBe(4)
        expect(stepId([], null, 1)).toBeNull()
    })
})

describe('isTypingTarget', () => {
    test('fields and editable content, nothing else', () => {
        expect(isTypingTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true)
        expect(isTypingTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true)
        expect(
            isTypingTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)
        ).toBe(true)
        expect(isTypingTarget({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false)
        expect(isTypingTarget(null)).toBe(false)
    })
})
