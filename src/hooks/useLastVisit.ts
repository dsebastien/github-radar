import { useCallback, useEffect, useState } from 'react'
import { load, save } from '@/lib/storage'

const KEY = 'lastVisit'
const STAMP_EVERY_MS = 60_000

/**
 * When the previous visit ended (epoch ms), frozen for this session so "new" items stay new
 * while the page is open, or null on a first visit. The current visit is stamped every minute
 * and when the page is hidden, which becomes the next session's "last visit".
 * `markSeen` moves the reference to now, clearing every "new" marker.
 */
export function useLastVisit(): [number | null, () => void] {
    const [previous, setPrevious] = useState<number | null>(() => load<number | null>(KEY, null))
    useEffect(() => {
        const stamp = () => save(KEY, Date.now())
        stamp()
        const id = window.setInterval(stamp, STAMP_EVERY_MS)
        window.addEventListener('pagehide', stamp)
        return () => {
            window.clearInterval(id)
            window.removeEventListener('pagehide', stamp)
        }
    }, [])
    const markSeen = useCallback(() => setPrevious(Date.now()), [])
    return [previous, markSeen]
}
