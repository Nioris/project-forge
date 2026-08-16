/**
 * @file depots-config.mjs
 * @description STEAM-DEPOTS-CONFIG — uploading to Steam requires VDF (Valve Data
 *              Format) build/depot scripts: app_build_<appid>.vdf and
 *              depot_build_<depotid>.vdf. This validator checks they exist
 *              and have the most common required fields.
 *
 *              Source: https://partner.steamgames.com/doc/sdk/uploading
 */

import fs from 'node:fs';
import path from 'node:path';
import { LEVELS, walkFiles, readTextSafe } from './_lib.mjs';

export const ID = 'depots-config';
export const REQUIREMENTS = ['STEAM-DEPOTS-CONFIG'];

export function validate(gamePath) {
  const issues = [];

  // Search for any *.vdf files in common locations
  const vdfLocations = [
    'steamworks',
    'tools/ContentBuilder/scripts',
    'scripts',
    'build/scripts',
    '.',
  ];

  let appBuildVdf = null;
  const depotVdfs = [];

  for (const loc of vdfLocations) {
    const dir = path.join(gamePath, loc);
    if (!fs.existsSync(dir)) continue;
    let files;
    try { files = fs.readdirSync(dir); } catch { continue; }
    for (const f of files) {
      if (f.endsWith('.vdf')) {
        const full = path.join(dir, f);
        if (/app_build/i.test(f)) appBuildVdf = full;
        else if (/depot_build/i.test(f)) depotVdfs.push(full);
      }
    }
  }

  if (!appBuildVdf) {
    issues.push({
      id: 'STEAM-NO-APP-BUILD-VDF',
      level: LEVELS.WARNING,
      message: 'No app_build_<appid>.vdf found. Required for SteamPipe upload via steamcmd. Forge can generate one — see /release-steam.',
      url: 'https://partner.steamgames.com/doc/sdk/uploading',
    });
    return issues;
  }

  const appText = readTextSafe(appBuildVdf);
  if (!appText) return issues;

  // Required keys: AppID, Desc, ContentRoot (or BuildOutput), Depots
  const requiredKeys = ['AppID', 'Depots'];
  for (const key of requiredKeys) {
    const re = new RegExp(`"${key}"`, 'i');
    if (!re.test(appText)) {
      issues.push({
        id: 'STEAM-VDF-MISSING-KEY',
        level: LEVELS.BLOCKER,
        message: `app_build VDF is missing required "${key}" key.`,
        file: appBuildVdf,
      });
    }
  }

  // Extract AppID and check it matches steam_appid.txt if present
  const appIdMatch = /"AppID"\s+"(\d+)"/i.exec(appText);
  if (appIdMatch) {
    const vdfAppId = appIdMatch[1];
    const appIdTxtPath = path.join(gamePath, 'steam_appid.txt');
    if (fs.existsSync(appIdTxtPath)) {
      const txtContent = fs.readFileSync(appIdTxtPath, 'utf8').trim();
      if (txtContent && txtContent !== vdfAppId) {
        issues.push({
          id: 'STEAM-VDF-APPID-MISMATCH',
          level: LEVELS.BLOCKER,
          message: `app_build VDF has AppID=${vdfAppId} but steam_appid.txt has ${txtContent}. They MUST match.`,
          file: appBuildVdf,
        });
      }
    }
  }

  return issues;
}
