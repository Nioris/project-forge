// scripts/validators/scroll-prevention.mjs
// REQ-1.10.2: no browser scrollbar, no iOS swipe-to-refresh.
// Source: https://yandex.ru/dev/games/doc/ru/requirements/1/10
// "Swipe-to-refresh functionality is considered a scrolling violation"
//
// Static check (defense in depth: CSS + JS preventDefault).
// We look at HTML inline styles, <style> blocks, and linked .css files.

import path from 'node:path';
import fs from 'node:fs';
import { LEVELS, resolveGamePaths, walkFiles, readTextSafe, runCli, isMain } from './_lib.mjs';

export const ID = 'scroll-prevention';
export const REQUIREMENTS = ['REQ-1.10.2'];
export const URL = 'https://yandex.ru/dev/games/doc/ru/requirements/1/10';
export const CITATION = '"Swipe-to-refresh functionality is considered a scrolling violation" (1.10.2)';

// Extract all CSS text from a project: linked CSS files + inline <style> blocks.
function collectAllCss(workPath) {
  const result = [];
  const htmlFiles = walkFiles(workPath, ['.html']);

  for (const file of htmlFiles) {
    const text = readTextSafe(file);
    if (!text) continue;

    // Inline <style> blocks
    const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let m;
    while ((m = styleRe.exec(text)) !== null) {
      result.push({ source: file + ' (inline <style>)', text: m[1] });
    }

    // Linked CSS via <link rel="stylesheet" href="...">
    const linkRe = /<link[^>]+href\s*=\s*['"]([^'"]+\.css)['"][^>]*>/gi;
    let lm;
    while ((lm = linkRe.exec(text)) !== null) {
      const href = lm[1];
      // Resolve relative to HTML file dir.
      const cssPath = path.resolve(path.dirname(file), href.replace(/^\//, ''));
      const cssText = readTextSafe(cssPath);
      if (cssText) result.push({ source: cssPath, text: cssText });
    }
  }

  // Also scan all .css files in workPath (catches files not explicitly linked).
  const cssFiles = walkFiles(workPath, ['.css']);
  for (const f of cssFiles) {
    if (!result.find(r => r.source === f)) {
      const t = readTextSafe(f);
      if (t) result.push({ source: f, text: t });
    }
  }

  return result;
}

// Test if any html/body rule contains required property/value.
function hasRule(cssBlocks, selectorPattern, propertyPattern) {
  for (const block of cssBlocks) {
    // Iterate rules naively: find selectors followed by { ... }
    const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = ruleRe.exec(block.text)) !== null) {
      const sel = m[1];
      const body = m[2];
      if (selectorPattern.test(sel) && propertyPattern.test(body)) {
        return { source: block.source, sel: sel.trim() };
      }
    }
  }
  return null;
}

export function validate(gamePath) {
  const { workPath } = resolveGamePaths(gamePath);
  const issues = [];

  const css = collectAllCss(workPath);
  if (css.length === 0) {
    issues.push({
      id: 'REQ-1.10.2', level: LEVELS.WARNING,
      message: 'No CSS found — cannot verify scroll prevention',
      url: URL, file: workPath
    });
    return issues;
  }

  const htmlBodyRe = /(\bhtml\b|\bbody\b|\*)/;

  // 1. touch-action: none on html/body
  const touchAction = hasRule(css, htmlBodyRe, /touch-action\s*:\s*none/);
  // touch-action: manipulation still allows scroll on iOS Safari — rejected by past moderation.
  const touchActionWeak = hasRule(css, htmlBodyRe, /touch-action\s*:\s*manipulation/);

  if (!touchAction) {
    if (touchActionWeak) {
      issues.push({
        id: 'REQ-1.10.2', level: LEVELS.WARNING,
        message: 'touch-action:manipulation on html/body — still allows iOS swipe. Use touch-action:none.',
        citation: CITATION, url: URL, file: touchActionWeak.source
      });
    } else {
      issues.push({
        id: 'REQ-1.10.2', level: LEVELS.BLOCKER,
        message: 'No touch-action:none on html/body. iOS will allow swipe-to-refresh.',
        citation: CITATION, url: URL, file: workPath
      });
    }
  }

  // 2. overscroll-behavior: none on html/body
  const overscroll = hasRule(css, htmlBodyRe, /overscroll-behavior(-y)?\s*:\s*(none|contain)/);
  if (!overscroll) {
    issues.push({
      id: 'REQ-1.10.2', level: LEVELS.WARNING,
      message: 'No overscroll-behavior:none on html/body — pull-to-refresh may trigger.',
      citation: CITATION, url: URL, file: workPath
    });
  }

  // 3. overflow:hidden + position:fixed on body
  const overflow = hasRule(css, /\bbody\b/, /overflow\s*:\s*hidden/);
  const fixed = hasRule(css, /\bbody\b/, /position\s*:\s*fixed/);
  if (!overflow) {
    issues.push({
      id: 'REQ-1.10.2', level: LEVELS.WARNING,
      message: 'No overflow:hidden on body — vertical scroll may appear if content overflows.',
      citation: CITATION, url: URL, file: workPath
    });
  }
  if (!fixed) {
    issues.push({
      id: 'REQ-1.10.2', level: LEVELS.INFO,
      message: 'No position:fixed on body — recommended on iOS to lock layout.',
      citation: CITATION, url: URL, file: workPath
    });
  }

  // 4. JS touchmove preventDefault — defense in depth.
  const jsFiles = walkFiles(workPath, ['.js', '.html']);
  let foundJsPrevent = false;
  for (const f of jsFiles) {
    const text = readTextSafe(f);
    if (!text) continue;
    // Pattern: addEventListener('touchmove', ..., { passive: false })  OR  addEventListener('touchmove', e => e.preventDefault(), ...)
    if (/addEventListener\s*\(\s*['"]touchmove['"]/i.test(text) && /preventDefault\s*\(\s*\)/.test(text)) {
      foundJsPrevent = true;
      break;
    }
  }
  if (!foundJsPrevent) {
    issues.push({
      id: 'REQ-1.10.2', level: LEVELS.WARNING,
      message: 'No JS touchmove preventDefault found. iOS Safari sometimes ignores CSS — JS handler is recommended as backup.',
      citation: CITATION, url: URL, file: workPath
    });
  }

  return issues;
}

if (isMain(import.meta.url)) {
  runCli({ ID, validate });
}
