export function timeAgo(iso: string, now = Date.now()): string {
    const diff = Math.max(0, now - new Date(iso).getTime())
    const s = Math.floor(diff / 1000)
    if (s < 60) return 'just now'
    const m = Math.floor(s / 60)
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 48) return `${h}h ago`
    const d = Math.floor(h / 24)
    if (d < 30) return `${d}d ago`
    const mo = Math.floor(d / 30)
    if (mo < 12) return `${mo}mo ago`
    return `${Math.floor(mo / 12)}y ago`
}

/** Black or white text for a label background so chips stay readable. */
export function contrastText(hex: string): string {
    const h = hex.replace('#', '')
    if (h.length !== 6) return '#ffffff'
    const channel = (i: number) => {
        const v = parseInt(h.slice(i, i + 2), 16) / 255
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    }
    const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
    return luminance > 0.4 ? '#111111' : '#ffffff'
}

export function formatDate(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    })
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
    return `${n} ${n === 1 ? one : many}`
}
