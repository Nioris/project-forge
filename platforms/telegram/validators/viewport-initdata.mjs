/**
 * @file viewport-initdata.mjs
 * @description Combined validator:
 *   - TG-VIEWPORT — нужен <meta name="viewport"> для корректного рендера в Telegram
 *   - TG-INITDATA-SERVER — если в коде используется initData, напомнить про
 *     обязательную серверную HMAC-верификацию (иначе auth подделывается).
 *
 *   Source: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */

import path from 'node:path';
import { LEVELS, readTextSafe, walkFiles, findLineNo } from './_lib.mjs';

export const ID = 'viewport-initdata';
export const REQUIREMENTS = ['TG-VIEWPORT', 'TG-INITDATA-SERVER'];

export function validate(gamePath) {
  const issues = [];

  // Viewport check
  const htmlPath = path.join(gamePath, 'index.html');
  const html = readTextSafe(htmlPath);
  if (html) {
    if (!/<meta[^>]+name=["']viewport["']/i.test(html)) {
      issues.push({
        id: 'TG-VIEWPORT',
        level: LEVELS.WARNING,
        message: 'Missing <meta name="viewport"> — Telegram clients render oddly without it.',
        url: 'https://core.telegram.org/bots/webapps',
        file: htmlPath,
      });
    }
  }

  // initData use → server verify reminder
  const files = walkFiles(gamePath, ['.html', '.js', '.mjs']);
  let usesInitData = false;
  let initDataFile = null, initDataLine = null;
  for (const f of files) {
    const t = readTextSafe(f);
    if (!t) continue;
    const m = t.match(/\.initData\b/);
    if (m) {
      usesInitData = true;
      initDataFile = f;
      initDataLine = findLineNo(t, '.initData');
      break;
    }
  }
  if (usesInitData) {
    issues.push({
      id: 'TG-INITDATA-SERVER',
      level: LEVELS.WARNING,
      message: 'initData is read in client code. Treat initDataUnsafe as unverified. All critical auth/payment logic must HMAC-verify initData server-side.',
      citation: 'Data-check-string must be validated server-side using the bot token. Never trust initDataUnsafe for anything sensitive.',
      url: 'https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app',
      file: initDataFile,
      line: initDataLine,
    });
  }

  return issues;
}
