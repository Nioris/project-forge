---
name: pocketbase
description: >
  PocketBase 0.23+ integration for SvelteKit 2.x — per-request instances, SSR-safe auth, realtime SSE,
  batch API, file uploads, collection schema, and deployment. Use this skill for PocketBase setup, auth,
  realtime, collections, BaaS, SQLite backend, or backend for SvelteKit.
---

# PocketBase Skill

Production PocketBase 0.23+ with SvelteKit 2.x.

## Critical Rules

1. **New PocketBase instance per SSR request.** Global singleton leaks auth between users.
2. **Use SUBDOMAIN** (`api.example.com`), not subpath — PocketBase doesn't support subpath routing.
3. **API rules**: `null` = locked (nobody can access), `""` = open (anyone can access). Defaults are null.
4. **Superuser clients**: set `autoCancellation(false)`.
5. **Nginx proxy**: add `proxy_buffer_size 256k; proxy_buffers 4 512k;` — SvelteKit Link headers cause 502 without.
6. **Realtime SSE Nginx**: `proxy_set_header Connection ''` and `proxy_read_timeout 360s`.

## v0.23 Features

- **Batch API**: `POST /api/batch` for atomic multi-operation requests
- **MFA/OTP**: Built-in multi-factor authentication
- **Cron scheduler**: `pb.cron.add("backup", "0 3 * * *", handler)`
- **Relation modifiers**: `+`/`-` for append/remove in relation fields
- **Rate limiter**: Built-in, configurable per collection
- **_superusers**: Replaces admin auth (collection-based now)

## Non-Negotiable Acceptance Criteria (Serudda)

1. **S — Server hook creates unique PB per request.** `new PocketBase(url)` inside `handle`, not module scope.
2. **E — Export cookie on every response.** `exportToCookie({ secure: true, httpOnly: false, sameSite: 'lax' })`.
3. **R — Realtime only in browser.** `$effect` or `onMount` guard. No SSE on server side.
4. **U — User auth auto-refreshed.** `authRefresh()` on valid but expiring token. Redirect on failure.
5. **D — Deployed on subdomain, not subpath.** `api.example.com`, not `example.com/pb/`.
6. **D — Data access rules explicit.** Every collection has non-null listRule/viewRule/createRule/updateRule/deleteRule.
7. **A — Admin panel IP-restricted.** `/_/` blocked in Nginx except whitelisted IPs.

## References

- `references/pocketbase-sveltekit.md` — Hooks, auth, realtime, batch API, file upload, Nginx, Docker.
