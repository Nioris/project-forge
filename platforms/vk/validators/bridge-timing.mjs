/**
 * @file bridge-timing.mjs
 * @description VK-BRIDGE-INIT — VKWebAppInit ОБЯЗАН быть вызван ПЕРВЫМ,
 *              до любых других VK Bridge методов. Иначе часть методов
 *              (особенно UI — OpenQR, ShowNativeAds, auth-токены) отваливаются
 *              с «VKWebAppInit failed» без понятного фидбека пользователю.
 *
 *              Source: https://dev.vk.com/ru/bridge/VKWebAppInit
 */

import { LEVELS, walkFiles, readTextSafe, findLineNo } from './_lib.mjs';
import { detectImportedNames } from '../../_shared/_lib/imports.mjs';

export const ID = 'bridge-timing';
export const REQUIREMENTS = ['VK-BRIDGE-INIT'];

export function validate(gamePath) {
  const issues = [];
  const files = walkFiles(gamePath);

  let initFile = null, initLine = null, initIdx = -1;
  const otherCallsBeforeInit = [];

  for (const f of files) {
    const t = readTextSafe(f);
    if (!t) continue;

    // Detect what variable name user used for vk-bridge import.
    // Default: `import bridge from '@vkontakte/vk-bridge'` → 'bridge'
    // Namespace: `import * as vkBridge from '@vkontakte/vk-bridge'` → 'vkBridge'
    // Named: `import { send } from '@vkontakte/vk-bridge'` → 'send' (direct fn reference)
    // Uses shared helper from _shared/_lib/imports.mjs (v4.9.0+).
    const importedNames = detectImportedNames(t, /@vkontakte\/vk-bridge|@vkontakte\/vk-connect/);

    // Build init regex: match any-imported-name.send('VKWebAppInit') OR direct call send('VKWebAppInit')
    // Default 'bridge' is the most common — keep that as-is + add aliased variants.
    const initPatterns = [
      /\bbridge\.send\s*\(\s*["']VKWebAppInit["']/,  // default name
      // Aliased names (from imports above)
      ...importedNames.map(n => new RegExp(`\\b${n}\\s*\\.\\s*send\\s*\\(\\s*["']VKWebAppInit["']`)),
      // Direct named import: `import { send } from '@vkontakte/vk-bridge'; send('VKWebAppInit', ...)`
      ...importedNames.filter(n => n === 'send').map(() => /\bsend\s*\(\s*["']VKWebAppInit["']/),
    ];

    let initMatch = -1;
    for (const re of initPatterns) {
      const idx = t.search(re);
      if (idx >= 0) { initMatch = idx; break; }
    }

    if (initMatch >= 0) {
      initFile = f;
      initLine = t.slice(0, initMatch).split('\n').length;
      initIdx = initMatch;
    }
  }

  if (!initFile) {
    issues.push({
      id: 'VK-BRIDGE-INIT',
      level: LEVELS.BLOCKER,
      message: 'VKWebAppInit not called anywhere. Without it, VK Bridge rejects subsequent calls.',
      citation: 'VKWebAppInit — обязательный первый метод, который нужно вызвать для корректной работы сервиса',
      url: 'https://dev.vk.com/ru/bridge/VKWebAppInit',
    });
    return issues;
  }

  // In the init file, check if any other bridge.send() call comes before VKWebAppInit
  const t = readTextSafe(initFile);
  if (!t) return issues;

  const sendRe = /\bbridge\.send\s*\(\s*["'](\w+)["']/g;
  let m;
  while ((m = sendRe.exec(t)) !== null) {
    if (m.index < initIdx && m[1] !== 'VKWebAppInit') {
      otherCallsBeforeInit.push({
        method: m[1],
        line: t.slice(0, m.index).split('\n').length,
      });
    }
  }

  if (otherCallsBeforeInit.length > 0) {
    issues.push({
      id: 'VK-BRIDGE-INIT-ORDER',
      level: LEVELS.BLOCKER,
      message: `VKWebAppInit is called at line ${initLine}, but these calls appear before it in the same file: ${otherCallsBeforeInit.slice(0, 3).map(c => c.method + ':' + c.line).join(', ')}${otherCallsBeforeInit.length > 3 ? ` (+${otherCallsBeforeInit.length - 3})` : ''}`,
      citation: 'VKWebAppInit должен быть первым вызовом моста, до любых других методов',
      url: 'https://dev.vk.com/ru/bridge/VKWebAppInit',
      file: initFile,
      line: initLine,
    });
  }

  // Also flag if @vkontakte/vk-connect is used instead of @vkontakte/vk-bridge (legacy)
  for (const f of files) {
    const tt = readTextSafe(f);
    if (!tt) continue;
    if (/@vkontakte\/vk-connect/.test(tt)) {
      issues.push({
        id: 'VK-BRIDGE-LEGACY-PKG',
        level: LEVELS.WARNING,
        message: 'Using @vkontakte/vk-connect — this is the legacy package. Switch to @vkontakte/vk-bridge.',
        url: 'https://dev.vk.com/ru/mini-apps/packages/vk-bridge',
        file: f,
        line: findLineNo(tt, '@vkontakte/vk-connect'),
      });
      break;
    }
  }

  return issues;
}
