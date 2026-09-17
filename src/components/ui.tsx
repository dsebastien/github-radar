import clsx from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { contrastText } from '@/lib/utils'
import type { Actor, Label } from '@/lib/types'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    size?: 'sm' | 'md'
}

export function Button({ variant = 'secondary', size = 'md', className, ...props }: ButtonProps) {
    return (
        <button
            {...props}
            className={clsx(
                'inline-flex items-center justify-center gap-2 rounded-lg font-bold whitespace-nowrap transition',
                'focus-visible:ring-secondary-text/60 focus-visible:ring-2 focus-visible:outline-none',
                'disabled:cursor-not-allowed disabled:opacity-50',
                size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2 text-sm',
                variant === 'primary' &&
                    'bg-secondary shadow-magenta text-white hover:brightness-110',
                variant === 'secondary' && 'bg-white/10 text-white hover:bg-white/15',
                variant === 'ghost' && 'text-muted hover:bg-white/8 hover:text-white',
                variant === 'danger' && 'bg-red-500/20 text-red-200 hover:bg-red-500/30',
                className
            )}
        />
    )
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <span
            className={clsx(
                'bg-secondary/10 border-secondary/30 text-secondary-text inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-semibold',
                className
            )}
        >
            {children}
        </span>
    )
}

export function Chip({
    children,
    active,
    onClick,
    className,
    title
}: {
    children: ReactNode
    active?: boolean
    onClick?: () => void
    className?: string
    title?: string
}) {
    return (
        <button
            type='button'
            onClick={onClick}
            title={title}
            className={clsx(
                'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition',
                active ? 'bg-secondary text-white' : 'bg-white/8 text-white hover:bg-white/14',
                className
            )}
        >
            {children}
        </button>
    )
}

export function LabelChip({
    label,
    onClick,
    active
}: {
    label: Label
    onClick?: () => void
    active?: boolean
}) {
    const bg = `#${label.color}`
    return (
        <button
            type='button'
            onClick={onClick}
            title={label.description ?? label.name}
            className={clsx(
                'inline-flex max-w-[12rem] items-center truncate rounded-md px-2 py-0.5 text-[11px] leading-5 font-semibold',
                onClick && 'cursor-pointer hover:brightness-110',
                active && 'ring-2 ring-white'
            )}
            style={{ backgroundColor: bg, color: contrastText(bg) }}
        >
            {label.name}
        </button>
    )
}

export function Avatar({ actor, size = 20 }: { actor: Actor; size?: number }) {
    return (
        <img
            src={`${actor.avatar_url}${actor.avatar_url.includes('?') ? '&' : '?'}s=${size * 2}`}
            alt={actor.login}
            title={actor.login}
            width={size}
            height={size}
            loading='lazy'
            className='shrink-0 rounded-full bg-white/10'
        />
    )
}

export function Spinner({ className }: { className?: string }) {
    return (
        <span
            className={clsx(
                'border-secondary-text inline-block h-4 w-4 animate-spin rounded-full border-2 border-t-transparent',
                className
            )}
            aria-label='Loading'
        />
    )
}

export function SectionTitle({ children }: { children: ReactNode }) {
    return (
        <h2 className='mb-3 text-sm font-extrabold tracking-wide uppercase'>
            {children}
            <span className='bg-secondary mt-1 block h-1 w-10 rounded-full' />
        </h2>
    )
}

export function IssueIcon({ className }: { className?: string }) {
    return (
        <svg
            viewBox='0 0 16 16'
            width='16'
            height='16'
            fill='currentColor'
            className={className}
            aria-hidden
        >
            <path d='M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z' />
            <path d='M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z' />
        </svg>
    )
}

export function PullRequestIcon({ className }: { className?: string }) {
    return (
        <svg
            viewBox='0 0 16 16'
            width='16'
            height='16'
            fill='currentColor'
            className={className}
            aria-hidden
        >
            <path d='M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z' />
        </svg>
    )
}

export function ExternalIcon({ className }: { className?: string }) {
    return (
        <svg
            viewBox='0 0 16 16'
            width='14'
            height='14'
            fill='currentColor'
            className={className}
            aria-hidden
        >
            <path d='M3.75 2h3.5a.75.75 0 0 1 0 1.5h-3.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-3.5a.75.75 0 0 1 1.5 0v3.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-8.5C2 2.784 2.784 2 3.75 2Zm6.854-1h4.146a.25.25 0 0 1 .25.25v4.146a.25.25 0 0 1-.427.177L13.03 4.03 9.28 7.78a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l3.75-3.75-1.543-1.543A.25.25 0 0 1 10.604 1Z' />
        </svg>
    )
}

export function GitHubIcon({ className }: { className?: string }) {
    return (
        <svg
            viewBox='0 0 16 16'
            width='16'
            height='16'
            fill='currentColor'
            className={className}
            aria-hidden
        >
            <path d='M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z' />
        </svg>
    )
}
