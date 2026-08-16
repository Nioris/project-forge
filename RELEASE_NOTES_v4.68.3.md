# Project Forge v4.68.3 — Release Consistency

## What changed

- Completed the bilingual Dashboard publication started after v4.68.2 and accepted its intentional structure in the Dashboard baseline.
- Restored one-version consistency across plugin metadata, Claude/Codex instructions, setup banners, Dashboard metadata, GUIDE and the project map.
- Hardened `scripts/bump-version.mjs` so it can repair stale display versions and update both public README formats without rewriting historical changelog entries.
- Added explicit canonical platform IDs to the English and Russian README files so public documentation and the platform-completeness gate stay aligned.

## Compatibility

This is a release-process and public-documentation patch. It does not change the canonical 9-phase runtime, managed sibling payload semantics, skills, agents or platform integrations from v4.68.1.
