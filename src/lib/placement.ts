export interface Box {
    top: number
    bottom: number
    left: number
    right: number
}

export interface Placement {
    /** Open above the anchor instead of below. */
    up: boolean
    /** Horizontal offset from the anchor's left edge, in px. */
    left: number
    /** Room on the chosen side, in px: the popover must not grow past it. */
    maxHeight: number
}

/**
 * Where a popover goes so that it stays inside the viewport and never makes the page scroll:
 * below the anchor unless it does not fit there and there is more room above, left-aligned
 * with the anchor unless that overflows the right edge, then shifted left as far as needed
 * (never past the left edge). Pure: every size is passed in.
 */
export function placePopover(
    anchor: Box,
    popover: { width: number; height: number },
    viewport: { width: number; height: number },
    margin = 8,
    gap = 4
): Placement {
    const below = viewport.height - anchor.bottom - gap - margin
    const above = anchor.top - gap - margin
    const up = popover.height > below && above > below
    const overflowRight = anchor.left + popover.width - (viewport.width - margin)
    const left = overflowRight > 0 ? Math.min(0, Math.max(-overflowRight, margin - anchor.left)) : 0
    return { up, left, maxHeight: Math.max(0, up ? above : below) }
}
