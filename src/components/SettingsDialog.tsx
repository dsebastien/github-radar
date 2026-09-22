import { Modal } from './Modal'
import { Button } from './ui'
import type { Settings } from '@/lib/types'

interface Props {
    settings: Settings
    onChange: (s: Settings) => void
    loggedIn: boolean
    /** Whether the token can read GitHub Projects; null while unknown. */
    projectsAvailable: boolean | null
    onClose: () => void
    onReset: () => void
}

export function SettingsDialog({
    settings,
    onChange,
    loggedIn,
    projectsAvailable,
    onClose,
    onReset
}: Props) {
    return (
        <Modal title='Settings' onClose={onClose}>
            <div className='space-y-5 text-sm'>
                <label className='flex items-start gap-3'>
                    <input
                        type='checkbox'
                        checked={settings.includeMine}
                        disabled={!loggedIn}
                        onChange={(e) => onChange({ ...settings, includeMine: e.target.checked })}
                        className='accent-secondary mt-1'
                    />
                    <span>
                        <span className='font-semibold'>Include everything I can access</span>
                        <span className='text-muted block'>
                            When logged in, also search your own account and every organization you
                            belong to, private repositories included.
                        </span>
                    </span>
                </label>
                {loggedIn && projectsAvailable === false && (
                    <p className='text-muted rounded-lg bg-white/5 p-3'>
                        <span className='font-semibold text-white'>GitHub Projects are off.</span>{' '}
                        Your token cannot read projects, or no source owner has any. To see and
                        change project membership and status, give the token{' '}
                        <code className='font-mono text-xs'>Projects: read and write</code> on your
                        account and each organization, then log in again.
                    </p>
                )}
                <label className='block'>
                    <span className='font-semibold'>Auto refresh</span>
                    <select
                        value={settings.refreshMinutes}
                        onChange={(e) =>
                            onChange({ ...settings, refreshMinutes: Number(e.target.value) })
                        }
                        className='bg-well border-line mt-1 block w-full rounded-lg border px-3 py-2'
                    >
                        <option value={0}>Off</option>
                        <option value={5}>Every 5 minutes</option>
                        <option value={15}>Every 15 minutes</option>
                        <option value={30}>Every 30 minutes</option>
                        <option value={60}>Every hour</option>
                    </select>
                </label>
                <div className='border-line border-t pt-4'>
                    <p className='text-muted mb-2'>
                        Everything (sources, filters, token, cached items) lives in this browser
                        only.
                    </p>
                    <Button variant='danger' size='sm' onClick={onReset}>
                        Forget everything
                    </Button>
                </div>
            </div>
        </Modal>
    )
}
