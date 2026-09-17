import { useEffect, type ReactNode } from 'react'

export function Modal({
    title,
    onClose,
    children
}: {
    title: string
    onClose: () => void
    children: ReactNode
}) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])
    return (
        <div
            className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4'
            onClick={onClose}
        >
            <div
                role='dialog'
                aria-modal
                aria-label={title}
                className='bg-surface border-line shadow-card fade-in w-full max-w-lg rounded-xl border p-6'
                onClick={(e) => e.stopPropagation()}
            >
                <div className='mb-4 flex items-center justify-between'>
                    <h2 className='text-lg font-extrabold'>{title}</h2>
                    <button
                        type='button'
                        onClick={onClose}
                        className='text-muted rounded-md px-2 text-xl leading-none hover:text-white'
                        aria-label='Close'
                    >
                        ×
                    </button>
                </div>
                {children}
            </div>
        </div>
    )
}
