# 0002. Search API over per-repository listing

Date: 2026-09-17

## Status

Accepted

## Context

Two ways exist to gather open items across many repositories: list every repository of each source and call `/repos/{owner}/{repo}/issues` for each, or query `/search/issues` with `user:`, `org:` and `repo:` qualifiers. Listing is exact and has no result ceiling but costs one request per repository per page (an org with 80 repos means 80+ requests per refresh, against a 60-per-hour anonymous limit). Search covers many sources in one request but is capped at 1000 results per query, 256 characters per query, and 10 requests per minute anonymously.

## Decision

Use the Search API. Sources are chunked into queries under the character limit, pages are fetched at 100 per page, results are merged and deduplicated by item id, and the dashboard flags when a query hit the 1000-result ceiling.

## Consequences

- A refresh for a handful of users and orgs costs a few requests, which keeps anonymous use practical.
- Very large organizations can exceed 1000 open items per query; users are told and can split sources (for example list specific repos) to get exact coverage.
- Search results carry enough fields (labels, assignees, reactions count, draft flag) to render the list without per-item requests. Details (rendered body, comments) are fetched only when an item is opened.
