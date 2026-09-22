import { useState } from 'react'
import { Modal } from './Modal'
import { fromDateInput } from '@/lib/token'
import { Button } from './ui'

export const TOKEN_URL =
    'https://github.com/settings/personal-access-tokens/new?name=GitHub+Radar&description=Read+and+act+on+issues+and+pull+requests+from+GitHub+Radar'

export function LoginDialog({
    onClose,
    onToken
}: {
    onClose: () => void
    onToken: (token: string, expiresAt: number | null) => void
}) {
    const [value, setValue] = useState('')
    const [expires, setExpires] = useState('')
    const trimmed = value.trim()
    return (
        <Modal title='Log in with a GitHub token' onClose={onClose}>
            <p className='text-muted text-sm'>
                GitHub Radar is a static site: there is no server, so it cannot run the usual GitHub
                OAuth flow. Paste a{' '}
                <strong className='text-white'>fine-grained personal access token</strong> instead.
                It is stored in this browser only (localStorage) and sent to api.github.com and
                nowhere else.
            </p>
            <ol className='text-muted mt-3 list-decimal space-y-1 pl-5 text-sm'>
                <li>
                    <a
                        href={TOKEN_URL}
                        target='_blank'
                        rel='noreferrer'
                        className='text-secondary-text underline'
                    >
                        Create a token
                    </a>{' '}
                    and choose the repositories it may access (all, or a selection).
                </li>
                <li>
                    Permissions: <code className='font-mono text-xs'>Metadata: read</code>{' '}
                    (automatic), <code className='font-mono text-xs'>Issues: read and write</code>,{' '}
                    <code className='font-mono text-xs'>Pull requests: read and write</code>. Use{' '}
                    <em>read</em> only if you never want to act from here.
                </li>
                <li>
                    For organizations, also grant{' '}
                    <code className='font-mono text-xs'>Members: read</code> on the org so your orgs
                    are discovered automatically.
                </li>
                <li>
                    Optional, for GitHub Projects:{' '}
                    <code className='font-mono text-xs'>Projects: read and write</code> on your
                    account and on each organization.
                </li>
            </ol>
            <form
                className='mt-4 flex flex-wrap gap-2'
                onSubmit={(e) => {
                    e.preventDefault()
                    if (trimmed) onToken(trimmed, fromDateInput(expires))
                }}
            >
                <input
                    type='password'
                    autoFocus
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder='github_pat_…'
                    autoComplete='off'
                    spellCheck={false}
                    className='bg-well border-line focus:border-secondary-text min-w-0 flex-1 rounded-lg border px-3 py-2 font-mono text-sm outline-none'
                />
                <Button type='submit' variant='primary' disabled={!trimmed}>
                    Log in
                </Button>
                <label className='text-muted flex w-full items-center gap-2 text-xs'>
                    Expires on (optional, for a reminder a week before):
                    <input
                        type='date'
                        value={expires}
                        onChange={(e) => setExpires(e.target.value)}
                        className='bg-well border-line rounded-lg border px-2 py-1 text-white'
                    />
                </label>
            </form>
        </Modal>
    )
}
