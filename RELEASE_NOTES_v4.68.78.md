# Project Forge v4.68.78

## Evidence-based game quality

- Web acceptance requires bounded real-input scenarios and source/contract-bound engine receipts;
  screenshots and editable legacy reports cannot stand in for actual player actions.
- Phase 5 rejects SDK tokens found only in source/comments; local runtime-stub checks are not claimed
  as real storefront integration certification. Phase 7 rechecks current Phase 4 visual acceptance.
- Mobile capture/targets follow each approved screen's exact viewport, including landscape states.
- Web/Godot diagnostic capture writes separate QA output without replacing accepted Phase 4 evidence.
- Browser capture writes its manifest before bounded teardown; a hanging browser shutdown cannot
  withhold completed screenshots indefinitely. The copied phase runtime remains independently loadable.
- The internal visual floor is 7/10 for each criterion, including target similarity; 8+ is the design
  target. Open Critical/Major defects still block. Old reviews are not silently rescored.
- Yandex debug checker v2.25 bounds event inspection to actual handlers. Twenty-seven contract
  scenarios run against both overlay and standalone HTML, alongside the 96-check clean fixture.
- Engine self-audit resolves its own root even when invoked from a game or workspace parent.
- Current wiki/plans now distinguish the completed Windows pilot, historical v1.1.2 target matrix,
  existing signed Android v1.1.3 base and still-missing current-source/store/device evidence.

## Migration and limits

Existing web games need a declared `forge.web.playtest.json` and read-only runtime observations before
new Phase 3/5/7 acceptance. Use the canonical phase instructions and fixture as the contract reference.
Sync updates engine surfaces, not game content or accepted review scores.

The audit did not run paid AI batches, launch Godot, rebuild every game or publish to storefronts.
GDD-wide feature traceability, complete native player routes and full normal/QA visual parity remain
explicit follow-ups. See [the audit report](docs/FORGE-QUALITY-AUDIT-2026-09-05.md).
