# CONTEXT ESSENTIALS — re-injected on every session start (including after /compact)

## Язык вики — только русский. Код/комментарии внутри файлов — английский.

## Three-file working memory

| File | Size | Role |
|------|------|------|
| `wiki/_current.md` | 20–30 lines | What we are doing RIGHT NOW. Session goal, progress checkboxes, last 3 decisions. Update on every meaningful step. Injected in full. |
| `wiki/plan/*.md`   | one per task | Structured tasks with `status`, `files`, acceptance criteria. Parsed by hooks to detect drift. |
| `wiki/_map.md`     | any          | Project-wide status: Done / In Progress / Next, links to features, architecture, decisions. Updated ≥1× per session. |

**Start of every session:** read `_current.md` first, then skim plan summary in context, then `_map.md`.
**After every meaningful edit:** refresh `_current.md` progress checkboxes.
**When a task is done:** mark `status: done` in `wiki/plan/<task>.md` and move item to `Done` in `_map.md`.
**End of session:** pick next from plan into `_current.md`.

## Plan drift

**Every Write/Edit triggers `plan-check.mjs`.** If the file you edit is NOT in
the `files:` list of any in_progress task in `wiki/plan/`, the hook injects a
warning into your context listing the active tasks. Either:
  - add the file to the task's `files:` list, or
  - close the current task and start a new one, or
  - log the side-quest as a pitfall if it's not plannable work.

The status line shows the active task at all times.

## Wiki update triggers — hard rules

| When | Update |
|------|--------|
| Task work started | flip `status: in_progress` in `wiki/plan/<id>-<slug>.md`, fill `started:` |
| Acceptance met | check the box in plan file; when all checked, set `status: done` |
| Feature finished | `wiki/features/<n>.md` + link in `wiki/_map.md` + close plan task |
| Architectural choice | `wiki/decisions/<NNN>-<n>.md` (append-only) |
| Bug found | `wiki/bugs/<n>.md` |
| Mistake made | append to `wiki/pitfalls.md` |
| Build/release | append to `wiki/changelog.md` AND `wiki/deploy-log.md` |
| Optimisation | `wiki/performance.md` with before/after |
| Shortcut taken | `wiki/tech-debt.md` |
| User request | `wiki/requests.md` first, then work |
| i18n changed | `wiki/i18n-status.md` |
| API/SDK added | `wiki/api.md` |
| Tests changed | `wiki/testing.md` |

All append-only: `changelog`, `deploy-log`, `pitfalls`, `decisions/*` — never delete entries.

## Stop hook will BLOCK you

At session stop, `wiki-audit.mjs` runs. It blocks stopping if:

1. Source files under `src/`, `app/`, `lib/`, `scripts/` were edited today but have no `wiki/features/*.md` for their module
2. Today's git log has `feat:` commits not in `wiki/changelog.md`
3. Build/deploy commands ran today but `wiki/deploy-log.md` has no entry for today
4. `wiki/_map.md` mtime is older than today's session log
5. `wiki/_current.md` is missing or stale
6. Files edited today are not in any plan task's `files:` list
7. In_progress tasks have all acceptance criteria checked (should be `done`)

You will see a numbered list of exactly what's missing. Fix, then retry stop.
Emergency bypass: `FORGE_SKIP_AUDIT=1` — logged to session file, not silent.

## Before `/convert`, `/build-apk`, `/yandex-release`, `/vk-release`, `/deploy`

1. Read `docs/BUILD_KNOWLEDGE.md` — all of it
2. Run `/credentials-check`
3. Read `wiki/pitfalls.md` — don't repeat old mistakes
4. Check `wiki/deploy-log.md` — what went wrong last time

## Hard nevers (non-negotiable)

- Never build release APK/AAB without a real keystore
- Never use SDK versions from memory — web_search first
- Never work around SDK bugs — check newer version first
- Never `as`, `any`, `@ts-ignore`, `==`, silent catches
- Never nest >3 levels, never function >50 lines
- Never write code without file-header JSDoc
- Never commit commented-out code
- Never hardcode values that appear more than once
- Never put logic in render/template code
- Never delete entries from append-only files

## If you are reading this after compaction

All prior context was summarised. Treat `wiki/_current.md`, the plan summary,
and `wiki/_map.md` as the only source of truth. Re-read all three before
continuing. Do not trust your memory of prior decisions — check `wiki/decisions/`.
