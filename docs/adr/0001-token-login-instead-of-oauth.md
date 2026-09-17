# 0001. Personal access token login instead of OAuth

Date: 2026-09-17

## Status

Accepted

## Context

GitHub Radar deploys to GitHub Pages, which serves static files only. GitHub's OAuth web flow requires exchanging the authorization code for a token with the client secret, and GitHub does not send CORS headers on that endpoint, so a browser cannot do it alone. The device flow has the same restriction. A real "Log in with GitHub" button therefore needs a server-side component (for example a Cloudflare Worker) and a registered OAuth App.

## Decision

Login is done by pasting a fine-grained personal access token. The token is stored in `localStorage` and sent only to `api.github.com` as a bearer token. The login dialog documents the exact permissions to grant.

## Consequences

- Zero infrastructure: the whole project is one static site that anyone can fork and deploy.
- The user controls scope precisely (which repositories, read vs write) at token creation time.
- Slightly more friction for first-time users than an OAuth button. If that becomes a problem, an optional OAuth proxy can be added later without changing the client seam: `GitHubClient` only needs a token string.
- The token lives in the browser's storage; the app runs on its own origin (`<owner>.github.io/github-radar/`), which is isolated from other Pages sites under the same owner only by path, not by origin. Users who care should scope tokens narrowly and use expirations.
