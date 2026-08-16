/**
 * @file https-only.mjs
 * @description VKPLAY-HTTPS-ONLY — VK Play loads games in iframe over HTTPS.
 *              Any http:// resources (assets, API calls, fonts) get blocked
 *              by mixed-content protection in the browser, breaking the game.
 *
 *              Source: https://documentation.vkplay.ru/f2p_vkp/ (general iframe req)
 */

import { LEVELS, walkFiles, readTextSafe } from './_lib.mjs';

export const ID = 'https-only';
export const REQUIREMENTS = ['VKPLAY-HTTPS-ONLY'];

export function validate(gamePath) {
  const issues = [];
  const files = walkFiles(gamePath);

  let httpRefs = []; // {file, line, url}

  for (const f of files) {
    const t = readTextSafe(f);
    if (!t) continue;

    // Skip: comments, well-known schema-only references, localhost (dev)
    const lines = t.split('\n');
    lines.forEach((line, idx) => {
      // strip line comments
      const noComment = line.replace(/\/\/.*$/, '').replace(/<!--[\s\S]*?-->/g, '');
      // Find http:// urls (not https, not example.com, not localhost, not 127.0.0.1)
      const urlRe = /\bhttp:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0|w3\.org|example\.|github\.io)([^\s"'<>)]+)/g;
      let m;
      while ((m = urlRe.exec(noComment)) !== null) {
        httpRefs.push({ file: f, line: idx + 1, url: 'http://' + m[1].slice(0, 80) });
      }
    });
  }

  // Group by URL to avoid spamming the same domain repeatedly
  const byUrl = new Map();
  for (const ref of httpRefs) {
    const key = ref.url;
    if (!byUrl.has(key)) byUrl.set(key, []);
    byUrl.get(key).push(ref);
  }

  for (const [url, refs] of byUrl) {
    issues.push({
      id: 'VKPLAY-HTTP-RESOURCE',
      level: LEVELS.BLOCKER,
      message: `http:// resource referenced (${refs.length} occurrence${refs.length > 1 ? 's' : ''}): ${url} — VK Play loads games over HTTPS, mixed content will be blocked. Switch to https:// or relative URLs.`,
      file: refs[0].file,
      line: refs[0].line,
    });
  }

  return issues;
}
