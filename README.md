# GitHub Radar

Keep every open GitHub issue and pull request across the users, organizations and repositories you care about on your radar. One page, filters that remember themselves, and actions (upvote, comment, label, assign, close) without leaving the dashboard.

**Live:** https://ghradar.dsebastien.net

Static, private, and generic: it runs entirely in your browser, talks only to `api.github.com`, and starts empty so anyone can point it at their own sources.

## Features

- **Sources**: any mix of GitHub users, organizations and single repositories. Paste a login, `org:name`, `owner/repo` or a GitHub URL.
- **Optional login** with a fine-grained personal access token: private repositories, a much higher API rate limit, and automatic inclusion of your own account and every organization you belong to.
- **Token hygiene**: enter the token's expiry date at login (GitHub shows it when you create the token; browsers cannot read it from the API) and a banner reminds you a week before. Settings › Check permissions probes what the token can do (organizations, private repositories, issue and PR writes, projects) without changing anything: writes are tested with an invalid value GitHub ignores or rejects after its permission check.
- **Focus**: click a source to see only its items (click again to widen back); click a repository name on any card to filter down to that repository.
- **Per-source visibility**: an eye toggle on each source shows or hides its items without removing it; each source shows how many items it contributes.
- **Filters**: full-text (title, repo, `#number`, author, label), issue/PR, open/closed, labels, repos, authors, assignees, milestones (by title across repositories, or none), draft PRs, and "mine" shortcuts (assigned to me, by me, involved), plus involvement shortcuts when logged in: mentions me, review requested, commented (one extra search per kind on each refresh).
- **Noise controls**: "Hide bots" drops items opened by Dependabot, Renovate, GitHub Actions and other apps. "Mute this repository" (in any repository's ⧉ menu) hides a repository's items everywhere; the sources panel lists muted repositories with their item counts to unmute them. Stats, facets and source counts follow both rules.
- **New since your last visit**: items created or updated since you last had the page open get a blue dot; the stats row counts them and filters down to them on click. "Mark all seen" clears the markers.
- **Needs-attention signals**: stale (30+ days idle), dormant (90+ days), unlabeled, unassigned, draft.
- **Load more**: the list renders 50 cards at a time; a button at the bottom loads the next batch.
- **Sort and group**: by recent activity, creation date, discussion, or title; group by repository or author.
- **Actions when logged in**: 👍 upvote, comment (Markdown), add/remove labels, assign/unassign yourself, close/reopen (with confirmation).
- **Milestones** (logged in): set or clear an item's milestone from its panel. In bulk, pick a title shared by the selected items' repositories (each option says how many items it applies to) and optionally create it in the repositories that lack it.
- **Projects** (logged in, with the Projects permission): each card shows its projects and status. Filter by project or "not in any project"; from the item panel or in bulk, add items to a project of any source owner or your own, and set the project's Status field. The project UI hides itself when the token cannot read projects.
- **Bulk actions** (logged in): a checkbox on every card (shift-click for a range) or "Select all N shown", then add/remove labels, assign/unassign yourself, or close/reopen from a sticky bar. Actions run item by item with a progress counter and a cancel button; failures are listed per item. Options that only fit part of the selection say how many items they apply to.
- **Keyboard**: `j`/`k` move between cards (and between items while the panel is open), `Enter` opens the panel, `Esc` closes it, `o` opens the item on GitHub, `x` selects it for bulk actions, `/` jumps to search, `?` lists the shortcuts. Keys are ignored while typing.
- **Installable**: a web app manifest and a service worker make it installable on desktop and phone. The service worker caches the app shell only (the page, its assets, icons), never API responses; with the item list already in `localStorage`, the installed app opens on the last state instantly, even offline.
- **Persistence**: sources, filters, settings, token and the last result set live in `localStorage`, so the dashboard paints instantly on the next visit and refreshes in the background (interval configurable).
- **Shareable views**: "Share this view" copies a link carrying the sources and the whole view (filters, sort, grouping), e.g. `?sources=org:knowii-oss&type=pr&review=needs-my-review&group=repo`, so a bookmark restores a triage view. Opening it merges the sources into yours and applies the view.
- **Saved views**: name the current filters, sort and grouping in the Views panel ("PRs needing review", "dormant issues") and switch between them in one click. Saved in this browser.

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
| Account and Organization › Projects   | Read and write: project memberships, status, add to project (optional)      |

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
