/**
 * @file cloud-storage-constraints.mjs
 * @description TG-CLOUD-KEY / TG-CLOUD-VALUE — Telegram CloudStorage documented
 *              constraints (verified from official docs):
 *              - key: 1-128 chars, only A-Z, a-z, 0-9, _ and - allowed
 *              - value: 0-4096 chars
 *              - up to 1024 keys per user per bot
 *              Violations fail silently — setItem callback returns an error
 *              string but many apps ignore it. This validator catches literal
 *              keys in source code that will always fail.
 *
 *              Source: https://core.telegram.org/bots/webapps#cloudstorage
 *              Cross-checked: https://github.com/revenkroz/telegram-web-app-bot-example
 */

import { LEVELS, walkFiles, readTextSafe } from './_lib.mjs';

export const ID = 'cloud-storage-constraints';
export const REQUIREMENTS = ['TG-CLOUD-KEY', 'TG-CLOUD-VALUE'];

const KEY_ALLOWED_RE = /^[A-Za-z0-9_-]{1,128}$/;

export function validate(gamePath) {
  const issues = [];
  const files = walkFiles(gamePath, ['.html', '.js', '.mjs']);

  for (const f of files) {
    const t = readTextSafe(f);
    if (!t) continue;

    // Match: CloudStorage.setItem('key', ...) — literal string keys only
    const setRe = /\bCloudStorage\.(setItem|getItem|removeItem)\s*\(\s*(['"])([^'"]*)\2/g;
    let m;
    while ((m = setRe.exec(t)) !== null) {
      const method = m[1];
      const key = m[3];
      if (!KEY_ALLOWED_RE.test(key)) {
        const reason = key.length === 0
          ? 'empty key'
          : key.length > 128
            ? `${key.length} chars (max 128)`
            : 'contains characters outside A-Z a-z 0-9 _ -';
        issues.push({
          id: 'TG-CLOUD-KEY',
          level: LEVELS.BLOCKER,
          message: `CloudStorage.${method} key "${key}" is invalid (${reason}). setItem will silently error.`,
          citation: 'key should contain 1-128 characters, only A-Z, a-z, 0-9, _ and - are allowed',
          url: 'https://core.telegram.org/bots/webapps#cloudstorage',
          file: f,
          line: t.slice(0, m.index).split('\n').length,
        });
      }
    }
  }

  return issues;
}
