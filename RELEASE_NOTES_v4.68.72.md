# Project Forge v4.68.72

## Storefront-aware release matrix

Forge now treats the engine and the storefront as separate release axes. A Godot or Web engine creates
base Web, Android and Windows artifacts; an explicit target profile creates and verifies a distinct
candidate for each selected storefront.

This release adds:

- the authoritative `adapters/platform-profiles.json` registry and project-owned
  `forge.targets.json` contract;
- primary targets for Yandex Games, VK Mini Apps, Telegram Mini Apps, RuStore, Google Play,
  Huawei AppGallery, VK Play and Steam;
- evaluated targets for CrazyGames and TapTap;
- immutable, hash-bound `forge.platform-release-receipt` evidence with separate `local` and `submit`
  levels;
- real Godot Web plus debug-local Android APK/AAB export from an isolated source copy;
- automatic local matrix packaging from one latest coherent base version through
  `build-all-platforms.mjs`;
- safe standalone Web wrappers for Yandex, VK, Telegram and CrazyGames, with SDK runtime state kept
  blocked until it is verified inside the real platform container;
- a loopback-only Web candidate server with Godot-correct JavaScript/WASM/PCK MIME types and path
  escape protection;
- fail-closed checks for stale source, tampered base artifacts, mixed snapshots, ambiguous release
  slugs, unsafe ZIP paths/links and attempts to overwrite an immutable version;
- explicit per-target submit-verifier descriptors: local adapters are implemented, while production
  submit stays unavailable until a reviewed target-specific uploader/verifier is installed; generic
  HMAC, hand-edited receipts and URLs cannot authorize Phase 8 completion;
- Phase 8, dashboard, project bootstrap, GigaChat and completeness contracts updated to use explicit
  targets instead of treating one generic ZIP as universal evidence.

`--level local` may create a missing target matrix and then verifies every candidate. `--level submit`
is read-only and requires a registered external verifier for real production signing, platform
IDs/accounts, SDK runtime, hosting or uploader receipts. Forge does not call an external-blocked
local candidate published.

The Circuit Courier pilot produced a coherent `v1.1.2` Web/Android/Windows base and ten local target
candidates. The complete local matrix passed; browser wrappers were exercised through Playwright, and
submission remained truthfully blocked on external accounts, production signing and delivery.
