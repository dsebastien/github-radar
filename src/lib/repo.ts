/** Every address a `owner/name` repository can be reached at. */
export interface RepoUrls {
    /** Web page on github.com. */
    web: string
    /** HTTPS clone URL, as `git clone` expects it. */
    https: string
    /** SSH clone URL, as `git clone` expects it. */
    ssh: string
}

/** Derives the web, HTTPS and SSH addresses of a `owner/name` repository. */
export function repoUrls(repo: string): RepoUrls {
    const full = repo.trim().replace(/^\/+|\/+$/g, '')
    return {
        web: `https://github.com/${full}`,
        https: `https://github.com/${full}.git`,
        ssh: `git@github.com:${full}.git`
    }
}

/**
 * Copies text to the clipboard. Resolves to `false` when the browser refuses
 * (insecure context, denied permission), so callers can fall back to showing the text.
 */
export async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text)
        return true
    } catch {
        return false
    }
}
