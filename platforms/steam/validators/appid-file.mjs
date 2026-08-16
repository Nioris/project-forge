/**
 * @file appid-file.mjs
 * @description STEAM-APPID-FILE — `steam_appid.txt` MUST exist next to the
 *              executable for local development. Without it, Steam client
 *              can't determine which App to attach the running process to,
 *              so all steamworks.js calls fail silently with "API not init".
 *
 *              Source: https://partner.steamgames.com/doc/sdk/api
 */

import fs from 'node:fs';
import path from 'node:path';
import { LEVELS, fileExistsAny } from './_lib.mjs';

export const ID = 'appid-file';
export const REQUIREMENTS = ['STEAM-APPID-FILE'];

export function validate(gamePath) {
  const issues = [];

  // Check at root, in resources/ (Electron pack), and in app/
  const candidates = [
    'steam_appid.txt',
    'resources/app/steam_appid.txt',
    'app/steam_appid.txt',
  ];
  const found = fileExistsAny(gamePath, candidates);

  if (!found) {
    issues.push({
      id: 'STEAM-APPID-MISSING',
      level: LEVELS.BLOCKER,
      message: 'steam_appid.txt not found. Without it, steamworks.init() fails. Place a file containing only your App ID (digits only, no quotes) next to the executable.',
      url: 'https://partner.steamgames.com/doc/sdk/api',
    });
    return issues;
  }

  // Check content — must be a non-empty integer
  let content;
  try {
    content = fs.readFileSync(found, 'utf8').trim();
  } catch (e) {
    issues.push({
      id: 'STEAM-APPID-UNREADABLE',
      level: LEVELS.BLOCKER,
      message: `Found ${found} but could not read it: ${e.message}`,
      file: found,
    });
    return issues;
  }

  if (!content) {
    issues.push({
      id: 'STEAM-APPID-EMPTY',
      level: LEVELS.BLOCKER,
      message: 'steam_appid.txt is empty. It must contain only the App ID (digits, no quotes, no other text).',
      file: found,
    });
    return issues;
  }

  if (!/^\d+$/.test(content)) {
    issues.push({
      id: 'STEAM-APPID-FORMAT',
      level: LEVELS.BLOCKER,
      message: `steam_appid.txt content "${content.slice(0, 40)}" is not a plain integer. It must contain only the App ID (digits, no quotes, no whitespace, no comments).`,
      file: found,
    });
  } else if (content === '480') {
    issues.push({
      id: 'STEAM-APPID-DEFAULT',
      level: LEVELS.WARNING,
      message: 'steam_appid.txt contains 480 (default Steam test app SpaceWar). Replace with your own App ID before shipping.',
      file: found,
    });
  } else if (content.length < 5) {
    // Real Steam App IDs are at least 5 digits these days
    issues.push({
      id: 'STEAM-APPID-SUSPICIOUS',
      level: LEVELS.WARNING,
      message: `steam_appid.txt contains "${content}" — unusually short for a real Steam App ID. Verify this is correct.`,
      file: found,
    });
  }

  return issues;
}
