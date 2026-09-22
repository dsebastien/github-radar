# GitHub Radar

Keep every open GitHub issue and pull request across the users, organizations and repositories you care about on your radar. One page, filters that remember themselves, and actions (upvote, comment, label, assign, close) without leaving the dashboard.

**Live:** https://ghradar.dsebastien.net

Static, private, and generic: it runs entirely in your browser, talks only to `api.github.com`, and starts empty so anyone can point it at their own sources.

## Features

- **Sources**: any mix of GitHub users, organizations and single repositories. Paste a login, `org:name`, `owner/repo` or a GitHub URL.
- **Optional login** with a fine-grained personal access token: private repositories, a much higher API rate limit, and automatic inclusion of your own account and every organization you belong to.
- **Focus**: click a source to see only its items (click again to widen back); click a repository name on any card to filter down to that repository.
- **Per-source visibility**: an eye toggle on each source shows or hides its items without removing it; each source shows how many items it contributes.
- **Filters**: full-text (title, repo, `#number`, author, label), issue/PR, open/closed, labels, repos, authors, assignees, draft PRs, and "mine" shortcuts (assigned to me, by me, involved).
- **Needs-attention signals**: stale (30+ days idle), dormant (90+ days), unlabeled, unassigned, draft.
- **Load more**: the list renders 50 cards at a time; a button at the bottom loads the next batch.
- **Sort and group**: by recent activity, creation date, discussion, or title; group by repository or author.
- **Actions when logged in**: 👍 upvote, comment (Markdown), add/remove labels, assign/unassign yourself, close/reopen (with confirmation).
- **Persistence**: sources, filters, settings, token and the last result set live in `localStorage`, so the dashboard paints instantly on the next visit and refreshes in the background (interval configurable).
- **Shareable presets**: `?sources=user:dsebastien,org:knowii-oss,DeveloPassion/obsidian-starter-kit-plugin` pre-fills the sources on first load. Use the "Share this view" button.

## Logging in

GitHub Pages is static, so the usual OAuth "Log in with GitHub" flow is not possible without a server. GitHub Radar uses a **fine-grained personal access token** instead. It never leaves your browser except in requests to `api.github.com`.

Create one at https://github.com/settings/personal-access-tokens/new with:

| Permission                            | Why                                                                         |
| ------------------------------------- | --------------------------------------------------------------------------- |
| Repository access: the repos you want | Private repositories only show up for repos the token can access            |
| Metadata: read                        | Always on                                                                   |
| Issues: read and write                | List issues; comment, label, assign, close (read-only is fine to just view) |
| Pull requests: read and write         | Same, for PRs                                                               |
| Organization › Members: read          | Discover your organizations automatically                                   |

## Running locally

```bash
bun install
bun run dev        # http://localhost:5173
bun run validate   # tsc + tests + lint + format check
bun run build      # production build in dist/
```

Node 20+ with npm works too (`npm install`, `npm run dev`), but the repo is set up for [Bun](https://bun.sh).

## Deploying your own

1. Fork the repository.
2. In the fork's settings, set **Pages › Source** to **GitHub Actions**.
3. Push to `main`. The `deploy.yml` workflow builds and publishes to `https://<you>.github.io/github-radar/`.

The build derives its base path from the repository name, so renaming the fork is enough. For a custom domain or a user/org root site, set `BASE_PATH` to `/` in the workflow.

## Limits worth knowing

- The GitHub Search API returns at most **1000 results per query**. Sources are chunked into several queries automatically; a user or org over the ceiling is searched repository by repository (a few per query), and a single repository over it is split by creation date. Only a single day with more than 1000 items of one type would still be cut short, and the dashboard says so.
- Unauthenticated searches are limited to **10 requests per minute**; a token raises that to 30, and the REST rate limit to 5000 per hour. The dashboard paces its requests against those budgets and waits for the window to reset when needed, so a large first load can take a couple of minutes. After that, refreshes are incremental (only what changed) and cheap.

## Contributing

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (enforced by commitlint). After cloning, run `bun run setup` once to enable the repo's Git hooks (Prettier on staged files, type check, commit message lint). See [DEVELOPMENT.md](DEVELOPMENT.md).

## License

MIT, see [LICENSE](LICENSE).

Made by [Sébastien Dubois](https://dsebastien.net) ([DeveloPassion](https://developassion.be)).
