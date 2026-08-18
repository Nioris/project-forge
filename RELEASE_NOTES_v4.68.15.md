# Project Forge v4.68.15 — Windows Yandex Release Pipeline

This release makes the canonical three-archive Yandex workflow work from a local Windows installation and from an external game project root.

- `build-yandex-3zips.mjs` accepts `--root`, uses native filesystem operations, creates ZIPs through `tar.exe` on Windows, and builds the documented production/debug/marketing variants.
- The marketing archive now consistently includes `debugcheck.js`, `cheats-base.js` and `screenshots.js`; production remains clean and debug includes its QA helpers.
- `runtime-test.mjs --variant=debug` extracts the selected archive before Yandex delegation, forwards the extracted game directory and removes temporary files.
- `check-external-cdn.mjs` can inspect ZIP archives on Windows without Unix `/tmp`, `unzip` or `rm` dependencies.
- Yandex validators resolve canonical `WorkProgress/<game>-yandex` staging to `Release/<game>/yandex`, so the pre-submit gate can validate the real store listings.

Verified end to end with a real 13-language Yandex game package: all three ZIPs built, production CDN scan passed, debug runtime probes passed, and pre-submit reported zero blockers and zero warnings.
