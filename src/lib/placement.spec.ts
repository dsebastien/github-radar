import { describe, expect, test } from 'bun:test'
import { placePopover, type Box } from './placement'

const viewport = { width: 1000, height: 800 }
const at = (left: number, top: number): Box => ({
    left,
    right: left + 80,
    top,
    bottom: top + 30
})
const menu = { width: 300, height: 320 }

describe('placePopover', () => {
    test('opens below and left-aligned when it fits', () => {
        expect(placePopover(at(100, 100), menu, viewport)).toEqual({
            up: false,
            left: 0,
            maxHeight: 800 - 130 - 4 - 8
        })
    })

    test('opens above near the bottom edge when there is more room there', () => {
        const p = placePopover(at(100, 700), menu, viewport)
        expect(p.up).toBe(true)
        expect(p.maxHeight).toBe(700 - 4 - 8)
    })

    test('stays below when neither side fits but below has more room, capped to it', () => {
        const p = placePopover(at(100, 300), { width: 300, height: 600 }, viewport)
        expect(p).toEqual({ up: false, left: 0, maxHeight: 800 - 330 - 4 - 8 })
    })

    test('shifts left just enough near the right edge', () => {
        expect(placePopover(at(900, 100), menu, viewport).left).toBe(-(900 + 300 - 992))
    })

    test('never shifts past the left edge on a narrow viewport', () => {
        const p = placePopover(
            at(50, 100),
            { width: 310, height: 100 },
            { width: 320, height: 800 }
        )
        expect(p.left).toBe(8 - 50)
    })
})
