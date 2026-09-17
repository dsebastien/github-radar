import { Pill } from './ui'

const PARTICLES = [
    [8, 20, 6, 0],
    [22, 70, 4, 2],
    [40, 30, 5, 4],
    [58, 80, 3, 1],
    [74, 25, 6, 3],
    [90, 60, 4, 5]
] as const

export function Hero({ empty }: { empty: boolean }) {
    return (
        <section className='hero-wash relative overflow-hidden'>
            {PARTICLES.map(([x, y, size, delay]) => (
                <span
                    key={`${x}-${y}`}
                    className='particle'
                    style={{
                        left: `${x}%`,
                        top: `${y}%`,
                        width: size,
                        height: size,
                        animationDelay: `${delay}s`
                    }}
                />
            ))}
            <div className='relative mx-auto max-w-7xl px-4 pt-10 pb-8'>
                <Pill>Static · private · runs in your browser</Pill>
                <h1 className='mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl'>
                    Every open issue and PR, <span className='gradient-word'>on your radar</span>.
                </h1>
                <p className='text-muted mt-3 max-w-2xl text-base'>
                    {empty
                        ? 'Add the GitHub users, organizations and repositories you care about. Your selection, filters and token stay in this browser. Log in with a token to see private repositories and act on items right here.'
                        : 'Tracking across your sources. Click an item for details, comments and actions.'}
                </p>
            </div>
        </section>
    )
}
