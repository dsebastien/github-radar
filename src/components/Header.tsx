import { Avatar, Button, Spinner } from './ui'
import type { RateLimit, Viewer } from '@/lib/types'

interface Props {
    viewer: Viewer | null
    viewerLoading: boolean
    rateLimit: RateLimit | null
    onLogin: () => void
    onLogout: () => void
    onSettings: () => void
    /** Present when there is something to refresh. */
    onRefresh: (() => void) | null
    refreshing: boolean
}

export function Header({
    viewer,
    viewerLoading,
    rateLimit,
    onLogin,
    onLogout,
    onSettings,
    onRefresh,
    refreshing
}: Props) {
    return (
        <header className='border-line sticky top-0 z-30 border-b bg-[#37404c]/85 backdrop-blur'>
            <div className='mx-auto flex max-w-[112rem] items-center gap-3 px-4 py-3'>
                <a href='./' className='flex items-center gap-2.5'>
                    <RadarLogo />
                    <span className='text-lg font-extrabold tracking-tight'>
                        GitHub <span className='gradient-word'>Radar</span>
                    </span>
                </a>
                <div className='ml-auto flex items-center gap-2'>
                    {rateLimit && (
                        <span
                            className='text-faint hidden font-mono text-[11px] sm:inline'
                            title={`GitHub API requests left in this window. Resets ${new Date(rateLimit.resetAt).toLocaleTimeString()}.`}
                        >
                            {rateLimit.remaining}/{rateLimit.limit}
                        </span>
                    )}
                    {onRefresh && (
                        <Button
                            variant='ghost'
                            size='sm'
                            onClick={onRefresh}
                            disabled={refreshing}
                            title='Refresh now'
                            aria-label='Refresh'
                        >
                            {refreshing ? <Spinner /> : <RefreshIcon />}
                            <span className='hidden sm:inline'>Refresh</span>
                        </Button>
                    )}
                    <Button
                        variant='ghost'
                        size='sm'
                        onClick={onSettings}
                        title='Settings'
                        aria-label='Settings'
                    >
                        <GearIcon />
                    </Button>
                    {viewerLoading ? (
                        <Spinner />
                    ) : viewer ? (
                        <div className='flex items-center gap-2'>
                            <a
                                href={viewer.html_url}
                                target='_blank'
                                rel='noreferrer'
                                className='flex items-center gap-2'
                            >
                                <Avatar actor={viewer} size={26} />
                                <span className='hidden text-sm font-semibold sm:inline'>
                                    {viewer.login}
                                </span>
                            </a>
                            <Button variant='ghost' size='sm' onClick={onLogout}>
                                Log out
                            </Button>
                        </div>
                    ) : (
                        <Button variant='primary' size='sm' onClick={onLogin}>
                            Log in
                        </Button>
                    )}
                </div>
            </div>
        </header>
    )
}

function RadarLogo() {
    return (
        <svg viewBox='0 0 64 64' width='30' height='30' aria-hidden>
            <rect width='64' height='64' rx='14' fill='#2b323c' />
            <circle
                cx='32'
                cy='32'
                r='22'
                fill='none'
                stroke='#ff1493'
                strokeWidth='2'
                opacity='0.35'
            />
            <circle cx='32' cy='32' r='13' fill='none' stroke='#ff1493' strokeWidth='5' />
            <circle cx='32' cy='32' r='4' fill='#ff1493' />
        </svg>
    )
}

function RefreshIcon() {
    return (
        <svg viewBox='0 0 16 16' width='16' height='16' fill='currentColor' aria-hidden>
            <path d='M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834ZM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.5 5.5 0 0 0 8 2.5Z' />
        </svg>
    )
}

function GearIcon() {
    return (
        <svg viewBox='0 0 16 16' width='16' height='16' fill='currentColor' aria-hidden>
            <path d='M8 0a8.2 8.2 0 0 1 .701.031C9.444.095 9.99.645 10.16 1.29l.288 1.107c.018.066.079.158.212.224.231.114.454.243.668.386.123.082.233.09.299.071l1.103-.303c.644-.176 1.392.021 1.82.63.27.385.506.792.704 1.218.315.675.111 1.422-.364 1.891l-.814.806c-.049.048-.098.147-.088.294.016.257.016.515 0 .772-.01.147.038.246.088.294l.814.806c.475.469.679 1.216.364 1.891a7.977 7.977 0 0 1-.704 1.217c-.428.61-1.176.807-1.82.63l-1.102-.302c-.067-.019-.177-.011-.3.071a5.909 5.909 0 0 1-.668.386c-.133.066-.194.158-.211.224l-.29 1.106c-.168.646-.715 1.196-1.458 1.26a8.006 8.006 0 0 1-1.402 0c-.743-.064-1.289-.614-1.458-1.26l-.289-1.106c-.018-.066-.079-.158-.212-.224a5.738 5.738 0 0 1-.668-.386c-.123-.082-.233-.09-.299-.071l-1.103.303c-.644.176-1.392-.021-1.82-.63a8.12 8.12 0 0 1-.704-1.218c-.315-.675-.111-1.422.363-1.891l.815-.806c.05-.048.098-.147.088-.294a6.214 6.214 0 0 1 0-.772c.01-.147-.038-.246-.088-.294l-.815-.806C.635 6.045.431 5.298.746 4.623a7.92 7.92 0 0 1 .704-1.217c.428-.61 1.176-.807 1.82-.63l1.102.302c.067.019.177.011.3-.071.214-.143.437-.272.668-.386.133-.066.194-.158.211-.224l.29-1.106C6.009.645 6.556.095 7.299.03 7.53.01 7.764 0 8 0Zm-.571 1.525c-.036.003-.108.036-.137.146l-.289 1.105c-.147.561-.549.967-.998 1.189-.173.086-.34.183-.5.29-.417.278-.97.423-1.529.27l-1.103-.303c-.109-.03-.175.016-.195.045-.22.312-.412.644-.573.99-.014.031-.021.11.059.19l.815.806c.411.406.562.957.53 1.456a4.709 4.709 0 0 0 0 .582c.032.499-.119 1.05-.53 1.456l-.815.806c-.081.08-.073.159-.059.19.162.346.353.677.573.989.02.03.085.076.195.046l1.102-.303c.56-.153 1.113-.008 1.53.27.161.107.328.204.501.29.447.222.85.629.997 1.189l.289 1.105c.029.109.101.143.137.146a6.6 6.6 0 0 0 1.142 0c.036-.003.108-.036.137-.146l.289-1.105c.147-.561.549-.967.998-1.189.173-.086.34-.183.5-.29.417-.278.97-.423 1.529-.27l1.103.303c.109.029.175-.016.195-.045.22-.313.411-.644.573-.99.014-.031.021-.11-.059-.19l-.815-.806c-.411-.406-.562-.957-.53-1.456a4.709 4.709 0 0 0 0-.582c-.032-.499.119-1.05.53-1.456l.815-.806c.081-.08.073-.159.059-.19a6.464 6.464 0 0 0-.573-.989c-.02-.03-.085-.076-.195-.046l-1.102.303c-.56.153-1.113.008-1.53-.27a4.44 4.44 0 0 0-.501-.29c-.447-.222-.85-.629-.997-1.189l-.289-1.105c-.029-.11-.101-.143-.137-.146a6.6 6.6 0 0 0-1.142 0ZM11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM9.5 8a1.5 1.5 0 1 0-3.001.001A1.5 1.5 0 0 0 9.5 8Z' />
        </svg>
    )
}
