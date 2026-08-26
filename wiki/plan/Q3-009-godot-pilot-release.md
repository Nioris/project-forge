---
id: Q3-009
title: Godot pilot and Forge release
status: in_progress
started: "2026-08-26"
deps: [Q3-007]
files:
  - scripts/codex-pipeline.mjs
  - scripts/check-codex-pipeline.mjs
  - scripts/check-project-git.mjs
  - .claude/skills/status/references/phase-state.mjs
  - .claude/skills/status/references/project-git.mjs
  - scripts/check-execution-contract.mjs
  - wiki/bugs/codex-pipeline-inherited-read-only.md
  - wiki/bugs/codex-model-git-checkpoint-sandbox.md
  - RELEASE_NOTES_v4.68.54.md
  - RELEASE_NOTES_v4.68.55.md
  - RELEASE_NOTES_v4.68.56.md
  - RELEASE_NOTES_v4.68.57.md
  - RELEASE_NOTES_v4.68.58.md
  - wiki/bugs/godot-clean-profile-editor-import.md
  - wiki/bugs/bump-version-dry-run-mutated-source.md
  - scripts/package-forge.mjs
  - scripts/check-package-forge.mjs
  - scripts/bump-version.mjs
  - scripts/check-bump-version.mjs
  - scripts/check-drift.mjs
  - mcp-server/verifiers.json
  - wiki/plan/Q3-009-godot-pilot-release.md
  - wiki/_current.md
  - wiki/_map.md
---

# Q3-009 — Godot pilot and Forge release

## What

Прогнать маленькую 2D-игру целиком на Codex, измерить сбои/токены/время/качество и только после
этого выпустить новую версию Forge с проверенной границей поддержки.

## Why

Декларативная поддержка без end-to-end пилота не является готовой возможностью.

## Acceptance criteria

- [ ] Пилот проходит Фазы 1–8 без browser verifier substitution.
- [ ] Зафиксированы ошибки Forge и их владельцы.
- [ ] Снимки, видео, playtest и release artifacts проверены независимо.
- [ ] Каждый corrective runtime release проходит собственные регрессии до установки; финальный статус
  Q3-009 и заявленная pilot-ready версия публикуются только после полного GREEN Фаз 1–8.

## Notes

Godot C# не заявляется как Web/Yandex target; для web остаются HTML/Babylon paths.

## Pilot run 01 — infrastructure block

- Date: 2026-08-26.
- Pilot: `F:\ProjectForgeUniversal\q3-009-godot-pilot`, Godot GDScript, Forge v4.68.52.
- Phase 1 reached its durable Task boundary and then failed closed before it could write the authorised
  evidence (`ANALYSIS.md`, `.forge-ai.json`, `wiki/**`, `assets/**`).
- Durable result: `PHASE1_WRITE_SCOPE_BLOCKED`, owner `infrastructure`, resume policy
  `environment_change`; diagnostic fingerprint `e082064537bb69ad2916`.
- Root cause: the Codex launcher inherited a read-only sandbox instead of selecting an explicit writable
  project sandbox. No false completion, evidence write or Git checkpoint occurred.
- A secondary defect let an invalid internal resume policy (`rerun`) reach contract construction and print
  a stack trace instead of returning a bounded validation error.

## v4.68.54 corrective scope

- The first Codex phase launch explicitly uses `workspace-write` with unattended approval disabled.
- Resume inherits the trusted policy of the original session; it receives no broad filesystem override.
- The pipeline does not bypass hook trust and does not use `danger-full-access`.
- `phase-state` documents and validates the allowed resume policies before any state mutation.
- Regressions prove writable launch selection, absence of broad bypass flags and clean rejection of an
  invalid resume policy without changing the durable marker.
- v4.68.53 was packaged but rejected before publication because its Russian README still linked to stale
  release notes. Its immutable ZIP is preserved and is not installed.
- v4.68.54 was packaged, published, installed and synchronized. Run 02 verified real Phase 1 evidence
  writes and completion on the same pilot.

## Pilot run 02 — Phase 1 passed, Git checkpoint blocked

- Phase 1 reached both required user STOPs, accepted the minimal two-level pilot scope and persisted the
  approved brief, research, KPI hypotheses, content deficit and AI Studio baseline.
- The completion gate rejected two rounds of unsourced factual lines. The same session repaired them;
  final result was `PHASE_CONTRACT_PASSED` with no false completion.
- Cost report: 6.6M input tokens, 97% cached/reused, 36.9K output, 0 compactions and 0 unexpected stops.
- The model-side checkpoint then failed to create `.git/index.lock`. This is an expected boundary of
  `workspace-write`, but the Git lifecycle was incorrectly owned by the nested model process.
- Diagnostic fingerprint: `daa837b168842956d2d3` (`MODEL_GIT_CHECKPOINT_SANDBOX_BLOCKED`).

## v4.68.55 corrective scope

- The pipeline host checkpoints pending work before each phase and the completed phase plus cost report
  before it may advance.
- Nested `phase-state` delegates Git only during a host-owned Codex pipeline run; direct Claude/GigaChat
  workflows keep their existing checkpoint path.
- Phases 1–7 make local commits only. Private GitHub push is attempted and required at Phase 8+.
- A local host checkpoint failure is logged and stops the current process without downgrading an already
  passed completion gate.
- Late Git initialization excludes `.forge/runs/**` before the first `git add`.

Final review rejected the immutable v4.68.55 ZIP before publication/install: completion state was durable,
but checkpoint failure state was not. After a failed required Phase 8 push, restart could select Phase 9
and its local-only preflight would not retry the missing publication.

## v4.68.56 corrective scope

- `.forge/git-checkpoints.json` records `pending`, `complete` and `failed` completion checkpoints outside
  Git history with atomic writes; a PID-owned single-writer lease covers the whole commit/push operation.
- Pipeline startup reconciles every completed marker before MCP probing, Task binding, user prompts or a
  model launch. Missing state from earlier releases is migrated by the same idempotent path.
- Explicit early-phase checkpoint failures block status and direct next-phase commands. Missing, corrupt
  or locally forged release state fails closed at Phase 8 instead of silently advancing.
- Phases 1–7 remain local-only. Phase 8+ requires a confirmed private GitHub remote and successful push;
  disabled or incomplete GitHub automation is a durable release blocker.
- Git errors are bounded and scrubbed before ledger, diagnostics or terminal output.
- Regression fixtures cover restart with `--from 9`, failed reconciliation before model access, semantic
  ledger validation, direct-command bypass, late repository initialization, locking and secret redaction.

The complete immutable v4.68.56 ZIP was rejected before publication/install. `package-forge.mjs --help`
unexpectedly built the archive, consuming the version while its documentation still identified a
candidate. Final review also found that the manual checkpoint entrypoint could bypass the phase runner's
full operation lease.

## v4.68.57 corrective scope

- The public/manual checkpoint entrypoint and the phase runner use one PID-owned lease over the entire
  commit/push operation; a parallel manual checkpoint fails before touching Git state.
- The phase runner calls the unlocked implementation only while it owns that same lease, avoiding a
  nested-lock escape or deadlock.
- Packaging `--help`, invalid options and ambiguous output paths stop before manifest/package work.
- Dedicated regressions prove manual-vs-phase exclusion and side-effect-free package CLI errors.
- All v4.68.56 restart reconciliation, private Phase 8+ publication and redaction changes are carried
  forward unchanged.

## Pilot run 03 — Phase 2 passed, Godot runtime boundary repaired

- v4.68.57 startup reconciled Phase 1 into local commit `111bdf1`; Phase 2 completed as local commit
  `603b04c`. GitHub correctly remained at `fb1bd5e` because publication is deferred through Phase 7.
- Phase 3 created the real modular Circuit Courier project and repaired genuine serialization and
  GDScript parse defects before the native construct gate.
- The remaining failure reproduced on an empty Godot project: inherited profile paths caused
  certificate/editor-settings/user-store errors and signal 11 inside the Codex boundary.
- An isolated profile removed the crash, but editor-only `--import` stalled while Godot 4.7 generated a
  clean editor theme. A normal native game startup loaded all pilot resources and reached
  `CIRCUIT_COURIER_READY` in about one second.

## v4.68.58 corrective scope

- Construct, capture, proof, tech and playtest processes use temporary writable Godot user/profile/XDG
  roots instead of the developer profile.
- GDScript construct verification regenerates `global_script_class_cache.cfg` inside the isolated copy
  and validates bounded game startup without editor-only import; C# retains import/build.
- Host user/certificate failures are infrastructure-owned, while parse/compiler errors always retain
  project-failure priority.
- Fixture regressions bind the environment and class-cache boundary. A direct diagnostic reaches the
  Circuit Courier marker, but durable Phase 3 completion waits for the installed v4.68.58 gate.
- Release review also exposed that unknown `--dry-run` was ignored by `bump-version.mjs` and mutated the
  candidate to 4.68.59. v4.68.58 now supports both dry aliases, rejects unknown/ambiguous modes before
  writes and hashes a complete fixture tree to prove informational calls are side-effect free.
