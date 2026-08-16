/**
 * @file electron-main.js
 * @description Project Forge — Steam + Electron main process template.
 *              Initializes steamworks.js BEFORE app.whenReady, sets up the
 *              renderer with a preload bridge, and uses restartAppIfNecessary
 *              so users running the .exe directly get bounced through Steam.
 *
 *              Replace APP_ID with your real Steam App ID.
 *              Make sure steam_appid.txt also contains the same number.
 *
 * @verified-against electron 30+, steamworks.js 0.4+
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// ────────────────────────────────────────────────────────────────
// Steam App ID — REPLACE 480 (default test app SpaceWar) with yours
// 480 = SpaceWar = Valve's free public test app, anyone can use it for dev,
// but you MUST replace it before release or Steam Cloud / achievements
// won't bind to your real game.
// ────────────────────────────────────────────────────────────────
const APP_ID = 480;

// ────────────────────────────────────────────────────────────────
// 1. RestartAppIfNecessary BEFORE init.
// If user double-clicked the .exe instead of launching from Steam,
// this restarts under Steam and exits the orphan process.
// ────────────────────────────────────────────────────────────────
const steamworks = require('steamworks.js');

if (steamworks.restartAppIfNecessary(APP_ID)) {
  console.log('[steam] restarting via Steam client...');
  app.quit();
  process.exit(0);
}

// ────────────────────────────────────────────────────────────────
// 2. Init Steam SDK
// ────────────────────────────────────────────────────────────────
let client;
try {
  client = steamworks.init(APP_ID);
  console.log('[steam] initialized for', client.localplayer.getName(),
              '(steamId=', client.localplayer.getSteamId().steamId64.toString(), ')');
} catch (e) {
  console.error('[steam] init failed:', e.message);
  console.error('[steam] make sure Steam client is running, steam_appid.txt exists,');
  console.error('[steam] and your account owns App ID', APP_ID);
  // We DO NOT app.quit() here — let the game run in dev mode without Steam features.
}

// ────────────────────────────────────────────────────────────────
// 3. Renderer / window
// ────────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    fullscreenable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile('index.html');

  // Steam Overlay relies on the window being repainted regularly. For UI-driven
  // games (no canvas refreshing every frame), force a paint:
  // win.webContents.on('paint', () => {});
  // Or use a 1px hidden canvas in HTML that requestAnimationFrame's continuously.
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  // Run pending Steam callbacks ONE MORE TIME before exiting,
  // so achievement/cloud writes flush to Steam.
  try { client?.runCallbacks(); } catch {}
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  try { client?.runCallbacks(); } catch {}
});

// ────────────────────────────────────────────────────────────────
// 4. IPC bridge for renderer → Steam SDK
// Renderer code (your game) cannot call steamworks.js directly because of
// contextIsolation. Use ipcRenderer.invoke('steam:method', ...args)
// from preload.js, and handle here.
// ────────────────────────────────────────────────────────────────
ipcMain.handle('steam:isInit', () => Boolean(client));
ipcMain.handle('steam:getName', () => client?.localplayer.getName() ?? '');
ipcMain.handle('steam:getSteamId', () => client?.localplayer.getSteamId().steamId64.toString() ?? '');

ipcMain.handle('steam:achievement.activate', (_e, name) => {
  try { return client?.achievement.activate(name) ?? false; } catch (e) {
    console.error('[steam] activate failed:', e.message);
    return false;
  }
});
ipcMain.handle('steam:achievement.isActivated', (_e, name) => {
  try { return client?.achievement.isActivated(name) ?? false; } catch { return false; }
});
ipcMain.handle('steam:achievement.clear', (_e, name) => {
  try { return client?.achievement.clear(name) ?? false; } catch { return false; }
});

ipcMain.handle('steam:cloud.writeFile', (_e, name, content) => {
  try { return client?.cloud.writeFile(name, content) ?? false; } catch (e) {
    console.error('[steam] cloud write failed:', e.message);
    return false;
  }
});
ipcMain.handle('steam:cloud.readFile', (_e, name) => {
  try { return client?.cloud.readFile(name) ?? null; } catch { return null; }
});
ipcMain.handle('steam:cloud.fileExists', (_e, name) => {
  try { return client?.cloud.fileExists(name) ?? false; } catch { return false; }
});
ipcMain.handle('steam:cloud.deleteFile', (_e, name) => {
  try { return client?.cloud.deleteFile(name) ?? false; } catch { return false; }
});

ipcMain.handle('steam:overlay.activateToWebPage', (_e, url) => {
  try { client?.overlay.activateToWebPage(url); return true; } catch { return false; }
});

// Run Steam callbacks every frame-ish so achievements/etc fire promptly
setInterval(() => {
  try { client?.runCallbacks(); } catch {}
}, 16);
