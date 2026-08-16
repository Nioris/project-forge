/**
 * @file electron-init.mjs
 * @description STEAM-ELECTRON-INIT — Electron main process MUST initialize
 *              steamworks.js (or greenworks) before app.whenReady fires. Otherwise
 *              the renderer's first calls fail because the native binding isn't
 *              loaded yet.
 *
 *              Also checks the package.json has 'steamworks.js' (modern) OR
 *              'greenworks' (legacy) listed as a dependency.
 *
 *              Source: https://github.com/ceifa/steamworks.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { LEVELS, walkFiles, readTextSafe, findLineNo } from './_lib.mjs';
import { detectImportedNames, buildInitRegexes } from '../../_shared/_lib/imports.mjs';

export const ID = 'electron-init';
export const REQUIREMENTS = ['STEAM-ELECTRON-INIT', 'STEAM-NATIVE-DEP'];

export function validate(gamePath) {
  const issues = [];

  // 1. package.json sanity check
  const pkgPath = path.join(gamePath, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    issues.push({
      id: 'STEAM-NO-PACKAGE-JSON',
      level: LEVELS.BLOCKER,
      message: 'No package.json found. Steam-on-HTML5 requires Electron, which requires package.json.',
    });
    return issues;
  }
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); }
  catch (e) {
    issues.push({
      id: 'STEAM-PACKAGE-INVALID',
      level: LEVELS.BLOCKER,
      message: 'package.json is not valid JSON: ' + e.message,
      file: pkgPath,
    });
    return issues;
  }

  const allDeps = Object.assign({}, pkg.dependencies || {}, pkg.devDependencies || {});

  if (!allDeps.electron) {
    issues.push({
      id: 'STEAM-NO-ELECTRON',
      level: LEVELS.BLOCKER,
      message: 'electron not in dependencies. Steam HTML5 games must be packaged via Electron (or NW.js — but only Electron is supported by current Forge templates).',
    });
  }

  const usingModern = !!allDeps['steamworks.js'];
  const usingLegacy = !!allDeps['greenworks'];

  if (!usingModern && !usingLegacy) {
    issues.push({
      id: 'STEAM-NATIVE-DEP',
      level: LEVELS.BLOCKER,
      message: 'No Steam native binding found. Add `steamworks.js` (recommended, npm install steamworks.js) or `greenworks` (legacy, unmaintained since 2025).',
      url: 'https://github.com/ceifa/steamworks.js',
    });
  } else if (usingLegacy && !usingModern) {
    issues.push({
      id: 'STEAM-LEGACY-BINDING',
      level: LEVELS.WARNING,
      message: 'Using greenworks (last meaningful update 2019, broken on modern Node/Electron). Migrate to steamworks.js.',
      url: 'https://github.com/ceifa/steamworks.js',
    });
  }

  // 2. Look for steamworks.init() / electron-init pattern
  const electronMain = pkg.main || 'main.js';
  const mainPath = path.isAbsolute(electronMain) ? electronMain : path.join(gamePath, electronMain);

  if (!fs.existsSync(mainPath)) {
    issues.push({
      id: 'STEAM-NO-MAIN',
      level: LEVELS.BLOCKER,
      message: `Electron main file "${electronMain}" not found.`,
      file: pkgPath,
    });
    return issues;
  }

  const mainText = readTextSafe(mainPath);
  if (!mainText) return issues;

  // Detect what variable name the user used for require('steamworks.js') / require('greenworks').
  // If they wrote `const sw = require('steamworks.js')`, capture 'sw' so we can look for sw.init().
  // Uses shared helper from _shared/_lib/imports.mjs (v4.9.0+) — handles CommonJS, ESM default,
  // ESM namespace, ESM named imports.
  const importedNames = detectImportedNames(mainText, /steamworks\.js|greenworks/);

  // Build init regexes — both default-name patterns AND aliased patterns
  const initRegexes = [
    /steamworks\s*\.\s*init\s*\(/,
    /steamworksInit\s*\(/,
    /greenworks\s*\.\s*initAPI\s*\(/,
    // Aliased variables: e.g. `const sw = require('steamworks.js'); sw.init(...)`
    ...buildInitRegexes(importedNames, ['init', 'initAPI']),
  ];

  if (usingModern || usingLegacy) {
    const hasInit = initRegexes.some(re => re.test(mainText));
    if (!hasInit) {
      issues.push({
        id: 'STEAM-INIT-NOT-CALLED',
        level: LEVELS.BLOCKER,
        message: `Electron main file "${electronMain}" imports steamworks/greenworks but never calls .init(). Without explicit init, no Steam features work.`,
        url: 'https://github.com/ceifa/steamworks.js#getting-started',
        file: mainPath,
      });
    }
  }

  // 3. Ensure SteamAPI_RestartAppIfNecessary OR steamworks.restartAppIfNecessary is called.
  // Without this, users running the .exe directly skip Steam, so achievements/cloud/etc don't work.
  const restartRegexes = [
    /restartAppIfNecessary/i,
    /steamworks\.restartAppIfNecessary/,
    /SteamAPI_RestartAppIfNecessary/,
  ];

  if (!restartRegexes.some(re => re.test(mainText))) {
    issues.push({
      id: 'STEAM-NO-RESTART-CHECK',
      level: LEVELS.WARNING,
      message: 'No restartAppIfNecessary call found. Recommended: if user launches the .exe directly without Steam running, this restarts the app through Steam so SDK works.',
      url: 'https://partner.steamgames.com/doc/api/steam_api#SteamAPI_RestartAppIfNecessary',
      file: mainPath,
    });
  }

  return issues;
}
