import type { Item } from '@/lib/types'
import { attentionFlags } from '@/lib/filtering'

export function StatsRow({ all, shown, now }: { all: Item[]; shown: Item[]; now: number }) {
    const issues = all.filter((i) => i.type === 'issue').length
    const prs = all.length - issues
    const repos = new Set(all.map((i) => i.repo)).size
    const attention = all.filter((i) =>
        attentionFlags(i, now).some((f) => f === 'stale' || f === 'dormant')
    ).length
    return (
        <div className='grid grid-cols-2 gap-4 sm:grid-cols-5'>
            <Stat
                value={shown.length === all.length ? all.length : `${shown.length}/${all.length}`}
                label='shown'
                color='text-white'
            />
            <Stat value={issues} label='issues' color='text-secondary-text' />
            <Stat value={prs} label='pull requests' color='text-accent-purple' />
            <Stat value={repos} label='repositories' color='text-success' />
            <Stat value={attention} label='idle 30+ days' color='text-accent-yellow' />
        </div>
    )
}

function Stat({ value, label, color }: { value: number | string; label: string; color: string }) {
    return (
        <div>
            <div className={`text-3xl font-bold tabular-nums ${color}`}>{value}</div>
            <div className='text-muted text-xs font-medium tracking-wide uppercase'>{label}</div>
        </div>
    )
}
