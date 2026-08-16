/**
 * @file auth-params.mjs
 * @description VKPLAY-AUTH-PARAMS — VK Play passes user identification through
 *              URL query params (uid, hash, app_id, time, locale, etc.) when
 *              loading your game in iframe. Your client must:
 *                1. Read these params from window.location.search
 *                2. Send them to YOUR server (not the user's browser logic)
 *                3. Server verifies hash before trusting uid
 *
 *              This validator checks the client at least ATTEMPTS to read auth
 *              params, otherwise the game has no way to identify users.
 *
 *              Source: https://documentation.vkplay.ru/f2p_vkp/
 */

import { LEVELS, walkFiles, readTextSafe } from './_lib.mjs';

export const ID = 'auth-params';
export const REQUIREMENTS = ['VKPLAY-AUTH-PARAMS'];

export function validate(gamePath) {
  const issues = [];
  const files = walkFiles(gamePath);

  let readsQueryParams = false;
  let readsAuthParams = false;
  let trustsUidWithoutHash = false;
  let trustsUidFile = null;
  let trustsUidLine = null;

  for (const f of files) {
    const t = readTextSafe(f);
    if (!t) continue;

    // Skip server-side
    if (/\/(server|backend|api|routes)\//i.test(f)) continue;

    if (/window\s*\.\s*location\s*\.\s*search|new\s+URLSearchParams|getSearchParams/.test(t)) {
      readsQueryParams = true;
    }

    // Specifically reads VK Play auth params
    if (/['"]uid['"]|['"]app_id['"]|['"]hash['"]|getParam\s*\(\s*['"](?:uid|hash|app_id)['"]/i.test(t)) {
      readsAuthParams = true;
    }

    // Anti-pattern: using uid/user_id from URL directly without server validation
    // e.g. var userId = params.get('uid'); ... gameState.user = { id: userId }
    const trustRe = /(?:get|getItem)\s*\(\s*['"](?:uid|user_id)['"]\s*\)\s*[\s\S]{0,200}?(?:userId|playerId|currentUser)/i;
    if (trustRe.test(t) && !/fetch\s*\([^)]*\/auth/.test(t) && !/api\/(?:verify|validate|auth)/.test(t)) {
      trustsUidWithoutHash = true;
      trustsUidFile = f;
      const m = trustRe.exec(t);
      if (m) trustsUidLine = t.slice(0, m.index).split('\n').length;
    }
  }

  if (!readsQueryParams) {
    issues.push({
      id: 'VKPLAY-NO-QUERY-READ',
      level: LEVELS.BLOCKER,
      message: 'No code reads window.location.search or URLSearchParams. VK Play passes user identification through query params (uid, hash, app_id) — without reading them, you can\'t identify users.',
      url: 'https://documentation.vkplay.ru/f2p_vkp/',
    });
    return issues;
  }

  if (!readsAuthParams) {
    issues.push({
      id: 'VKPLAY-NO-AUTH-PARAMS',
      level: LEVELS.WARNING,
      message: 'Code reads query params but doesn\'t reference the VK Play auth keys (uid, hash, app_id). Make sure you\'re extracting the right ones.',
    });
  }

  if (trustsUidWithoutHash) {
    issues.push({
      id: 'VKPLAY-UID-NOT-VALIDATED',
      level: LEVELS.BLOCKER,
      message: 'Code reads `uid` from URL and uses it as the player identity, but no fetch to /auth or /verify endpoint is found. Anyone can spoof uid in URL — you MUST POST {uid, hash, ...} to YOUR server, server checks hash with secret_key, only then trust the uid.',
      url: 'https://documentation.vkplay.ru/f2p_vkp/',
      file: trustsUidFile,
      line: trustsUidLine,
    });
  }

  return issues;
}
