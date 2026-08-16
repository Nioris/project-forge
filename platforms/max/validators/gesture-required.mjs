/**
 * @file gesture-required.mjs
 * @description MAX-GESTURE-REQUIRED — ряд методов MAX Bridge требуют
 *              пользовательского клика (gesture): openLink, downloadFile,
 *              shareMaxContent. Если эти методы вызываются в setTimeout/
 *              setInterval/таймерах — клиент заблокирует вызов молча.
 *              Аналог REQ-4.4 у Yandex (ad-without-gesture).
 *              Source: https://dev.max.ru/docs/webapps/bridge
 */

import { LEVELS, walkFiles, readTextSafe, findLineNo } from './_lib.mjs';

export const ID = 'gesture-required';
export const REQUIREMENTS = ['MAX-GESTURE-REQUIRED'];

const GATED_METHODS = ['openLink', 'downloadFile', 'shareMaxContent'];

export function validate(gamePath) {
  const issues = [];
  const files = walkFiles(gamePath, ['.js', '.mjs', '.html']);

  for (const f of files) {
    const t = readTextSafe(f);
    if (!t) continue;

    // Find setInterval/setTimeout bodies (crude — just scan for the fn call)
    for (const method of GATED_METHODS) {
      // Pattern: setTimeout(() => { ... WebApp.openLink(...) ... }, N)
      // We use a simple heuristic — flag calls inside setInterval/setTimeout arrow/function bodies
      const re = new RegExp(
        `(setInterval|setTimeout)\\s*\\([^;]*?\\b(WebApp|MaxSDK)\\.${method}\\s*\\(`,
        'g'
      );
      let m;
      while ((m = re.exec(t)) !== null) {
        issues.push({
          id: `MAX-GESTURE-${method.toUpperCase()}`,
          level: LEVELS.BLOCKER,
          message: `WebApp.${method}() called inside ${m[1]} — MAX blocks this method without a user gesture. Move into a click/touch handler.`,
          citation: 'Чтобы обезопасить процесс, перед вызовом метода MAX Bridge проверяет клик пользователя в мини-приложении. Если клика не было, перехода/скачивания/шеринга не будет',
          url: 'https://dev.max.ru/docs/webapps/bridge',
          file: f,
          line: t.slice(0, m.index).split('\n').length,
        });
      }
    }
  }

  return issues;
}
