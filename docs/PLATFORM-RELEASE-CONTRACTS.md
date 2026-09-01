# Storefront release contracts

Verified: 2026-08-30. Storefront rules change independently of Forge; numeric limits and API-level
requirements must be rechecked from the linked primary source before each submission.

The engine is not the release target. Godot, HTML/JavaScript or a later engine adapter produces a
base Web, Android or desktop candidate. A storefront adapter then proves its own package, SDK/init,
delivery and external-console prerequisites. Engine choice and storefront choice are orthogonal:
a Godot Windows export is not automatically Steam/VK Play-ready, and a Web ZIP is not Android-ready.

## Authority and target selection

The installed `adapters/platform-profiles.json` is the authoritative registry. It defines the allowed
target IDs plus each target's `artifactFamily`, `artifactFormat`, compatible engines, delivery method,
required integrations, external prerequisites, official documentation and adapter status. Do not infer
targets from directory names, existing artifacts, engine choice or a historical Yandex-first default.

Every project entering Phase 8 must contain a valid, non-empty `forge.targets.json`:

```json
{
  "schemaVersion": 1,
  "kind": "forge.target-selection",
  "targets": ["yandex", "steam"]
}
```

Validate it before building with `node scripts/platform-profile.mjs check <project-root>`. Missing,
unknown, duplicate or empty targets fail closed. Changing this manifest changes release scope and
requires checking the whole selected target matrix again. All ten installed adapters can create and
verify a local target-family candidate. That `implemented` status means **local adapter
implemented**; it does not claim Forge can host, upload, submit or publish. Forge can create and
independently verify a local Android production signature from its external security vault, but
that signature alone is not evidence of a store account, upload or submission. Production
submission remains unavailable until an installed, target-specific external verifier/uploader adapter
validates the external evidence declared by the target profile.

## Canonical local workflow

For Godot, first create one immutable base version for every artifact family selected by the target
profiles, then let the coordinator package and verify the storefront matrix:

```powershell
node scripts/build-godot-web-android.mjs <slug> <vN.N.N> --root <project-root>
node scripts/build-godot-android-release.mjs <slug> <vN.N.N> --root <project-root>
node scripts/build-godot-release.mjs <slug> <vN.N.N> --root <project-root>
node scripts/build-all-platforms.mjs <project-root> --level local
```

At `local`, `build-all-platforms.mjs` reads only `forge.targets.json`, selects one latest coherent
Godot base set and invokes the canonical per-target packager when that version has no storefront
matrix yet. Adjacent engine manifests, one version, one source snapshot and the recorded artifact
hashes must agree. Android storefront inputs should come from the production manifest in
`godot/android-release/`; its APK/AAB certificate must match `forge.identity.json` and the external
vault. More than one eligible release slug is an error, not a guess. An existing matrix
is immutable: it is verified as-is and never silently repaired or overwritten. Build a newer version
after any source, target or candidate change.

`--level submit` is read-only. It never packages, signs, hosts, uploads or changes receipts. The
lower-level `package-platform-release-matrix.mjs` remains available for diagnostics and custom
orchestration, but is not required in the ordinary workflow.

For a real local Web test, extract a Web candidate and serve it through the loopback-only MIME-safe
server before browser automation:

```powershell
node scripts/serve-web-candidate.mjs <extracted-web-directory> --port 4173
```

Generated Web wrappers default to standalone preview outside the platform container and expose
diagnostics through `window.__forgePlatform`. `?forgePlatform=standalone` forces this mode;
`?forgePlatform=platform` forces the platform bootstrap for controlled runtime testing. A standalone
preview proves that the wrapper did not break the game, but does not prove the real platform SDK,
hosting, lifecycle or delivery.

## Two evidence levels

Every selected target needs its own candidate and a `forge.platform-release-receipt` binding target,
version, engine, current source snapshot, candidate hash/size, integrations, delivery, readiness and
blockers. All selected targets must share one latest release version.

```bash
node scripts/build-all-platforms.mjs <project-root> --level local --json
node scripts/build-all-platforms.mjs <project-root> --level submit --json
```

- `local` verifies the candidate, source snapshot and registry consistency for the entire selected
  matrix. For production Android bases it also verifies the physical signature and pinned
  certificate. It does not prove hosting, upload, account access, store IDs, signing enrollment,
  console state or moderation.
- `submit` is unavailable by design until the selected target has an installed target-specific
  external verifier/uploader adapter. Until then it returns
  `PLATFORM_RELEASE_TRUST_ADAPTER_UNAVAILABLE` and Phase 8 must stop. A generic HMAC signer,
  Forge-local receipt, `forge-data` entry, free-form `delivery.evidence`, URL or hand-edited
  `submit-ready` field has no authority. An installed external verifier must itself validate
  `submit-ready`/`published`, verified delivery, no blockers and passed registry-required
  integrations, plus target-appropriate proof: HTTPS deployment for hosted bundles, production
  signing certificate plus console/upload for Android, or uploader/store receipt for Windows.
  Android Debug certificates fail.

An otherwise valid local candidate may truthfully be `external-blocked`. Its receipt must retain a
specific blocker instead of inventing an upload/deployment/signing receipt. `published` requires an
immutable platform/console receipt; `submit-ready` never implies moderation approval. A generic
local trust store is deliberately not a substitute for a platform verifier.

| Target | Required target artifact | Deterministic Forge gate | External facts an installed target verifier must validate |
|---|---|---|---|
| Yandex Games | ZIP with `index.html` at archive root | HTML5 runtime; mandatory Yandex Games SDK; relative assets; archive/file rules | Yandex Games Console draft and target metadata |
| VK Mini Apps | deployed static Web app | Web bundle; `VKWebAppInit`; VK Bridge fallback; responsive/touch Forge QA | VK Mini App ID and verified hosting/deploy receipt |
| Telegram Mini Apps | HTTPS-hosted HTML5 app | Telegram Web App script before app scripts; `ready()`; safe-area/mobile QA; do not trust unvalidated `initData` | bot plus Main Mini App URL configured through BotFather and live HTTPS receipt |
| CrazyGames | HTML5 build | SDK init plus browser/mobile QA; Full Launch additionally requires gameplay lifecycle evidence | Developer Portal submission, gameplay lifecycle validation and CrazyGames QA |
| RuStore | signed APK or upload-key-signed AAB | Android package identity/version/signature and install smoke | RuStore Console app; signing enrollment for AAB; moderation metadata |
| Google Play | upload-key-signed AAB | Android package/version/signature; target API gate; device/install smoke | Play Console app and mandatory Play App Signing enrollment |
| Huawei AppGallery | signed APK or upload-key-signed AAB | Android package/version/signature and device/install smoke | AppGallery Connect app; App Signing is mandatory for AAB |
| TapTap mobile | signed APK | `.apk` only; stable package name; increasing `versionCode`; private signing certificate | approved developer account/game, App ID and review; Client ID/Server Secret only for automated upload |
| Steam | Windows distribution prepared as a SteamPipe depot | exact executable/data set; launch/save smoke; depot config contains no credentials | Steamworks partner app, App ID/depot IDs and SteamPipe upload/build receipt |
| VK Play | Windows distribution | exact executable/data set; file/path constraints; launch/save smoke | VK Play project, uploader token and test-line GameCenter validation |

The table describes target contracts, not a universal package recipe. The Yandex production/debug/
marketing ZIP trio is a Yandex-specific workflow; it must not be substituted for Android packages,
hosted URLs, SteamPipe depots, VK Play distributions or any other target candidate.

## Current verified details

### Yandex Games

- The Console accepts a ZIP whose `index.html` is at the archive root; the documented uncompressed
  limit is 100 MB and names may not contain spaces or Cyrillic.
- SDK integration is required for moderation/publication.
- Sources: [draft/upload requirements](https://yandex.com/dev/games/doc/en/console/add-new-game/draft),
  [SDK](https://yandex.com/dev/games/doc/en/sdk).

### VK Mini Apps

- The deliverable is a static Web application, not merely a local ZIP. Official VK tooling supports
  static hosting and deploy configuration with `app_id`.
- Forge treats VK Bridge initialization as required for a VK-integrated target. Mobile/touch is a Forge
  quality gate because the app runs in VK mobile clients; it is not quoted as a universal VK rule.
- Sources: [official starter/deploy tool](https://github.com/VKCOM/create-vk-mini-app),
  [VK Bridge](https://github.com/VKCOM/vk-bridge).

### Telegram Mini Apps

- `WebAppInfo.url` is an HTTPS URL. A ZIP alone cannot be submit-ready.
- The Telegram Web App script belongs in `<head>` before application scripts. Forge requires `ready()`
  and safe-area/mobile checks; trusted identity requires server-side validation of `initData`.
- Sources: [Mini Apps](https://core.telegram.org/bots/webapps),
  [Bot API WebAppInfo](https://core.telegram.org/bots/api#webappinfo).

### CrazyGames

- Basic implementation allows at most 250 MB and 1,500 files. The documented initial playable download
  threshold is 50 MB (20 MB for mobile homepage eligibility).
- SDK is optional for Basic Launch and required for Full Launch. When mobile is supported, mouse,
  keyboard and touch must all work.
- Sources: [technical requirements](https://docs.crazygames.com/requirements/technical/),
  [SDK](https://docs.crazygames.com/sdk/intro/), [FAQ](https://docs.crazygames.com/faq/).

### Android stores

- RuStore accepts signed APK or AAB. AAB uses an upload key and separate signing enrollment; the
  documented maximum is 5 GB. Source: [RuStore publication](https://www.rustore.ru/help/developers/publishing-and-verifying-apps/app-publication).
- New Google Play apps use AAB and Play App Signing. From 2026-08-31, new apps and updates must target
  Android 16 / API 36. Sources: [bundle upload/signing](https://developer.android.com/studio/publish/upload-bundle),
  [target API schedule](https://developer.android.com/google/play/requirements/target-sdk).
- AppGallery accepts APK/AAB; App Signing is required for AAB. Source:
  [AppGallery App Signing](https://developer.huawei.com/consumer/en/doc/appgallery-connect-guides/agc-appsigning-introduction-0000001051379577).
- TapTap mobile documents APK-only upload. Source:
  [create/release game](https://developer.taptap.io/docs/store/store-creategame/),
  [APK upload API](https://developer.taptap.cn/docs/en/sdk/apk-upload/guide/).

### Desktop stores

- Steam uses SteamPipe build/depot configuration and SteamCMD/SDK tools. Source:
  [Uploading to Steam](https://partner.steamgames.com/doc/sdk/uploading).
- VK Play client builds are uploaded with GameCenterUploader or `bstool`, first to a test line; the
  documented build should stay below 1,000 files and use ASCII-path-safe names. Source:
  [build assembly and testing](https://documentation.vkplay.ru/f2p_vkp/f2pc_distrib_vkp).

## Readiness semantics

- `local-verified`: the target-family candidate exists and deterministic checks pass.
- `external-blocked`: the local candidate passes, but a credential, account, app/bot ID, signature
  enrollment, deployed URL or uploader receipt is absent.
- `submit-ready`: all deterministic checks and required external delivery facts pass through an
  installed target-specific external verifier.
- `published`: only an immutable platform/console receipt accepted by that target verifier may assert
  this state.

Moderation approval is never inferred from `submit-ready`.
