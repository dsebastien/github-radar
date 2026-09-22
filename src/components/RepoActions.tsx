import { createContext, useContext } from 'react'

export interface RepoActions {
    isMuted: (repo: string) => boolean
    toggleMute: (repo: string) => void
}

/** Repository-level actions offered by every RepoMenu, provided once by the app. */
export const RepoActionsContext = createContext<RepoActions | null>(null)

export function useRepoActions(): RepoActions | null {
    return useContext(RepoActionsContext)
}
