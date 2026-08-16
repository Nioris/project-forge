/**
 * @file https-only.mjs
 * @description TG-HTTPS-ONLY — Telegram Mini Apps должны грузиться по HTTPS
 *              и не ссылаться на http:// ресурсы. Mixed content блокируется
 *              браузером и ломает игру.
 *              Source: https://core.telegram.org/bots/webapps#mini-apps-on-telegram
 */

import { LEVELS, walkFiles, readTextSafe, findLineNo } from './_lib.mjs';

export const ID = 'https-only';
export const REQUIREMENTS = ['TG-HTTPS-ONLY'];

export function validate(gamePath) {
  const issues = [];
  const files = walkFiles(gamePath, ['.html', '.js', '.mjs', '.css']);

  // Regex excludes localhost/127/192.168/10.x/comments
  const httpRe = /(?<!\/\/[^\n]*?)(?<!\/\*[\s\S]*?)\bhttp:\/\/(?!localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.)([\w.-]+)/g;

  for (const f of files) {
    const t = readTextSafe(f);
    if (!t) continue;
    let m;
    // Simpler, more reliable — just flag http:// that isn't localhost/private
    const simpleRe = /\bhttp:\/\/([\w.-]+)/g;
    while ((m = simpleRe.exec(t)) !== null) {
      const host = m[1];
      if (/^(localhost|127\.|10\.|192\.168\.|172\.1[6-9]\.|172\.2\d\.|172\.3[01]\.)/.test(host)) continue;
      // Skip if inside a line-comment
      const lineStart = t.lastIndexOf('\n', m.index) + 1;
      const lineText = t.substring(lineStart, m.index);
      if (/\/\/[^\n]*$/.test(lineText) || /^\s*\*/.test(lineText)) continue;
      issues.push({
        id: 'TG-HTTPS-ONLY',
        level: LEVELS.BLOCKER,
        message: `Mixed content: http://${host}... — Telegram serves the Mini App over HTTPS, browsers will block this resource.`,
        citation: 'Mini Apps must be served over HTTPS. Mixed content is blocked.',
        url: 'https://core.telegram.org/bots/webapps',
        file: f,
        line: t.slice(0, m.index).split('\n').length,
      });
    }
  }

  return issues;
}
