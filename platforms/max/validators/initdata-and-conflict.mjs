/**
 * @file initdata-and-conflict.mjs
 * @description Two checks combined:
 *   - MAX-TELEGRAM-CONFLICT — MAX uses `window.WebApp`, Telegram uses `window.Telegram.WebApp`.
 *     If both SDKs load in same bundle, `window.WebApp` references MAX but confused
 *     code might try Telegram-specific methods (.ready, .expand) that don't exist
 *     on MAX's WebApp. Warn and suggest MaxSDK wrapper for isolation.
 *   - MAX-INITDATA-SERVER — if game uses `WebApp.initData` for auth/payments,
 *     remind about mandatory server-side HMAC-SHA256 verification (different
 *     algorithm from Telegram!).
 *
 *   Source: https://dev.max.ru/docs/webapps/validation
 */

import path from 'node:path';
import { LEVELS, readTextSafe, walkFiles, findLineNo } from './_lib.mjs';

export const ID = 'initdata-and-conflict';
export const REQUIREMENTS = ['MAX-TELEGRAM-CONFLICT', 'MAX-INITDATA-SERVER'];

export function validate(gamePath) {
  const issues = [];
  const htmlPath = path.join(gamePath, 'index.html');
  const html = readTextSafe(htmlPath);

  // Detect Telegram SDK loaded alongside MAX
  if (html) {
    const hasTelegramSdk = /<script[^>]+src=["'][^"']*telegram-web-app\.js["']/i.test(html);
    const hasMaxSdk = /<script[^>]+src=["'][^"']*max-web-app\.js["']/i.test(html);
    if (hasTelegramSdk && hasMaxSdk) {
      issues.push({
        id: 'MAX-TELEGRAM-CONFLICT',
        level: LEVELS.BLOCKER,
        message: 'Both telegram-web-app.js and max-web-app.js are loaded. window.WebApp collides — this is a production-specific MAX build, remove telegram-web-app.js.',
        url: 'https://dev.max.ru/docs/webapps/bridge',
        file: htmlPath,
      });
    }
  }

  // Scan for initData usage
  const files = walkFiles(gamePath, ['.html', '.js', '.mjs']);
  let usesInitData = false;
  let initDataFile = null, initDataLine = null;
  let usesTelegramMethods = false;
  let tgMethodFile = null, tgMethodLine = null;

  for (const f of files) {
    const t = readTextSafe(f);
    if (!t) continue;

    // Look for .initData references that are NOT inside a string literal ending a key like "initData": "..."
    if (/\b(window\.)?WebApp\.initData\b/.test(t) || /\bMaxSDK\.getInitData\s*\(/.test(t)) {
      if (!usesInitData) {
        usesInitData = true;
        initDataFile = f;
        initDataLine = findLineNo(t, '.initData') || findLineNo(t, 'getInitData');
      }
    }

    // MAX's WebApp does NOT have .ready() or .expand() — catch code that calls these
    // on window.WebApp (without Telegram prefix), which will silently fail in MAX.
    const readyMatch = t.match(/(?<!Telegram\.)(?<!MaxSDK\.)(?<!OkSDK\.)window\.WebApp\.(ready|expand)\s*\(/);
    const bareMatch = t.match(/(?<!Telegram\.)(?<!\.)\bWebApp\.(ready|expand)\s*\(/);
    if (readyMatch || bareMatch) {
      const m = readyMatch || bareMatch;
      if (!usesTelegramMethods) {
        usesTelegramMethods = true;
        tgMethodFile = f;
        tgMethodLine = findLineNo(t, m[0]);
      }
    }
  }

  if (usesInitData) {
    issues.push({
      id: 'MAX-INITDATA-SERVER',
      level: LEVELS.WARNING,
      message: 'initData is read client-side. initDataUnsafe must NEVER be trusted for auth/payments — implement server-side HMAC-SHA256 verification using "WebAppData" + BOT_TOKEN scheme.',
      citation: 'Обратите внимание, что объект нельзя использовать для валидации данных',
      url: 'https://dev.max.ru/docs/webapps/validation',
      file: initDataFile,
      line: initDataLine,
    });
  }

  if (usesTelegramMethods) {
    issues.push({
      id: 'MAX-TELEGRAM-API-MISUSE',
      level: LEVELS.WARNING,
      message: 'Code calls WebApp.ready() or WebApp.expand() — these are Telegram-only APIs and are no-ops in MAX (data preloads automatically). Remove for MAX builds, or use MaxSDK wrapper which handles both platforms.',
      citation: 'MAX WebApp: Объект создаётся с каждым запуском сервиса, предзагружает данные и не требует отдельной инициализации',
      url: 'https://dev.max.ru/docs/webapps/bridge',
      file: tgMethodFile,
      line: tgMethodLine,
    });
  }

  return issues;
}
