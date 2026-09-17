export interface Toast {
    id: number
    message: string
}

export function Toasts({
    toasts,
    onDismiss
}: {
    toasts: Toast[]
    onDismiss: (id: number) => void
}) {
    if (toasts.length === 0) return null
    return (
        <div className='pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4'>
            {toasts.map((t) => (
                <div
                    key={t.id}
                    role='status'
                    className='bg-surface-elevated border-line shadow-card fade-in pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 text-sm'
                >
                    <span className='min-w-0 flex-1 break-words'>{t.message}</span>
                    <button
                        type='button'
                        onClick={() => onDismiss(t.id)}
                        className='text-muted hover:text-white'
                        aria-label='Dismiss'
                    >
                        ×
                    </button>
                </div>
            ))}
        </div>
    )
}
