/**
 * @file signature-check.mjs
 * @description VKPLAY-SECRET-IN-CLIENT — VK Play games sign payment / auth callbacks
 *              with the project's secret_key. This key is server-only. If it leaks
 *              into client JS bundle, attackers can forge any user_id and grant
 *              themselves any in-game item.
 *
 *              This validator scans all client-side files for patterns that look
 *              like the secret being embedded:
 *                - long hex strings assigned to "secret" / "secretKey" / "vkplay_secret"
 *                - md5 calls with a sorted-params concat (server-only logic)
 *
 *              Source: https://documentation.vkplay.ru/f2p_vkp/ Sign Calculation
 */

import { LEVELS, walkFiles, readTextSafe, findLineNo } from './_lib.mjs';

export const ID = 'signature-check';
export const REQUIREMENTS = ['VKPLAY-SECRET-IN-CLIENT'];

export function validate(gamePath) {
  const issues = [];
  const files = walkFiles(gamePath);

  // Patterns suggesting secret_key is in client-side code
  const dangerousAssigns = [
    /\b(secret|secret_?key|vkplay_?secret|app_?secret)\s*[:=]\s*["']([a-zA-Z0-9]{16,})["']/gi,
    /\bSECRET\s*=\s*["']([a-zA-Z0-9]{16,})["']/g,
  ];

  // Server-side md5 sign logic in client = either dead code OR worse — actual leak
  const serverSidePatterns = [
    /md5\s*\([^)]*secret[^)]*\)/i,
    /createHash\s*\(\s*["']md5["']\s*\)[^;]*secret/i,
  ];

  for (const f of files) {
    const t = readTextSafe(f);
    if (!t) continue;

    // Skip server / api / backend folders — common naming
    if (/\/(server|backend|api|routes)\//i.test(f)) continue;

    for (const re of dangerousAssigns) {
      let m;
      while ((m = re.exec(t)) !== null) {
        const value = m[2] || m[1];
        // Skip obviously placeholder or empty strings
        if (/^(YOUR|PLACEHOLDER|REPLACE|TODO|XXX|TEST|EXAMPLE|DEMO)/i.test(value)) continue;
        // Real secrets from VK Play are typically 32-char hex
        if (value.length < 16) continue;

        issues.push({
          id: 'VKPLAY-SECRET-LEAK',
          level: LEVELS.BLOCKER,
          message: `Possible secret_key embedded in client code: assignment with ${value.length}-char value. SecretKey must NEVER live in JS bundles — only on your server. If this is a placeholder, rename it (e.g. PUBLIC_TOKEN, APP_ID).`,
          url: 'https://documentation.vkplay.ru/f2p_vkp/',
          file: f,
          line: t.slice(0, m.index).split('\n').length,
        });
      }
    }

    for (const re of serverSidePatterns) {
      const m = re.exec(t);
      if (m) {
        issues.push({
          id: 'VKPLAY-SIGN-LOGIC-IN-CLIENT',
          level: LEVELS.WARNING,
          message: 'md5 + secret sign-calculation logic in client code. This is server-only logic. If this is genuinely needed in client, you have a misconception — auth/payment signatures must be computed server-side after VK Play webhook.',
          file: f,
          line: t.slice(0, m.index).split('\n').length,
        });
        break; // one warning per file is enough
      }
    }
  }

  return issues;
}
