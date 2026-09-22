/** Keys are ignored while the user types in a field. */
export function isTypingTarget(el: EventTarget | null): boolean {
    if (!el || typeof (el as HTMLElement).tagName !== 'string') return false
    const node = el as HTMLElement
    const tag = node.tagName.toLowerCase()
    return (
        tag === 'input' || tag === 'textarea' || tag === 'select' || node.isContentEditable === true
    )
}

/**
 * The id `delta` steps away from `current` in display order, clamped to the ends. Without a
 * current item (or one no longer shown), moving down starts at the first and up at the last.
 */
export function stepId(order: number[], current: number | null, delta: number): number | null {
    if (order.length === 0) return null
    const i = current === null ? -1 : order.indexOf(current)
    if (i === -1) return delta > 0 ? order[0]! : order[order.length - 1]!
    return order[Math.min(order.length - 1, Math.max(0, i + delta))]!
}

export const SHORTCUTS: Array<[string, string]> = [
    ['j / k', 'Next / previous item'],
    ['Enter', 'Open the item panel'],
    ['Esc', 'Close the panel or dialog'],
    ['o', 'Open the item on GitHub'],
    ['x', 'Select the item for bulk actions (logged in)'],
    ['/', 'Search'],
    ['?', 'Show these shortcuts']
]
