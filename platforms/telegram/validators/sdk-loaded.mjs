/**
 * @file sdk-loaded.mjs
 * @description TG-SDK-LOADED — игра должна подключать telegram-web-app.js
 *              в `<head>` для доступа к `window.Telegram.WebApp`.
 *              Source: https://core.telegram.org/bots/webapps#initializing-mini-apps
 */

import path from 'node:path';
import { LEVELS, readTextSafe, findLineNo } from './_lib.mjs';

export const ID = 'sdk-loaded';
export const REQUIREMENTS = ['TG-SDK-LOADED'];

export function validate(gamePath) {
  const issues = [];
  const htmlPath = path.join(gamePath, 'index.html');
  const html = readTextSafe(htmlPath);
  if (!html) {
    issues.push({
      id: 'TG-SDK-LOADED',
      level: LEVELS.BLOCKER,
      message: 'index.html not found',
      file: htmlPath,
    });
    return issues;
  }

  // Accept either direct CDN or local bundled file (some projects mirror it).
  const hasSdk =
    /<script[^>]+src=["'](https?:)?\/\/telegram\.org\/js\/telegram-web-app\.js["']/i.test(html) ||
    /<script[^>]+src=["'][^"']*telegram-web-app\.js["']/i.test(html);

  if (!hasSdk) {
    issues.push({
      id: 'TG-SDK-LOADED',
      level: LEVELS.BLOCKER,
      message: 'Telegram WebApp SDK not loaded. Add <script src="https://telegram.org/js/telegram-web-app.js"></script> to <head>.',
      citation: 'Initializing Mini Apps: to use Telegram WebApp features, include telegram-web-app.js',
      url: 'https://core.telegram.org/bots/webapps#initializing-mini-apps',
      file: htmlPath,
    });
    return issues;
  }

  // Must be in <head>, not <body>, otherwise `ready()` timing is off.
  const headCloseIdx = html.search(/<\/head>/i);
  const sdkIdx = html.search(/telegram-web-app\.js/i);
  if (sdkIdx > 0 && headCloseIdx > 0 && sdkIdx > headCloseIdx) {
    issues.push({
      id: 'TG-SDK-POSITION',
      level: LEVELS.WARNING,
      message: 'telegram-web-app.js loaded after </head>. Move into <head> for correct theme/viewport timing.',
      url: 'https://core.telegram.org/bots/webapps#initializing-mini-apps',
      file: htmlPath,
      line: findLineNo(html, 'telegram-web-app.js'),
    });
  }

  return issues;
}
