import { useLayoutEffect, type RefObject } from 'react'
import { placePopover } from '@/lib/placement'

/**
 * Positions an open popover (an `absolute` child of `anchor`) before it is painted: below or
 * above the anchor, shifted left near the right edge, and capped to the room left, so that
 * opening it never makes the page scroll. Placed again when the window is resized.
 */
export function usePopoverPlacement(
    open: boolean,
    anchor: RefObject<HTMLElement | null>,
    popover: RefObject<HTMLElement | null>
): void {
    useLayoutEffect(() => {
        if (!open) return
        const place = () => {
            const a = anchor.current
            const p = popover.current
            if (!a || !p) return
            // Measure the natural size first: the previous placement may have capped it.
            Object.assign(p.style, { maxHeight: '', top: '100%', bottom: 'auto', left: '0px' })
            const { up, left, maxHeight } = placePopover(
                a.getBoundingClientRect(),
                { width: p.offsetWidth, height: p.offsetHeight },
                { width: document.documentElement.clientWidth, height: window.innerHeight }
            )
            Object.assign(p.style, {
                top: up ? 'auto' : '100%',
                bottom: up ? '100%' : 'auto',
                left: `${left}px`,
                maxHeight: p.offsetHeight > maxHeight ? `${maxHeight}px` : ''
            })
        }
        place()
        window.addEventListener('resize', place)
        return () => window.removeEventListener('resize', place)
    }, [open, anchor, popover])
}
