---
name: release-steam
kind: tactical
description: "Полный пайплайн публикации HTML5 игры на Steam через Electron + steamworks.js. Phase 0 research + проверка Steamworks Partner account + Electron упаковка + steamworks integration + SteamPipe upload. Triggers on: relize Steam, в стим, выпустить на Steam, Steamworks, Greenworks, /release-steam, релиз стим, опубликовать стим."
---

# /release-steam — Полный пайплайн релиза на Steam

## Что эта команда делает (high-level)

HTML5 игра → обёрнута в Electron → интегрирована с steamworks.js → загружена через SteamPipe → опубликована на Steam.

Steam — единственная из 9 платформ Forge, которая требует **native wrapper** (Electron). Браузерный URL не работает — Steam клиент должен запустить .exe/.app/.AppImage.

## Phase 0: Research (MANDATORY)

Запусти `/research-references` для жанра + Steam:

```
/research-references {жанр} Steam release полировка steamworks integration
```

Что Claude должен найти:
- 3-5 успешных Steam игр в этом жанре (Steam page links)
- Их achievement count, наличие cloud saves, Workshop, leaderboards
- Стратегия Early Access vs прямой релиз
- Distribution: только Windows, или + Linux + Mac?
- Discount strategy в первые недели

Output → `wiki/research/{Project}-steam-references.md`. **Stop**, ждёт user approval.

## Phase 1: Pre-flight check

### 1.1 Steamworks Partner account готов?

Проверь наличие и спроси юзера если нет:
- ✅ Steamworks Partner account approved (1-3 weeks bureaucracy)
- ✅ Steam Direct fee paid ($100 USD за этот App)
- ✅ App ID создан в Partner panel
- ✅ Tax/banking info verified (для receiving payments)
- ✅ Steam client установлен и запущен

Если хоть что-то нет — **stop**, объясни что нужно сделать на partner.steamgames.com и не продолжай.

### 1.2 Local environment

```bash
node --version    # 20+
npm --version
```

Проверь что Steam клиент запущен (на dev машине). Без запущенного Steam, steamworks.init() сразу фейлит.

## Phase 2: Electron wrapper

### 2.1 Установка зависимостей

В корне игры:

```bash
npm init -y                     # если package.json нет
npm install --save-dev electron electron-builder
npm install steamworks.js       # production dep
```

### 2.2 Скопировать templates

Из `platforms/steam/templates/`:
- `electron-main.js` → `main.js` (или другое имя — обновить package.json `main`)
- `preload.js` → `preload.js`
- `steam_appid.txt.example` → `steam_appid.txt` — ВПИШИ свой реальный App ID

### 2.3 Конфиг package.json

```json
{
  "name": "your-game",
  "version": "1.0.0",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "build": "electron-builder",
    "build:win": "electron-builder --win",
    "build:linux": "electron-builder --linux",
    "build:mac": "electron-builder --mac"
  },
  "build": {
    "appId": "com.your-company.your-game",
    "productName": "Your Game",
    "directories": { "output": "dist" },
    "files": [
      "**/*",
      "!**/*.{md,log}",
      "!.git/**"
    ],
    "extraResources": [
      "steam_appid.txt"
    ],
    "win": { "target": "dir" },
    "linux": { "target": "dir", "category": "Game" },
    "mac": { "target": "dir", "category": "public.app-category.games" }
  }
}
```

**Important:** `target: "dir"` (не nsis/dmg/AppImage). Steam upload-ит **папки**, не installer'ы.

### 2.4 Использование SDK в game code

В renderer (твоя игра):

```javascript
// Check that SDK is available (might not be in dev mode)
if (window.SteamSDK) {
  const isInit = await window.SteamSDK.isInit();
  if (isInit) {
    const playerName = await window.SteamSDK.getName();
    document.getElementById('player-greeting').textContent = `Hello, ${playerName}!`;

    // On level complete:
    await window.SteamSDK.achievement.activate('FIRST_LEVEL_COMPLETE');

    // Cloud save:
    await window.SteamSDK.cloud.writeFile('save.json', JSON.stringify(saveData));

    // Read on game start:
    const saved = await window.SteamSDK.cloud.readFile('save.json');
    if (saved) gameState = JSON.parse(saved);
  }
}
```

## Phase 3: Pre-submit validation

```bash
node platforms/steam/scripts/pre-submit.mjs WorkProgress/{Project}/
```

Должно вывести `READY` (0 blockers, 0 fatals). Если есть blockers — **fix и повтори**.

5 validator'ов проверяют:
1. **appid-file** — `steam_appid.txt` валиден
2. **electron-init** — Electron + steamworks.js установлен и инициализирован
3. **binary-deps** — native binaries on disk (steam_api64.dll etc)
4. **cloud-paths** — Cloud reads/writes согласованы с SetCloudFileEnabled
5. **depots-config** — `app_build.vdf` + depot VDFs готовы

## Phase 4: Build

```bash
npm run build:win    # Windows (минимум для Steam)
npm run build:linux  # опционально, если планируешь Linux/SteamOS
npm run build:mac    # опционально
```

Output в `dist/win-unpacked/` (или равноценное). Эта папка — твой content для upload.

## Phase 5: SteamPipe Upload

### 5.1 Скачать ContentBuilder

Скачай Steamworks SDK (steamworks_sdk_*.zip) с partner.steamgames.com/downloads.
Распакуй. Найди `tools/ContentBuilder/`. Это директория content builder.

### 5.2 Конфиг VDF

Из `platforms/steam/templates/`:
- `app_build.vdf` → положить в `tools/ContentBuilder/scripts/app_build_<APPID>.vdf`
- `depot_build.vdf` → `tools/ContentBuilder/scripts/depot_build_<DEPOTID>.vdf`

Заменить placeholders:
- `<APPID>` — твой Steam App ID
- `<DEPOTID>` — depot ID (обычно `<APPID>+1`, зависит от настроек в Partner panel)
- `<CONTENT_ROOT>` — путь к `dist/win-unpacked/`

### 5.3 Upload через steamcmd

```bash
cd tools/ContentBuilder/builder
./steamcmd.exe +login <build_account> +run_app_build_http "../scripts/app_build_<APPID>.vdf" +quit
```

Где `<build_account>` — Steam account который имеет "Edit App Metadata" + "Publish App Changes" права на App ID. **Не** твой основной account — заведи отдельный build-only.

При первом запуске `steamcmd` запросит SteamGuard код (придёт на email). Введи. На последующих запусках кеширует логин.

### 5.4 Set live на бранч

В Partner panel → твой App → Builds. Найди свежезагруженный build. Нажми **Preview** для проверки. Если ок — **Set Live** на нужный бранч (`default` для public, или `beta` для testing).

## Phase 6: Store presence

Параллельно с phase 4-5, заполни Store page (через Partner panel):
- Description (short + long)
- 5+ скриншотов (минимум 1280x720)
- Trailer (recommended)
- Tags (10 максимум, выбирать осторожно — влияют на discoverability)
- System requirements
- Pricing per-region

Эту работу делает skill `/fill-steam` — запусти его параллельно.

## Phase 7: Post-release

После Set Live:
- Настрой Steam Cloud rules в Partner panel (auto-cloud для папок типа `%USERPROFILE%/AppData/Roaming/{ProductName}/`)
- Настрой achievement icons (locked/unlocked) — отдельная вкладка в Stats & Achievements
- Если есть leaderboards — определи через ISteamUserStats или Web API

## Skip conditions

- "skip research" / "без research" — пропустить Phase 0
- "build only" — phases 0-4 без upload (для локального теста)
- "upload only" — phases 5-6, если build уже сделан

## Что НЕ делает этот skill

- **Не платит Steam Direct fee** — это твоя ручная оплата на partner.steamgames.com
- **Не добавляет VAC anti-cheat** — VAC требует C++ integration, не steamworks.js
- **Не валидирует store text на Steam content rules** — read content guidelines самостоятельно
- **Не управляет sale schedule** — Steam Sales bookings делаются вручную через Partner panel

## Related

- `/fill-steam` — заполнение Store page
- `/steam-sdk-integration` — глубокая интеграция SDK (achievements, leaderboards, workshop)
- `/release-ready steam` — pre-release readiness check (запускай ДО /release-steam)
- `platforms/steam/README.md` — техническая документация
- Steamworks docs: https://partner.steamgames.com/doc/sdk
- steamworks.js: https://github.com/ceifa/steamworks.js

## Non-Negotiable

- [ ] Phase 0 research должен пройти (или явный skip от user)
- [ ] Steam client должен быть запущен на dev машине во время phases 2-4
- [ ] `steam_appid.txt` MUST содержать правильный App ID, не 480 (default test app)
- [ ] `steamworks.restartAppIfNecessary` обязательно вызывается ДО `init`
- [ ] Pre-submit MUST показать 0 blockers перед SteamPipe upload
- [ ] Build account отдельный от main developer account (security)
- [ ] При первой публикации — Preview build перед Set Live (sanity check)
