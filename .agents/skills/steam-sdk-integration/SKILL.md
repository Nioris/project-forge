---
name: steam-sdk-integration
kind: tactical
description: "Deep integration steamworks.js API в HTML5+Electron игру: achievements (activate/clear/check), stats (getInt/setInt/store), cloud saves (writeFile/readFile), leaderboards…"
---

# $steam-sdk-integration — Deep Steamworks API integration

Используется когда `$release-steam` базовый flow уже работает и нужно добавить отдельные SDK features (achievements, leaderboards, workshop, multiplayer).

## Achievements

### Setup в Steamworks Partner panel

1. Open your App → "Stats & Achievements"
2. **Add Achievement** для каждого:
   - **API Name** (e.g. `ACH_FIRST_KILL`) — used в коде, lowercase + underscore
   - **Display Name** (e.g. "First Blood") — shown to players
   - **Description** — flavor text
   - **Hidden** — true для секретных
   - **Icon** — 256×256 PNG locked + 256×256 PNG unlocked
3. **Publish** changes

### Code (renderer)

```javascript
// Activate (уведомление "Achievement unlocked" появится автоматически)
const ok = await window.SteamSDK.achievement.activate('ACH_FIRST_KILL');
if (ok) console.log('First Kill unlocked');

// Check current state
const isUnlocked = await window.SteamSDK.achievement.isActivated('ACH_FIRST_KILL');

// Clear (для testing)
await window.SteamSDK.achievement.clear('ACH_FIRST_KILL');
```

### Common pitfalls

1. **API Name mismatch** — `ACH_FIRST_KILL` vs `ach_first_kill` — case sensitive. Используй ровно тот string что в Partner panel.
2. **Achievement не activate'ится в dev** — App должен быть "released" хотя бы на private branch, иначе achievement system неактивна. Workaround: invite себя в App ownership через Steamworks Communities → Friend Beta.
3. **Activate из renderer без preload bridge** — невозможно из-за contextIsolation. Используй `window.SteamSDK` (см. preload.js).

## Stats (для achievement progress)

Steam позволяет хранить per-user stats (integers, floats), на основе которых runs achievements.

### Partner panel

В Stats & Achievements добавь **Stat**:
- `total_enemies_killed` (int, max value 100000)
- `playtime_hours` (float, increment-only)

### Code

Stats доступны через extending preload — в `electron-main.js` добавь:

```javascript
ipcMain.handle('steam:stats.getInt', (_e, name) => {
  try { return client?.stats.getInt(name) ?? 0; } catch { return 0; }
});
ipcMain.handle('steam:stats.setInt', (_e, name, value) => {
  try { return client?.stats.setInt(name, value) ?? false; } catch { return false; }
});
ipcMain.handle('steam:stats.store', () => {
  try { return client?.stats.store() ?? false; } catch { return false; }
});
```

В preload.js:
```javascript
stats: {
  getInt: (name) => ipcRenderer.invoke('steam:stats.getInt', name),
  setInt: (name, value) => ipcRenderer.invoke('steam:stats.setInt', name, value),
  store: () => ipcRenderer.invoke('steam:stats.store'),
},
```

В renderer:
```javascript
// Increment kill counter
const kills = await window.SteamSDK.stats.getInt('total_enemies_killed');
await window.SteamSDK.stats.setInt('total_enemies_killed', kills + 1);
await window.SteamSDK.stats.store(); // commit к Steam servers — call раз в N seconds, не каждый увеличение
```

**Performance:** не вызывай `.store()` чаще 1-2 раза в секунду — Steam ограничивает rate. Batch updates → store через interval / on level end / on app quit.

## Cloud Saves

### Partner panel

App → Cloud → enable + set up:
- **Quota** (256 MB default, increase если nужно)
- **Auto-cloud paths** (рекомендовано) — указываешь pattern типа `%USERPROFILE%/AppData/Roaming/{ProductName}/saves/*`, Steam syncs автоматом
- ИЛИ **Manual cloud** через `SetCloudFileEnabled` API

### Code

`electron-main.js` уже имеет cloud handlers. Renderer:

```javascript
// Save
const saveData = { level: 5, score: 12000, inventory: [...] };
await window.SteamSDK.cloud.writeFile('save.json', JSON.stringify(saveData));

// Load
const raw = await window.SteamSDK.cloud.readFile('save.json');
if (raw) {
  const saveData = JSON.parse(raw);
  // restore game state
}

// Check before reading
if (await window.SteamSDK.cloud.fileExists('save.json')) {
  // ... load
}

// Delete
await window.SteamSDK.cloud.deleteFile('save.json');
```

### Conflict resolution

Steam Cloud sync delta'ит файл при изменении. Если игра запускается на 2 машинах одновременно, может возникнуть конфликт — Steam показывает dialog player'у. Лучшая стратегия:
- Save files small (<1 MB)
- Save reactionу не каждые milliseconds — batch (e.g. on level end + on quit)
- Used timestamps в save data — на load выбирай newer

## Leaderboards

### Partner panel

App → Leaderboards → Create:
- **Leaderboard ID** (e.g. `level1_speedrun`)
- **Sort Order**: ascending (faster=better) или descending (higher score=better)
- **Display Type**: Numeric / Time (seconds) / Time (milliseconds)

### Code (extending bridge)

`electron-main.js`:
```javascript
ipcMain.handle('steam:leaderboard.findOrCreate', async (_e, name) => {
  try {
    const lb = await client?.leaderboard.findOrCreate(name, 'descending', 'numeric');
    return lb ? { handle: lb.handle, name: lb.name } : null;
  } catch { return null; }
});

ipcMain.handle('steam:leaderboard.submit', async (_e, name, score) => {
  try {
    const lb = await client?.leaderboard.findOrCreate(name);
    return await client?.leaderboard.uploadScore(lb, score, 'keepBest');
  } catch { return false; }
});
```

В preload — `leaderboard.submit`. В renderer:
```javascript
const score = computeFinalScore();
await window.SteamSDK.leaderboard.submit('level1_speedrun', score);
```

### Display in-game

Самостоятельная задача — Steam не отдаёт UI-overlay для leaderboard. Тебе нужно нарисовать собственное UI и подтянуть данные через `client.leaderboard.downloadEntries()` (top N + around player).

## Workshop (UGC — User Generated Content)

Самая complex feature. Используй только если игра реально нужна mods/levels/skins от players.

### Setup

App → Steam Workshop → Configure:
- **Item types** — что игроки могут upload'ить (mods, levels, art)
- **Tag categories** — для filter в Workshop browser
- **Visibility** — by default public

### Code (skeleton)

steamworks.js Workshop API объёмный. Recommend reference:
- https://github.com/ceifa/steamworks.js → docs/workshop.md
- Steamworks docs: https://partner.steamgames.com/doc/features/workshop

Базовый flow:
1. Player creates content в твоём in-game editor
2. `client.workshop.createItem()` — get publishedFileId
3. Set title/description/preview/tags
4. `client.workshop.submitItemUpdate(handle)` — upload
5. Other players: `client.workshop.subscribe(publishedFileId)` → `client.workshop.installInfo()`

Это **большая фича**. Если только начинаешь — начни без Workshop, добавь как post-launch update.

## Friends

```javascript
const friends = await client.friends.getList();
// [{ steamId, name, state: 'online'/'offline', ... }]

// Invite to game
client.friends.inviteUserToGame(steamId, '+connect 192.168.1.1:27015');
// Connect string передаётся через Steam → game lifecycle event
```

## Rich Presence

Показ "Playing chapter 3" / "In Lobby" в Steam friend list:

```javascript
client.friends.setRichPresence('status', 'In Battle - Level 5');
client.friends.setRichPresence('connect', '+connect lobby_id_42');
```

Конфигурируется через Partner panel → Localization → Community Tokens.

## Steam Input (controller support)

Steam Input нормализует контроллеры (Xbox/PS/Steam Controller/Switch Pro/etc) в abstract actions. Большая отдельная тема:
- Действия определяются в `.vdf` файле в Partner panel
- Игра binds actions ↔ keys/buttons
- Player может re-bind через Steam UI без правки кода

Reference: https://partner.steamgames.com/doc/features/steam_controller

## DLC / Inventory

Если хочешь IAP:
- **DLC** — отдельные packages в Steam, продаются как expansion packs
- **Inventory Service** — virtual items (skins, currency) с Steam Marketplace integration

Отдельная тема — см. https://partner.steamgames.com/doc/features/inventory.

## Что НЕ покрывает этот skill

- **VAC anti-cheat** — требует C++ integration на game server side
- **Steam Networking / lobbies** — для multiplayer возможно, но это огромная отдельная тема
- **Steam Datagram Relay** — anti-DDoS networking, для serious online games
- **Family Sharing rules** — handled by Steam, ничего ставить не нужно

## Related

- `$release-steam` — base pipeline
- `platforms/steam/README.md` — architecture overview
- steamworks.js: https://github.com/ceifa/steamworks.js
- Steamworks API: https://partner.steamgames.com/doc/api

## Non-Negotiable

- [ ] Achievement API names match exactly Partner panel (case-sensitive)
- [ ] `client.stats.store()` rate-limited (max 1-2/sec, not per-update)
- [ ] Cloud save files small (<1 MB ideal, never >10 MB)
- [ ] Workshop opt-in только если реально нужно UGC — большая complexity
- [ ] Never disable steamworks.runCallbacks() — critical для achievement/cloud responses
- [ ] Test через Steam (не через `electron .` direct) — features unlock только under Steam process
