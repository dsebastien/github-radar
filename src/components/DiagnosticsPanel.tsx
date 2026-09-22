import { useEffect, useState } from 'react'
import { clearErrors, formatBytes, readErrors, subscribeErrors } from '@/lib/diagnostics'
import type { RateLimit } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { Button } from './ui'

interface Props {
    rateLimits: Record<string, RateLimit>
    cacheInfo: () => {
        bytes: number
        items: number
        stamps: Record<string, { fetchedAt: number; fullFetchedAt: number }>
    }
    onResetCache: () => void
}

/** What the dashboard knows about its own state: API budgets, recent errors, the cache. */
export function DiagnosticsPanel({ rateLimits, cacheInfo, onResetCache }: Props) {
    const [errors, setErrors] = useState(readErrors)
    useEffect(() => subscribeErrors(setErrors), [])
    const [cache, setCache] = useState(cacheInfo)
    const stamps = Object.entries(cache.stamps)

    return (
        <details className='border-line border-t pt-4'>
            <summary className='cursor-pointer font-semibold'>Diagnostics</summary>
            <div className='mt-3 space-y-4 text-xs'>
                <section>
                    <h3 className='text-muted mb-1 font-semibold uppercase'>Rate limits</h3>
                    {Object.keys(rateLimits).length === 0 ? (
                        <p className='text-faint'>No request made yet in this session.</p>
                    ) : (
                        <table className='w-full'>
                            <tbody>
                                {Object.values(rateLimits).map((r) => (
                                    <tr key={r.resource}>
                                        <td className='py-0.5 font-mono'>{r.resource}</td>
                                        <td className='text-right font-mono tabular-nums'>
                                            {r.remaining}/{r.limit}
                                        </td>
                                        <td className='text-faint pl-3 text-right'>
                                            resets {new Date(r.resetAt).toLocaleTimeString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </section>

                <section>
                    <div className='mb-1 flex items-center'>
                        <h3 className='text-muted font-semibold uppercase'>Recent errors</h3>
                        {errors.length > 0 && (
                            <button
                                type='button'
                                onClick={clearErrors}
                                className='text-faint ml-auto hover:text-white'
                            >
                                Clear
                            </button>
                        )}
                    </div>
                    {errors.length === 0 ? (
                        <p className='text-faint'>None.</p>
                    ) : (
                        <ul className='max-h-40 space-y-1 overflow-y-auto'>
                            {errors.map((e, i) => (
                                <li key={`${e.at}-${i}`} className='[overflow-wrap:anywhere]'>
                                    <span className='text-faint'>
                                        {formatDate(new Date(e.at).toISOString())} · {e.context}
                                    </span>
                                    <br />
                                    <span className='text-red-200'>{e.message}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section>
                    <h3 className='text-muted mb-1 font-semibold uppercase'>Cache</h3>
                    <p>
                        {cache.items} items, {formatBytes(cache.bytes)} in this browser.
                    </p>
                    {stamps.length > 0 && (
                        <table className='mt-1 w-full'>
                            <tbody>
                                {stamps.map(([key, s]) => (
                                    <tr key={key}>
                                        <td className='py-0.5 font-mono [overflow-wrap:anywhere]'>
                                            {key}
                                        </td>
                                        <td className='text-faint pl-3 text-right'>
                                            {formatDate(new Date(s.fetchedAt).toISOString())}
                                            <br />
                                            full{' '}
                                            {formatDate(new Date(s.fullFetchedAt).toISOString())}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                    <Button
                        size='sm'
                        variant='danger'
                        className='mt-2'
                        onClick={() => {
                            onResetCache()
                            setCache({ bytes: 0, items: 0, stamps: {} })
                        }}
                    >
                        Reset the cache and refetch
                    </Button>
                </section>
            </div>
        </details>
    )
}
