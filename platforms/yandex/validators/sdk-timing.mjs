// scripts/validators/sdk-timing.mjs
//
// REQ-1.19.2-PRECISION — LoadingAPI.ready() must be called when game becomes interactive,
//   not before (rejection: Prizrak, BattleFront) and not after (DustyTrader, Circle 2048).
// REQ-2.14 — detectLang() must run on startup BEFORE UI is rendered, via SDK.
// Both checks are static (heuristic). Real timing verified by debugcheck v2.4 runtime probe.
//
// Sources:
//   https://yandex.ru/dev/games/doc/ru/requirements/1/19#gameready
//   https://yandex.ru/dev/games/doc/ru/requirements/2/14
//   https://yandex.ru/dev/games/doc/ru/sdk/sdk-game-events

import { LEVELS, resolveGamePaths, walkFiles, readTextSafe, runCli, isMain } from './_lib.mjs';

export const ID = 'sdk-timing';
export const REQUIREMENTS = ['REQ-1.19.2-PRECISION', 'REQ-2.14'];
export const URL_119 = 'https://yandex.ru/dev/games/doc/ru/requirements/1/19#gameready';
export const URL_214 = 'https://yandex.ru/dev/games/doc/ru/requirements/2/14';

export function validate(gamePath) {
  const { workPath } = resolveGamePaths(gamePath);
  const issues = [];

  const files = walkFiles(workPath, ['.js', '.html']);
  let foundReadyCall = false;
  let foundDetectLang = false;
  let foundEnvLang = false;
  let foundOptionalChaining = null;
  let foundReadyTooEarly = null;       // ready() in a path that runs immediately after init
  let foundDetectLangAfterUI = null;   // detectLang() called after first UI render

  for (const file of files) {
    const text = readTextSafe(file);
    if (!text) continue;

    // 1. LoadingAPI.ready() exists
    if (/LoadingAPI(\?\.|\.)ready\s*\(/.test(text)) foundReadyCall = true;

    // 2. detectLang() exists
    if (/\bdetectLang\s*\(/.test(text) || /\bdetect_lang\s*\(/.test(text)) foundDetectLang = true;

    // 3. SDK env.i18n.lang access
    if (/\bysdk\.environment(\?\.|\.)i18n(\?\.|\.)lang/.test(text) ||
        /environment(\?\.|\.)i18n(\?\.|\.)lang/.test(text)) {
      foundEnvLang = true;
    }

    // 4. Optional chaining on i18n — moderation may not detect SDK lang call (Yandex docs warn)
    const optChain = text.match(/environment\?\.i18n|i18n\?\.lang|environment\.i18n\?\.lang/);
    if (optChain && !foundOptionalChaining) {
      const lineNo = text.slice(0, text.indexOf(optChain[0])).split('\n').length;
      foundOptionalChaining = { file, line: lineNo, snippet: optChain[0] };
    }

    // 5. ready() called BEFORE removing loading screen / first paint?
    // Heuristic: if ready() appears within a few lines of detectLang/applyStaticLang/init
    // WITHOUT being inside a requestAnimationFrame OR followed by loading-screen removal.
    const readyMatches = [...text.matchAll(/(LoadingAPI(?:\?\.|\.)ready\s*\(\s*\))/g)];
    for (const rm of readyMatches) {
      const idx = rm.index;
      // Look at 200 chars before and after.
      const before = text.slice(Math.max(0, idx - 400), idx);
      const after  = text.slice(idx, Math.min(text.length, idx + 400));

      const hasRafBefore = /requestAnimationFrame\s*\(/.test(before);
      const hasLoadingRemovedBefore = /loading[-_]?screen.*(?:remove|classList\.add\(['"]?(?:hide|fade-out)|style\.display\s*=\s*['"]none)/i.test(before);
      const hasUiRenderedBefore = /(applyStaticLang|renderUI|showMenu|render\w*Menu)/.test(before);

      // Pattern: detectLang() then ready() in same chain WITHOUT raf/loading hide → too early.
      const callsDetectLangBefore = /\bdetectLang\s*\(/.test(before);
      const isInitChain = /Plat\.init|YaGames\.init|await\s+\w+init/.test(before);

      if (isInitChain && callsDetectLangBefore && !hasRafBefore && !hasLoadingRemovedBefore) {
        const lineNo = text.slice(0, idx).split('\n').length;
        if (!foundReadyTooEarly) foundReadyTooEarly = { file, line: lineNo };
      }
    }

    // 6. detectLang() AFTER UI is rendered? Look for detectLang in click handlers, setTimeout, etc.
    // Pattern: addEventListener('click', () => { ... detectLang() ... })
    const lateDetect = text.match(/(?:addEventListener|setTimeout|setInterval)\s*\([^)]*?\bdetectLang\s*\(/);
    if (lateDetect && !foundDetectLangAfterUI) {
      const lineNo = text.slice(0, text.indexOf(lateDetect[0])).split('\n').length;
      foundDetectLangAfterUI = { file, line: lineNo, snippet: lateDetect[0].slice(0, 80) };
    }
  }

  // === Emit issues ===
  if (!foundReadyCall) {
    issues.push({
      id: 'REQ-1.19.2-PRECISION', level: LEVELS.BLOCKER,
      message: 'LoadingAPI.ready() not found anywhere — required by п. 1.19',
      citation: '"В момент, когда пользователь уже может приступить к игре, должен быть произведен вызов метода LoadingAPI.ready()"',
      url: URL_119, file: workPath
    });
  }

  if (!foundDetectLang && !foundEnvLang) {
    issues.push({
      id: 'REQ-2.14', level: LEVELS.BLOCKER,
      message: 'No call to ysdk.environment.i18n.lang or detectLang() — language auto-detection missing',
      citation: '"Game must use environment.i18n.lang from SDK on startup" (2.14)',
      url: URL_214, file: workPath
    });
  } else if (foundDetectLang && !foundEnvLang) {
    issues.push({
      id: 'REQ-2.14', level: LEVELS.WARNING,
      message: 'detectLang() exists but ysdk.environment.i18n.lang not referenced — verify SDK is the language source',
      url: URL_214, file: workPath
    });
  }

  if (foundOptionalChaining) {
    issues.push({
      id: 'REQ-2.14', level: LEVELS.WARNING,
      message: 'Optional chaining on i18n: "' + foundOptionalChaining.snippet + '". Yandex static analysis may miss this — moderator can flag п. 2.14 even if call works.',
      citation: 'Past pattern: ysdk.environment?.i18n?.lang (with optional chaining) caused false rejections.',
      url: URL_214, file: foundOptionalChaining.file, line: foundOptionalChaining.line
    });
  }

  if (foundReadyTooEarly) {
    issues.push({
      id: 'REQ-1.19.2-PRECISION', level: LEVELS.BLOCKER,
      message: 'LoadingAPI.ready() appears to be called immediately after init/detectLang, before UI is rendered. Past rejection (Prizrak, BattleFront): "Вызов GRA до того, как игра становится доступной для играния".',
      citation: 'ready() must be called AFTER loading screen removed AND first paint (use requestAnimationFrame x2)',
      url: URL_119, file: foundReadyTooEarly.file, line: foundReadyTooEarly.line
    });
  }

  if (foundDetectLangAfterUI) {
    issues.push({
      id: 'REQ-2.14', level: LEVELS.BLOCKER,
      message: 'detectLang() appears to be called from event handler / setTimeout (not on startup): "' + foundDetectLangAfterUI.snippet + '"',
      citation: 'Past rejection (DustyTrader, Circle 2048): "Автоопределение в процессе игры" (а должно — на старте, до рендера UI)',
      url: URL_214, file: foundDetectLangAfterUI.file, line: foundDetectLangAfterUI.line
    });
  }

  return issues;
}

if (isMain(import.meta.url)) {
  runCli({ ID, validate });
}
