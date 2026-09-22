import { Component, type ErrorInfo, type ReactNode } from 'react'
import { recordError } from '@/lib/diagnostics'
import { remove } from '@/lib/storage'

interface State {
    error: Error | null
}

/**
 * Last line of defence: a rendering crash shows what happened and a way out instead of a blank
 * page. The error is logged for the diagnostics panel. Resetting the cache helps when a cached
 * item set from an older version is what breaks rendering.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
    override state: State = { error: null }

    static getDerivedStateFromError(error: Error): State {
        return { error }
    }

    override componentDidCatch(error: Error, info: ErrorInfo): void {
        recordError(
            `${error.message}${info.componentStack ? `\n${info.componentStack.trim().split('\n')[0]}` : ''}`,
            'crash'
        )
    }

    override render() {
        const { error } = this.state
        if (!error) return this.props.children
        return (
            <div className='mx-auto max-w-xl px-4 py-24 text-center'>
                <div className='text-5xl'>📡</div>
                <h1 className='mt-3 text-2xl font-extrabold'>
                    Something broke on the <span className='gradient-word'>radar</span>.
                </h1>
                <p className='text-muted mt-2 text-sm'>
                    The page hit an unexpected error. Reloading usually fixes it; if it keeps
                    happening, reset the cached items (your sources, filters and token are kept).
                </p>
                <pre className='bg-well mt-4 overflow-x-auto rounded-lg p-3 text-left text-xs text-red-200'>
                    {error.message}
                </pre>
                <div className='mt-5 flex flex-wrap justify-center gap-2'>
                    <button
                        type='button'
                        onClick={() => window.location.reload()}
                        className='bg-secondary shadow-magenta rounded-lg px-4 py-2 text-sm font-bold text-white hover:brightness-110'
                    >
                        Reload
                    </button>
                    <button
                        type='button'
                        onClick={() => {
                            remove('cache')
                            window.location.reload()
                        }}
                        className='rounded-lg bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/15'
                    >
                        Reset cached items and reload
                    </button>
                </div>
                <p className='text-faint mt-6 text-xs'>
                    Please report it at{' '}
                    <a
                        href='https://github.com/dsebastien/github-radar/issues'
                        target='_blank'
                        rel='noreferrer'
                        className='underline'
                    >
                        github.com/dsebastien/github-radar/issues
                    </a>
                    .
                </p>
            </div>
        )
    }
}
