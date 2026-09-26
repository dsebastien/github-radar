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
- **Involvement**: items the viewer is **mentioned** in, asked to review (**review requested**), or **commented** on, found by dedicated searches (`mentions:@me`, `review-requested:@me`, `commenter:@me`) on each refresh and applied as flags to the listed items. Logged in only.
- **Action**: a write the viewer performs on an item from the dashboard: upvote (a 👍 reaction), comment, set labels, assign or unassign self, close or reopen. Actions require a viewer and a token with write permission.
- **Selection**: the items checked for a **bulk action**, which runs the same action item by item (never atomically) and reports per-item failures.
- **Noise**: items the user chose not to see anywhere: items of **muted** repositories (a persisted rule, not a filter, so resetting filters keeps it) and, when _hide bots_, _hide archived_ or _hide dormant repos_ is on, items opened by bots or items of repositories with that **repo status**. Noise is removed before stats, facets and source counts.
- **Repo status**: **archived** (GitHub's flag) or **dormant** (nothing pushed to any branch for 90+ days), from the owner repository lists (`pushed_at`, `archived`), refetched per source every 6 hours and stored locally apart from the item cache. Archived wins over dormant; a repository not in any list has no status and is never hidden. Not to be confused with a dormant _item_ (see attention flags).
- **Last visit**: when the page was last open, stamped every minute and when it is hidden, and frozen for the current session. An item is **new** when its `updated_at` is later.
- **Preset**: sources and, optionally, a view encoded in the page URL (`?sources=` plus filter parameters such as `type=pr&labels=bug`). Imported once on load (sources merged into the stored ones, the view replacing the current filters), then the URL is cleaned.
- **View**: the filters, sort and grouping together. A **saved view** is a named view stored locally.
- **Cache**: the last fetched item set, stored locally with the key of the effective sources and state it was fetched for. It lets the dashboard paint instantly and is replaced on every successful refresh.
- **Repo menu**: the ⧉ button next to any repository name (item card, item panel, repo group header, repo source). It copies the repo's web URL, HTTPS clone URL or SSH clone URL, derived from `owner/name` (see `src/lib/repo.ts`).
