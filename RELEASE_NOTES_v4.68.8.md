# Project Forge v4.68.8 — Natural Brief Acceptance

## What changed

- Upgraded the Forge-owned GigaChat terminal adapter to contract `6.3.2-natural-acceptance`.
- Phase 1 now accepts natural whole-set answers such as `принимаю рекомендации`, `принимаю все рекомендации` and `согласен со всеми рекомендациями`.
- The same semantic predicate controls both decision resolution and brief materialization, preventing the validator and writer from disagreeing.
- Qualified responses such as `принимаю рекомендации, но Q2 изменить` remain unresolved and require the requested correction.
- Added a real CLI subprocess regression using the exact phrase reported in `testgigachat-v4`.

## Verification

- GigaChat terminal self-test: 115 checks passed.
- The API-profile audit proves that `принимаю рекомендации` is persisted, materializes Audience/Ambition/Promise/Differentiator/History and clears the durable pending STOP.
- Syntax, drift, dashboard, Codex, sync, update, encoding, manifest and platform gates pass before packaging.

## Compatibility

No project reset is required. Re-run the GigaChat terminal command in a project with the pending Phase 1 STOP and answer `принимаю рекомендации`; existing durable research and brief state are reused.
