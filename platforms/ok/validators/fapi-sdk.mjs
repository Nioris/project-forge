/**
 * @file fapi-sdk.mjs
 * @description OK-FAPI-LOADED + OK-FAPI-INIT — combined.
 *              OK Mini App требует fapi5.js в HTML и вызов FAPI.init на старте.
 *              Source: https://apiok.ru/dev/app/site
 */

import path from 'node:path';
import { LEVELS, readTextSafe, walkFiles } from './_lib.mjs';

export const ID = 'fapi-sdk';
export const REQUIREMENTS = ['OK-FAPI-LOADED', 'OK-FAPI-INIT', 'OK-READY'];

export function validate(gamePath) {
  const issues = [];
  const htmlPath = path.join(gamePath, 'index.html');
  const html = readTextSafe(htmlPath);

  if (!html) {
    issues.push({
      id: 'OK-FAPI-LOADED', level: LEVELS.BLOCKER,
      message: 'index.html not found', file: htmlPath,
    });
    return issues;
  }

  const hasFapi = /<script[^>]+src=["'][^"']*api\.ok\.ru\/js\/fapi5?\.js["']/i.test(html);
  if (!hasFapi) {
    issues.push({
      id: 'OK-FAPI-LOADED', level: LEVELS.BLOCKER,
      message: 'FAPI SDK not loaded. Add <script src="//api.ok.ru/js/fapi5.js"></script>',
      url: 'https://apiok.ru/dev/app/site',
      file: htmlPath,
    });
  }

  const files = walkFiles(gamePath);
  let hasInit = false, hasReady = false;
  for (const f of files) {
    const t = readTextSafe(f);
    if (!t) continue;
    if (/\b(FAPI|OkSDK)\.init\s*\(/.test(t)) hasInit = true;
    if (/\bFAPI\.UI\.loaded\s*\(|\bOkSDK\.ready\s*\(/.test(t)) hasReady = true;
  }
  if (!hasInit) {
    issues.push({
      id: 'OK-FAPI-INIT', level: LEVELS.BLOCKER,
      message: 'FAPI.init() not called. OkSDK.init() from the wrapper also acceptable.',
      url: 'https://apiok.ru/dev/app/site',
    });
  }
  if (!hasReady) {
    issues.push({
      id: 'OK-READY', level: LEVELS.WARNING,
      message: 'FAPI.UI.loaded() not called. OK keeps showing the loading spinner.',
      url: 'https://apiok.ru/dev/methods/common/FAPI.UI.loaded',
    });
  }

  return issues;
}
