/**
 * @file binary-deps.mjs
 * @description STEAM-NATIVE-BINARY — Steamworks API native binaries must be present
 *              in the build. The platform-specific files come from the Steamworks SDK
 *              `redistributable_bin/` folder.
 *
 *              Required:
 *                Windows x64: steam_api64.dll
 *                Linux:       libsteam_api.so
 *                macOS:       libsteam_api.dylib
 *
 *              Without these, even a well-configured steamworks.init() throws
 *              "could not load native steam_api binary".
 *
 *              Source: https://partner.steamgames.com/doc/sdk
 */

import fs from 'node:fs';
import path from 'node:path';
import { LEVELS } from './_lib.mjs';

export const ID = 'binary-deps';
export const REQUIREMENTS = ['STEAM-NATIVE-BINARY'];

const REQUIRED_BINARIES = {
  win64: 'steam_api64.dll',
  win32: 'steam_api.dll',
  linux: 'libsteam_api.so',
  macos: 'libsteam_api.dylib',
};

// Common locations where Electron + steamworks.js expects them
const SEARCH_DIRS = [
  '.',
  'lib',
  'native',
  'src/lib',
  'resources/app/lib',
  'resources/app',
  'app/lib',
  'node_modules/steamworks.js/dist/win64',
  'node_modules/steamworks.js/dist/linux64',
  'node_modules/steamworks.js/dist/osx',
];

function findBinary(gamePath, name) {
  for (const dir of SEARCH_DIRS) {
    const full = path.join(gamePath, dir, name);
    if (fs.existsSync(full)) return full;
  }
  // Also search recursively, max depth 4, but be quick
  return findRecursive(gamePath, name, 4);
}

function findRecursive(dir, name, maxDepth, depth = 0) {
  if (depth > maxDepth) return null;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  for (const e of entries) {
    if (e.name === 'node_modules' && depth > 1) continue; // only shallow npm scan
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      const found = findRecursive(p, name, maxDepth, depth + 1);
      if (found) return found;
    } else if (e.name === name) {
      return p;
    }
  }
  return null;
}

export function validate(gamePath) {
  const issues = [];

  // Determine which binaries are needed based on package.json target / .build folder hints
  const found = {};
  for (const [platform, fname] of Object.entries(REQUIRED_BINARIES)) {
    found[platform] = findBinary(gamePath, fname);
  }

  // If using steamworks.js, the dist/ subfolders normally bundle them — count those as OK
  const sjsDist = path.join(gamePath, 'node_modules', 'steamworks.js', 'dist');
  const sjsHasDistBinaries = fs.existsSync(sjsDist);

  if (sjsHasDistBinaries) {
    // steamworks.js manages its own binaries, just verify the package is npm-installed
    // (we already checked dependency in electron-init.mjs)
    return issues;
  }

  // For greenworks or manual integration, you must place steam_api*.dll yourself
  if (!found.win64 && !found.win32 && !found.linux && !found.macos) {
    issues.push({
      id: 'STEAM-NO-NATIVE-BINARY',
      level: LEVELS.BLOCKER,
      message: 'No Steam native binary found anywhere (steam_api64.dll / libsteam_api.so / libsteam_api.dylib). Copy from Steamworks SDK redistributable_bin/ to lib/.',
      url: 'https://partner.steamgames.com/doc/sdk',
    });
    return issues;
  }

  // Heuristic: if the project has electron-builder config targeting Windows, require win64
  const pkgPath = path.join(gamePath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const buildCfg = pkg.build || {};
      const targetWindows = buildCfg.win || buildCfg.appId?.includes('windows');
      if (targetWindows && !found.win64 && !found.win32) {
        issues.push({
          id: 'STEAM-MISSING-WIN-BINARY',
          level: LEVELS.WARNING,
          message: 'electron-builder targets Windows but no steam_api64.dll found in lib/. Build will fail at runtime on Windows.',
        });
      }
      const targetLinux = buildCfg.linux;
      if (targetLinux && !found.linux) {
        issues.push({
          id: 'STEAM-MISSING-LINUX-BINARY',
          level: LEVELS.WARNING,
          message: 'electron-builder targets Linux but no libsteam_api.so found.',
        });
      }
      const targetMac = buildCfg.mac;
      if (targetMac && !found.macos) {
        issues.push({
          id: 'STEAM-MISSING-MAC-BINARY',
          level: LEVELS.WARNING,
          message: 'electron-builder targets macOS but no libsteam_api.dylib found.',
        });
      }
    } catch { /* ignore parse errors — handled in electron-init validator */ }
  }

  return issues;
}
