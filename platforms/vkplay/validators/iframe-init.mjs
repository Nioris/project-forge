/**
 * @file iframe-init.mjs
 * @description VKPLAY-SDK-INIT — VK Play iframe games must initialize the SDK
 *              after the document loads. The SDK script tag is provided in the
 *              dev portal "Install Code" section. Without init, the platform
 *              can't establish postMessage handshake and resize/auth/payments fail.
 *
 *              Also flags incorrect SDK script source (must be vkplay.ru-hosted,
 *              not self-hosted, otherwise platform may reject).
 *
 *              Source: https://documentation.vkplay.ru/f2p_vkp/f2pb_js_vkp
 */

import { LEVELS, walkFiles, readTextSafe, findLineNo } from './_lib.mjs';

export const ID = 'iframe-init';
export const REQUIREMENTS = ['VKPLAY-SDK-INIT', 'VKPLAY-SDK-SCRIPT'];

export function validate(gamePath) {
  const issues = [];
  const files = walkFiles(gamePath);

  // 1. Look for the SDK <script src=...> in HTML files
  let sdkScriptFound = false;
  let sdkScriptFile = null;
  let sdkScriptOrigin = null;

  // 2. Look for an init() call
  let initFound = false;
  let initFile = null;
  let initLine = null;

  for (const f of files) {
    const t = readTextSafe(f);
    if (!t) continue;

    if (f.endsWith('.html')) {
      // Match <script src="..."> with vkplay or vk.com or local sdk references
      const scriptRe = /<script[^>]+src=["']([^"']*(?:vkplay|vk-?play|VKPlaySDK|vkplay-sdk)[^"']*)["']/gi;
      let m;
      while ((m = scriptRe.exec(t)) !== null) {
        sdkScriptFound = true;
        sdkScriptFile = f;
        sdkScriptOrigin = m[1];
      }
    }

    // Init call patterns we accept
    const initRegexes = [
      /\bVKPlaySDK\s*\.\s*init\s*\(/,
      /\bvkplay(?:Sdk|SDK)\s*\.\s*init\s*\(/,
      /window\s*\.\s*onVKPlaySDKReady\s*=/,
      /\bnew\s+VKPlaySDK\s*\(/,
    ];
    for (const re of initRegexes) {
      const idx = t.search(re);
      if (idx >= 0) {
        initFound = true;
        initFile = f;
        initLine = t.slice(0, idx).split('\n').length;
      }
    }
  }

  if (!sdkScriptFound) {
    issues.push({
      id: 'VKPLAY-SDK-SCRIPT',
      level: LEVELS.BLOCKER,
      message: 'No VK Play SDK <script> tag found in HTML. Get the install code from your project page on developers.vkplay.ru and add it to index.html before any game code.',
      url: 'https://documentation.vkplay.ru/f2p_vkp/f2pb_js_vkp',
    });
  } else if (sdkScriptOrigin && !/vkplay\.ru|vk\.com/i.test(sdkScriptOrigin)) {
    issues.push({
      id: 'VKPLAY-SDK-WRONG-ORIGIN',
      level: LEVELS.WARNING,
      message: `VK Play SDK script src "${sdkScriptOrigin}" does not load from vkplay.ru / vk.com. Self-hosted SDKs may be rejected by the platform — use the official URL from developers.vkplay.ru.`,
      file: sdkScriptFile,
    });
  }

  if (!initFound) {
    issues.push({
      id: 'VKPLAY-SDK-INIT',
      level: LEVELS.BLOCKER,
      message: 'No VKPlaySDK init() call found. Required pattern: declare window.onVKPlaySDKReady = function(sdk) { ... } OR call VKPlaySDK.init() after the SDK script loads.',
      url: 'https://documentation.vkplay.ru/f2p_vkp/f2pb_js_vkp',
    });
  } else if (sdkScriptFound) {
    // Sanity: init should be in the same HTML file or a bundled script the HTML loads.
    // Easy heuristic — both exist somewhere — pass.
  }

  return issues;
}
