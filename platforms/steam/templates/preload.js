/**
 * @file preload.js
 * @description Project Forge — Steam preload script.
 *              Exposes a safe `window.SteamSDK` to the renderer (your game),
 *              so game code can call achievements / cloud / overlay without
 *              direct access to Node.js APIs (contextIsolation: true).
 *
 *              Use in your game's HTML/JS:
 *                if (await window.SteamSDK.isInit()) { ... }
 *                await window.SteamSDK.achievement.activate('FIRST_KILL');
 *                await window.SteamSDK.cloud.writeFile('save.json', JSON.stringify(saveData));
 *
 * @verified-against electron 30+, steamworks.js 0.4+
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('SteamSDK', {
  isInit: () => ipcRenderer.invoke('steam:isInit'),
  getName: () => ipcRenderer.invoke('steam:getName'),
  getSteamId: () => ipcRenderer.invoke('steam:getSteamId'),

  achievement: {
    activate: (name) => ipcRenderer.invoke('steam:achievement.activate', name),
    isActivated: (name) => ipcRenderer.invoke('steam:achievement.isActivated', name),
    clear: (name) => ipcRenderer.invoke('steam:achievement.clear', name),
  },

  cloud: {
    writeFile: (name, content) => ipcRenderer.invoke('steam:cloud.writeFile', name, content),
    readFile: (name) => ipcRenderer.invoke('steam:cloud.readFile', name),
    fileExists: (name) => ipcRenderer.invoke('steam:cloud.fileExists', name),
    deleteFile: (name) => ipcRenderer.invoke('steam:cloud.deleteFile', name),
  },

  overlay: {
    activateToWebPage: (url) => ipcRenderer.invoke('steam:overlay.activateToWebPage', url),
  },
});
