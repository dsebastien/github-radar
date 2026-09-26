import { createContext, useContext } from 'react'
import type { RepoStatus } from '@/lib/noise'

export interface RepoActions {
    isMuted: (repo: string) => boolean
    toggleMute: (repo: string) => void
    /** Archived or dormant, null when active or unknown. */
    status: (repo: string) => RepoStatus | null
}

/** Repository-level actions offered by every RepoMenu, provided once by the app. */
export const RepoActionsContext = createContext<RepoActions | null>(null)

export function useRepoActions(): RepoActions | null {
    return useContext(RepoActionsContext)
}
