# Development

## Setup

```bash
bun install
bun run setup   # enables the repo's Git hooks (.gitconfig): prettier on staged files, tsc, commitlint
```

## Scripts

| Script             | What it does                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `bun run dev`      | Vite dev server                                                                                            |
| `bun run build`    | Type check, then production build to `dist/`                                                               |
| `bun run preview`  | Serve `dist/` locally                                                                                      |
| `bun run tsc`      | Type check only                                                                                            |
| `bun run test`     | Unit tests (`bun test`, files named `*.spec.ts`)                                                           |
| `bun run lint`     | ESLint, zero warnings allowed                                                                              |
| `bun run format`   | Prettier, write                                                                                            |
| `bun run test:e2e` | Playwright smoke test on the production build, GitHub API mocked (`bunx playwright install chromium` once) |
| `bun run validate` | tsc + test + lint + format check, in parallel                                                              |
| `bun run cm`       | Commitizen prompt for a Conventional Commit message                                                        |

## Layout

```
src/
  lib/          pure modules, tested: sources, query, filtering, storage, github client
  hooks/        useRadar (data + cache + refresh), usePersistedState
  components/   UI, no business logic
  App.tsx       wiring
docs/adr/       architecture decision records
CONTEXT.md      domain glossary (see the domain-modeling skill)
.claude/skills/ Matt Pocock's engineering skills, copied for agent sessions
```

## Testing

Unit tests live at the pure seams: source parsing, query building, filtering/sorting/grouping/facets, enrichment, bulk actions, views, and the GitHub client against a fake `fetch`. Add a `.spec.ts` next to any pure module you add.

`e2e/*.e2e.ts` holds a Playwright smoke test that loads the production build in Chromium with `api.github.com` mocked: a preset renders items, filters work, and the item panel opens. It runs in CI and before every deploy, and catches browser-only failures that Bun cannot (the `fetch` receiver bug shipped once because only Bun ran the client).

## Commits and release

Conventional Commits, scopes `all | app | build | deps | docs | release`, enforced by commitlint through the Git hook. Every push to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`; pull requests run `.github/workflows/ci.yml`.

## Definition of done

`bun run validate` passes, `bun run build` passes, and any user-visible change is reflected in `README.md`. UI changes need a manual run in the browser.
