/**
 * @file url-constraints.mjs
 * @description MAX-URL-CONSTRAINTS — MAX партнёрская платформа ограничивает URL
 *              мини-приложения: max 1024 символа, только латиница + цифры + точка + дефис.
 *              Этот валидатор не может проверить URL хостинга (он ещё не выбран),
 *              но flag'ает опасные паттерны в HTML: кириллицу в src/href, пробелы
 *              в URL — которые модератор увидит и отвергнет.
 *              Source: https://dev.max.ru/docs/webapps/introduction
 */

import path from 'node:path';
import { LEVELS, readTextSafe, findLineNo } from './_lib.mjs';

export const ID = 'url-constraints';
export const REQUIREMENTS = ['MAX-URL-CONSTRAINTS'];

export function validate(gamePath) {
  const issues = [];
  const htmlPath = path.join(gamePath, 'index.html');
  const html = readTextSafe(htmlPath);
  if (!html) return issues;

  // Flag src/href attributes that contain Cyrillic, spaces, or other forbidden chars
  const attrRe = /\b(src|href)\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = attrRe.exec(html)) !== null) {
    const url = m[2];
    // Skip data: / blob: / # anchors / javascript:
    if (/^(data|blob|javascript|mailto|tel):/i.test(url) || url.startsWith('#')) continue;

    // Cyrillic check
    if (/[\u0400-\u04FF]/.test(url)) {
      issues.push({
        id: 'MAX-URL-CYRILLIC',
        level: LEVELS.BLOCKER,
        message: `URL contains Cyrillic characters: "${url}". MAX requires latin + digits + dot + dash only.`,
        citation: 'Допустимые символы: буквы (латиница), цифры, точка (.) и дефис (-)',
        url: 'https://dev.max.ru/docs/webapps/introduction',
        file: htmlPath,
        line: findLineNo(html, m[0]),
      });
    }

    // Spaces (not URL-encoded)
    if (/\s/.test(url) && !/%20/.test(url)) {
      issues.push({
        id: 'MAX-URL-SPACES',
        level: LEVELS.BLOCKER,
        message: `URL contains raw space: "${url}". Use %20 encoding or remove spaces.`,
        citation: 'Пробелы не поддерживаются',
        url: 'https://dev.max.ru/docs/webapps/introduction',
        file: htmlPath,
        line: findLineNo(html, m[0]),
      });
    }
  }

  return issues;
}
