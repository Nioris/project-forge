/**
 * @file ready-expand.mjs
 * @description TG-READY-EXPAND — после загрузки приложение обязано вызвать
 *              WebApp.ready() (иначе Telegram показывает спиннер навсегда) и
 *              рекомендуется WebApp.expand() для полноэкранного режима.
 *              Source: https://core.telegram.org/bots/webapps#initializing-mini-apps
 */

import { LEVELS, walkFiles, readTextSafe, findLineNo } from './_lib.mjs';

export const ID = 'ready-expand';
export const REQUIREMENTS = ['TG-READY-EXPAND'];

export function validate(gamePath) {
  const issues = [];
  const files = walkFiles(gamePath, ['.html', '.js', '.mjs']);

  let hasReady = false;
  let hasExpand = false;
  let readyFile = null, expandFile = null;

  for (const f of files) {
    const t = readTextSafe(f);
    if (!t) continue;
    // Match both Telegram.WebApp.ready() and TelegramSDK.ready() (our wrapper)
    if (/\b(Telegram\.WebApp|WebApp|TelegramSDK)\.ready\s*\(/.test(t)) {
      hasReady = true; readyFile = f;
    }
    if (/\b(Telegram\.WebApp|WebApp|TelegramSDK)\.expand\s*\(/.test(t)) {
      hasExpand = true; expandFile = f;
    }
  }

  if (!hasReady) {
    issues.push({
      id: 'TG-READY',
      level: LEVELS.BLOCKER,
      message: 'Telegram.WebApp.ready() not called. Without it, Telegram keeps showing a loading spinner.',
      citation: 'Informs the Mini App that the Mini App is ready to be displayed. Call as early as possible when the application is ready.',
      url: 'https://core.telegram.org/bots/webapps#initializing-mini-apps',
    });
  }

  if (!hasExpand) {
    issues.push({
      id: 'TG-EXPAND',
      level: LEVELS.WARNING,
      message: 'Telegram.WebApp.expand() not called. App will open in compact mode (≈60% screen). Call expand() after ready() for fullscreen.',
      url: 'https://core.telegram.org/bots/webapps#initializing-mini-apps',
    });
  }

  return issues;
}
