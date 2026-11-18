/** The `id` of the side panel (sources, views), for `aria-controls`. */
export const SIDE_PANEL_ID = 'side-panel'

interface Props {
    /** Sources hidden from the list: said on the rail, because the panel that shows them is hidden. */
    hiddenSources: number
    onExpand: () => void
}

/**
 * What is left of the collapsed side panel: one button that brings it back. A thin vertical rail
 * beside the list on wide screens, a slim bar above it on narrow ones.
 */
export function SidePanelRail({ hiddenSources, onExpand }: Props) {
    return (
        <button
            type='button'
            onClick={onExpand}
            aria-expanded={false}
            aria-controls={SIDE_PANEL_ID}
            aria-label='Show the sources and views panel'
            title='Show the sources and views panel (s)'
            className='bg-surface border-line shadow-card text-muted flex w-full items-center gap-2 self-start rounded-xl border px-3 py-2 text-xs font-extrabold tracking-wide uppercase transition hover:text-white lg:flex-col lg:px-0 lg:py-3'
        >
            <span aria-hidden className='hidden text-base leading-none lg:inline'>
                »
            </span>
            <span aria-hidden className='lg:hidden'>
                ▾
            </span>
            <span className='lg:[writing-mode:vertical-rl]'>Sources · Views</span>
            {hiddenSources > 0 && (
                <span className='text-accent-yellow font-semibold tracking-normal normal-case lg:[writing-mode:vertical-rl]'>
                    {hiddenSources} hidden
                </span>
            )}
        </button>
    )
}
