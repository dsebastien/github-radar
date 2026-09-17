# Agent guide

GitHub Radar: a static React + TypeScript + Tailwind dashboard listing open GitHub issues and pull requests across configured sources. Deployed to GitHub Pages from `main`.

## Read first

- `CONTEXT.md`: the domain glossary. Use its terms in code, tests and commits.
- `docs/adr/`: decisions already made (token login, Search API, localStorage). Do not relitigate without a new ADR.
- `DEVELOPMENT.md`: scripts, layout, definition of done.

## Skills

`.claude/skills/` holds Matt Pocock's engineering skills (grilling, tdd, codebase-design, domain-modeling, code-review, implement, …). Use `tdd` for logic in `src/lib`, `codebase-design` when changing a seam, `domain-modeling` when a new term appears (update `CONTEXT.md` inline).

## Rules

- Logic lives in `src/lib` as pure functions with `.spec.ts` tests; components stay declarative.
- `GitHubClient` is the only place that calls `fetch`. Every GitHub endpoint goes through it.
- Design language: Knowii web palette (`src/styles/index.css` `@theme`). Cards `rounded-xl` on `surface`, primary buttons solid magenta, one gradient word per headline, muted text at ~60% white.
- Keep the app generic: nothing hardcodes a specific user or organization. Personal defaults are expressed as `?sources=` presets, never in code.
- Conventional Commits with the scopes in `commitlint.config.ts`. Never bypass hooks.
- `bun run validate` must pass before a commit is considered done.
