---
name: audit-requirements
kind: tactical
description: "Check whether Yandex Games requirements changed since Forge's last audit, and if so, what to re-verify. Fetches the live release-notes + requirements page, compares against the…"
---

# $audit-requirements — has Yandex changed the rules since we last checked?

A full requirements audit is expensive and rarely needed — Yandex changes requirements occasionally,
not weekly. This skill answers "do we even need to audit?" by event, not by calendar. It does NOT
re-audit everything; it detects *whether* an audit is warranted and scopes it.

## Baseline (update this block after each full audit)

```
LAST_FULL_AUDIT: 2026-06-04  (Forge v4.14.0)
REQUIREMENTS_PAGE_DATE: 2026-07-01   ("Дата последнего изменения" on the requirements page at audit time)
DEBUGCHECK_VERSION: v2.7
KNOWN_THRESHOLDS:
  - 4.4 ad delay after gesture: <= 330ms (0.33s)   [Yandex tightened from "prompt" to 330ms — 25.09.2025]
  - 1.19 Game Ready timeout: 90s                    [25.09.2025]
  - 1.21 size limit: 100 MB unzipped
COVERED_POINTS: 1.1 1.3 1.4 1.5 1.6.1.2 1.6.1.6 1.6.1.7 1.6.2.7 1.7 1.8 1.9 1.10.x 1.13.x 1.18 1.19.x 2.14 3.8 4.2 4.4 4.5 4.7 8.2.3
MANUAL_POINTS: 1.14 1.6.2.2 4.3 1.2.2 3.5 5.6 5.12
```

## Steps

### 1. Fetch the live pages
- `web_fetch https://yandex.ru/dev/games/doc/ru/release-notes` — the dated changelog.
- `web_fetch https://yandex.ru/dev/games/doc/ru/concepts/requirements` — read its "Дата последнего изменения: …".

### 2. Compare dates
- If the requirements page "Дата последнего изменения" <= `REQUIREMENTS_PAGE_DATE` baseline AND no
  release-notes entry is newer than `LAST_FULL_AUDIT` → **report "no audit needed"** and stop. Tell
  the user the requirements haven't changed since the last audit (give both dates).
- Otherwise → there are changes. Continue.

### 3. Scope the change (only the delta, not a full re-audit)
List every release-notes entry dated AFTER `LAST_FULL_AUDIT`. For each, classify:
- **Requirement change** (a "Пункт X.Y" added/changed/упразднён, or a threshold like the 330ms/90s
  numbers) → actionable. Map it to the Forge artifact that must change:
  - runtime/behavioral rule → `debugcheck.js` (BOTH copies, keep identical) and/or `runtime-test.mjs` Probe suite
  - static/structural → a `check-*.mjs` verifier
  - human/console/store → the `fix-moderation` manual-review map
- **Doc/metric/SDK-feature change** (new plugin, new metric, calibration list) → usually NOT a Forge
  check change; note it but don't over-react (Lesson #78 — don't cry wolf).

### 4. Report + offer to apply
Output a short table: `date | requirement point | what changed | Forge artifact to update | auto/manual`.
Then offer to apply the actionable ones (each is a normal skill edit + version bump). Don't apply
silently — requirement changes are worth a confirm.

### 5. After a full re-audit, UPDATE THE BASELINE block above
Bump `LAST_FULL_AUDIT`, `REQUIREMENTS_PAGE_DATE`, `DEBUGCHECK_VERSION`, and any new thresholds. This
is the "derive truth, don't hand-maintain a stale list" rule (invariant #17) applied to the audit
itself — the baseline must reflect reality or the next check compares against the wrong date.

## Non-Negotiable
- [ ] Always web_fetch the live pages — never assume from memory what Yandex currently requires
- [ ] "No change" is a valid, common, correct outcome — report it plainly, don't manufacture work
- [ ] Only flag REQUIREMENT changes as actionable; doc/metric/SDK-feature churn is informational
- [ ] When a requirement DID change, name the exact Forge artifact to update (don't just say "audit")
- [ ] After applying, update the baseline block so the next run compares against the right date
- [ ] debugcheck edits go to BOTH copies identically (check-drift guard enforces this)
