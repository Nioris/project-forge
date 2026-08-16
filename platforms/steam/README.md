# Steam Platform Integration

Steam — крупнейшая PC-distribution платформа. Для HTML5 игр требуется обёртка через Electron + steamworks.js (modern, recommended) или Greenworks (legacy, не поддерживается с 2025).

## Architecture

HTML5 → Electron app → steamworks.js native module → Steamworks API → Steam client.

```
your-game.html  →  Electron main.js  →  steamworks.init(appId)
                   ↓
                   client.localplayer / achievement / cloud / workshop / leaderboard
                   ↓
                   Steam client (must be running)
```

## Что нужно ДО начала

1. **Steamworks Partner account** — https://partner.steamgames.com/
2. **Steam Direct fee** — $100 USD one-time per game (refundable после $1000 revenue)
3. **App ID** — выдаётся при создании App в Partner panel
4. **Подтверждённая личность** — tax/banking forms должны быть approved (это часто 1-3 недели)
5. **Steam client** должен быть запущен на dev машине для тестов
6. `steam_appid.txt` файл с App ID рядом с executable для локальных тестов

## Что Forge даёт

### Validators (5 шт, в `validators/`)
- `electron-init.mjs` — проверяет что main.js инициализирует steamworks с правильным App ID
- `appid-file.mjs` — `steam_appid.txt` присутствует и не пустой
- `restart-check.mjs` — `SteamAPI_RestartAppIfNecessary` вызван (иначе игра запускается вне Steam)
- `binary-deps.mjs` — `steam_api64.dll` / `libsteam_api.so` / `libsteam_api.dylib` в lib/
- `cloud-paths.mjs` — Steam Cloud paths для save files настроены через `SetCloudFileEnabled`

### Pre-submit script
`scripts/pre-submit.mjs WorkProgress/{Project}/` — прогоняет все 5 validators, exit code 0/1/2.

### Templates
- `templates/electron-main.js` — Electron main process с steamworks integration
- `templates/preload.js` — IPC bridge для achievement/cloud calls из renderer
- `templates/steam_appid.txt.example` — placeholder для App ID

### Skills (см. `.claude/skills/release-steam/`)
Полный pipeline: build Electron → integrate steamworks.js → upload через SteamPipe → release on Steam.

## Steamworks API features через steamworks.js

| Feature | API |
|---|---|
| **Achievements** | `client.achievement.activate(name)` / `isActivated` |
| **Stats** | `client.stats.getInt(name)` / `setInt` / `store` |
| **Cloud Saves** | `client.cloud.writeFile(name, content)` / `readFile` |
| **Leaderboards** | `client.leaderboard.find(name)` / `submitScore` |
| **Workshop (UGC)** | `client.workshop.createItem` / `subscribe` / `download` |
| **Friends** | `client.friends.getList()` / `inviteToGame` |
| **Localplayer** | `client.localplayer.getName()` / `getSteamId()` |
| **Overlay** | `client.overlay.activateToWebPage(url)` |

## Upload через SteamPipe

```bash
# Из Steamworks SDK
./tools/ContentBuilder/builder/steamcmd.exe \
  +login <build_account> +run_app_build app_build.vdf +quit
```

`app_build.vdf` указывает depot mapping и content folder. `release-steam` skill авто-генерирует этот файл.

## Steam Direct Fee

$100 USD за каждое приложение. Возвращается на developer account когда game набирает $1000 USD revenue. Для нескольких игр — каждая отдельно.

## Что НЕ делает Forge

- **Native C++ binding** — мы используем steamworks.js (Rust-based, prebuilt binaries). Если тебе нужна low-level C++ API — это outside scope.
- **Anti-cheat** — VAC требует C++ integration, не steamworks.js.
- **Steam Workshop UGC editor** — basic API доступен, но editor UI — твоя ответственность.
- **Multiplayer / lobbies** — steamworks.js имеет API но это не плюс-один-копи-паст; reference-уровень only.

## References

- Steamworks SDK: https://partner.steamgames.com/doc/sdk
- steamworks.js: https://github.com/ceifa/steamworks.js
- Greenworks (legacy): https://github.com/greenheartgames/greenworks
- Electron: https://www.electronjs.org/
- Article on HTML5+Electron+Steam: https://liana.one/integrate-electron-steam-api-steamworks
