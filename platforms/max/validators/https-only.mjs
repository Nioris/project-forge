/**
 * @file https-only.mjs
 * @description MAX-HTTPS-ONLY — MAX требует HTTPS-соединение. Mixed content
 *              блокируется клиентом и ломает mini-app.
 *              Source: https://dev.max.ru/docs/webapps/introduction
 */

import { LEVELS, walkFiles, readTextSafe } from './_lib.mjs';

export const ID = 'https-only';
export const REQUIREMENTS = ['MAX-HTTPS-ONLY'];

export function validate(gamePath) {
  const issues = [];
  const files = walkFiles(gamePath, ['.html', '.js', '.mjs', '.css']);

  for (const f of files) {
    const t = readTextSafe(f);
    if (!t) continue;

    const re = /\bhttp:\/\/([\w.-]+)/g;
    let m;
    while ((m = re.exec(t)) !== null) {
      const host = m[1];
      // Skip localhost / private IPs / comments
      if (/^(localhost|127\.|10\.|192\.168\.|172\.1[6-9]\.|172\.2\d\.|172\.3[01]\.)/.test(host)) continue;

      const lineStart = t.lastIndexOf('\n', m.index) + 1;
      const lineText = t.substring(lineStart, m.index);
      if (/\/\/[^\n]*$/.test(lineText) || /^\s*\*/.test(lineText)) continue;

      issues.push({
        id: 'MAX-HTTPS-ONLY',
        level: LEVELS.BLOCKER,
        message: `Mixed content: http://${host}... — MAX serves mini-app over HTTPS; browsers will block this resource.`,
        citation: 'Проверьте, что приложение работает по защищённому соединению — https',
        url: 'https://dev.max.ru/docs/webapps/introduction',
        file: f,
        line: t.slice(0, m.index).split('\n').length,
      });
    }
  }

  return issues;
}
