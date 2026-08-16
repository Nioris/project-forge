/**
 * @file cloud-paths.mjs
 * @description STEAM-CLOUD-CONFIG — if the game uses Steam Cloud (recommended),
 *              the App must be configured for Cloud in Steamworks Partner panel
 *              AND the code should call SetCloudFileEnabledByName for each file
 *              (or use the simpler "auto-cloud" path patterns set in Partner panel).
 *
 *              This validator only catches the code-side: looking for cloud
 *              read/write calls without proper enable. Partner panel config is
 *              outside our purview.
 *
 *              Source: https://partner.steamgames.com/doc/features/cloud
 */

import { LEVELS, walkFiles, readTextSafe } from './_lib.mjs';

export const ID = 'cloud-paths';
export const REQUIREMENTS = ['STEAM-CLOUD-CONFIG'];

export function validate(gamePath) {
  const issues = [];
  const files = walkFiles(gamePath);

  let usesCloud = false;
  let hasEnable = false;
  let cloudUseFiles = [];

  for (const f of files) {
    const t = readTextSafe(f);
    if (!t) continue;

    if (/client\.cloud\.(writeFile|readFile|deleteFile|fileExists)/.test(t)
        || /cloud\.SetCloudFileEnabledByName/.test(t)
        || /\bsteamCloud\.\w+/.test(t)) {
      usesCloud = true;
      cloudUseFiles.push(f);
    }
    if (/SetCloudFileEnabledByName|cloud\.enableFile/.test(t)) {
      hasEnable = true;
    }
  }

  if (usesCloud && !hasEnable) {
    issues.push({
      id: 'STEAM-CLOUD-NOT-ENABLED',
      level: LEVELS.WARNING,
      message: 'Cloud reads/writes are present, but no SetCloudFileEnabledByName call found. Either rely on auto-cloud (set file patterns in Partner panel under "Cloud") or explicitly enable each file. Otherwise saves don\'t sync.',
      url: 'https://partner.steamgames.com/doc/features/cloud',
      file: cloudUseFiles[0],
    });
  }

  return issues;
}
