# Domain glossary

The vocabulary used in code, tests and docs. Use these terms exactly.

- **Source**: a place GitHub Radar looks for items. One of three kinds: a **user**, an **org**, or a single **repo** (`owner/name`). Sources are what the user configures; they never carry state of their own.
- **Item**: an issue or a pull request, normalized from the GitHub Search API. An item always belongs to exactly one repository and has a **type** (`issue` or `pr`) and a **state** (`open` or `closed`).
- **Viewer**: the logged-in GitHub account, resolved from the token. There is at most one viewer. When there is none the app is in **anonymous** mode: public data only, low rate limit, no actions.
- **Effective sources**: the configured sources plus, when a viewer exists and the _include mine_ setting is on, the viewer's own account and every org they belong to. This is what is actually searched.
- **Filters**: the user's view over the fetched items (text, type, state, labels, repos, authors, assignees, mine, attention, sort, group). Filters are applied client-side, except **state**, which is part of the search query because closed items are not fetched by default.
- **Facets**: the distinct filter values present in the fetched items, with counts. Derived, never stored.
- **Attention flags**: signals that an item may need a human: **stale** (no activity for 30+ days), **dormant** (90+ days), **unlabeled**, **unassigned**, **draft**. Derived from the item and the current time.
- **Project link**: an item's membership in a GitHub Project (v2): the project, the project item id, and the item's **Status** (the project's single-select field of that name). Enriched like PR details, refetched when the item changes or after 6 hours, because project changes do not bump `updated_at`.
- **Mine**: a filter shortcut relative to the viewer: **assigned** (viewer is an assignee), **authored** (viewer opened it), **involved** (either).
- **Action**: a write the viewer performs on an item from the dashboard: upvote (a 👍 reaction), comment, set labels, assign or unassign self, close or reopen. Actions require a viewer and a token with write permission.
- **Selection**: the items checked for a **bulk action**, which runs the same action item by item (never atomically) and reports per-item failures.
- **Noise**: items the user chose not to see anywhere: items of **muted** repositories (a persisted rule, not a filter, so resetting filters keeps it) and, when _hide bots_ is on, items opened by bots. Noise is removed before stats, facets and source counts.
- **Preset**: a list of sources encoded in the page URL (`?sources=`). A preset is imported into the stored sources once, on load, then the URL is cleaned.
- **Cache**: the last fetched item set, stored locally with the key of the effective sources and state it was fetched for. It lets the dashboard paint instantly and is replaced on every successful refresh.
- **Repo menu**: the ⧉ button next to any repository name (item card, item panel, repo group header, repo source). It copies the repo's web URL, HTTPS clone URL or SSH clone URL, derived from `owner/name` (see `src/lib/repo.ts`).
