# 0003. localStorage for all persistent state

Date: 2026-09-17

## Status

Accepted

## Context

The dashboard must remember sources, filters, settings, the token and the last result set between visits, and it must work for anyone who opens the public page, without accounts or a backend.

## Decision

Everything persists in `localStorage` under a `github-radar:` prefix. Every read is wrapped so that a blocked or full storage degrades to in-memory state. Plain-object values are merged over their defaults on read so that new settings introduced later get their default without migrations. A "Forget everything" action clears all keys.

## Consequences

- No server, no sync: state is per browser. Sharing a configuration is done through the `?sources=` preset URL instead.
- The cached item set makes the page useful immediately on load and keeps working when GitHub is rate-limiting; a refresh replaces it atomically.
- Storage quota is a soft limit: the cache of a few thousand items stays well under typical 5 MB budgets, and failures to write are silent by design.
