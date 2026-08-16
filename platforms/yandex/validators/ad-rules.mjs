// scripts/validators/ad-rules.mjs
//
// REQ-4.4   — ads only at logical pauses, after user action
// REQ-4.5.1 — RV button MUST clearly say "ad for reward" + name the reward
// REQ-4.5.2 — RV reward is bonus, not required for progression
// REQ-3.8   — in-game currency uses SDK methods, not hardcoded ₽/$/€
// REQ-4.7   — pause + mute audio when ad shows
//
// Sources:
//   https://yandex.ru/dev/games/doc/ru/requirements/4/4
//   https://yandex.ru/dev/games/doc/ru/concepts/requirements#4

import { LEVELS, resolveGamePaths, walkFiles, readTextSafe, runCli, isMain } from './_lib.mjs';

export const ID = 'ad-rules';
export const REQUIREMENTS = ['REQ-4.4', 'REQ-4.5.1', 'REQ-4.5.2', 'REQ-3.8', 'REQ-4.7'];
export const URL_44 = 'https://yandex.ru/dev/games/doc/ru/requirements/4/4';
export const URL_45 = 'https://yandex.ru/dev/games/doc/ru/concepts/requirements#4';
export const URL_38 = 'https://yandex.ru/dev/games/doc/ru/concepts/requirements#3';

// Reward keywords: must appear near showRewarded button text.
// Multiple languages — moderator may switch lang to verify.
const AD_KEYWORDS = ['реклам', 'ad ', 'ads', 'video', 'видео', 'смотреть', 'watch', 'mirar', 'voir', 'sehen', 'guarda', 'izle', 'tonton', '見る', '观看', 'देखें', 'مشاهدة'];
const REWARD_INDICATORS = /[\+×x]\s*\d|coin|gold|crystal|gem|life|life|heart|monet|монет|жизн|очк|score|hp|чип/i;

export function validate(gamePath) {
  const { workPath } = resolveGamePaths(gamePath);
  const issues = [];

  const files = walkFiles(workPath, ['.js', '.html']);
  let hasShowRewarded = false;
  let hasShowFullscreen = false;
  let hasGameApiPause = false;
  let hasMuteOnAd = false;

  // Collect all RV button candidates — anything that calls showRewarded/RewardedVideo.
  // We then check that the surrounding HTML/UI text mentions ad + reward.
  const rvButtons = []; // { file, line, contextSnippet, hasAdKeyword, hasRewardIndicator }
  const adFromTimer = []; // { file, line, snippet }
  const hardcodedCurrency = []; // { file, line, value }

  for (const file of files) {
    const text = readTextSafe(file);
    if (!text) continue;

    if (/\.adv\.showRewarded(?:Video)?\s*\(/.test(text) || /\bshowRewarded\b\s*\(/.test(text)) hasShowRewarded = true;
    if (/\.adv\.showFullscreenAdv\s*\(/.test(text) || /\bshowFullscreenAdv\b\s*\(/.test(text)) hasShowFullscreen = true;
    if (/game_api_pause/.test(text) || /onPause\s*[\(:]/.test(text)) hasGameApiPause = true;
    if (/(suspend\s*\(|\.gain\.value\s*=\s*0|muteForAd|_savedVolume|ac\.suspend)/.test(text)) hasMuteOnAd = true;

    // === REQ-4.5.1: RV buttons must have explicit ad+reward text ===
    // Find: onclick = "...showRewarded(...)..." OR addEventListener('click', () => showRewarded())
    // Then look at the HTML element this handler is attached to — does its text content / nearby
    // <span>/<button> contents include an ad keyword and reward indicator?
    //
    // Heuristic A: HTML pattern — <button onclick="showRewarded()">ICON_OR_TEXT</button>
    const htmlBtnRe = /<(button|div|span|a)\b[^>]*\bonclick\s*=\s*["'][^"']*?showRewarded[^"']*?["'][^>]*>([\s\S]*?)<\/\1>/gi;
    let bm;
    while ((bm = htmlBtnRe.exec(text)) !== null) {
      const inner = bm[2];
      // Strip nested tags to get visible text.
      const visible = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const hasAdKw = AD_KEYWORDS.some(k => visible.toLowerCase().includes(k));
      const hasReward = REWARD_INDICATORS.test(visible);
      const lineNo = text.slice(0, bm.index).split('\n').length;
      rvButtons.push({ file, line: lineNo, visible, hasAdKw, hasReward });
    }

    // Heuristic B: JS event-bound buttons: el.onclick = ()=>showRewarded(); — harder to pair with text.
    // Track count to compare with HTML button count below.
    // (Skipped: JS-bound buttons are harder to link to UI text without DOM. Flag ID for manual check.)

    // === REQ-4.4: ads from setInterval / loop without user gesture ===
    const adInLoopRe = /(setInterval|setTimeout|requestAnimationFrame|gameLoop|tick)\s*\([^)]*\)\s*\{[^{}]*?(?:showFullscreenAdv|showInterstitial)/g;
    let am;
    while ((am = adInLoopRe.exec(text)) !== null) {
      const lineNo = text.slice(0, am.index).split('\n').length;
      adFromTimer.push({ file, line: lineNo, snippet: am[0].slice(0, 80) });
    }
    // Simpler pattern: setInterval(()=>showFullscreenAdv())
    const adArrowRe = /(setInterval|setTimeout)\s*\(\s*(?:function\s*\(\)|\(\)\s*=>)\s*\{[^}]*?(?:showFullscreenAdv|showInterstitial|showAd)/g;
    let arm;
    while ((arm = adArrowRe.exec(text)) !== null) {
      const lineNo = text.slice(0, arm.index).split('\n').length;
      adFromTimer.push({ file, line: lineNo, snippet: arm[0].slice(0, 80) });
    }

    // === REQ-4.4 sneaky: interstitial called inside endGame/gameOver/onDeath ===
    // These are STATE-driven (game logic decides), not user-gesture-driven.
    // Yandex moderation rejected Circle 2048 v1 for this exact pattern:
    // "Реклама без пользовательского неигрового действия".
    const stateFns = ['endGame','gameOver','onDeath','onLose','onFail','onGameEnd','handleGameOver','finishGame','die','onDie','playerDied','levelFailed','onLevelFail'];
    const stateFnRe = new RegExp('(?:^|\\n)\\s*(?:function\\s+|\\b)(' + stateFns.join('|') + ')\\s*\\(\\s*\\)\\s*\\{', 'g');
    let sm;
    while ((sm = stateFnRe.exec(text)) !== null) {
      const fnName = sm[1];
      // Slice out the function body (rough — until the matching close brace, capped)
      const start = sm.index + sm[0].length;
      let depth = 1, end = start;
      for (let i = start; i < Math.min(text.length, start + 4000); i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
      }
      // Strip comments — a "// REQ-4.4: do NOT call showInterstitial here"
      // doc-comment must NOT trigger the check.
      const body = text.slice(start, end)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
      if (/(?:Plat\.)?show(?:Interstitial|FullscreenAdv)\s*\(/.test(body)) {
        const lineNo = text.slice(0, sm.index).split('\n').length;
        issues.push({
          id: 'REQ-4.4', level: LEVELS.BLOCKER,
          message: 'Interstitial called from "' + fnName + '" — this is a state-driven function (game logic), not a user gesture. Move the showInterstitial() call to the user-clicked button (Retry/Next Level/Menu) instead.',
          citation: 'Past rejection (Circle 2048): "Реклама без пользовательского неигрового действия". Yandex requires interstitial calls within ~500ms of a user click/tap.',
          url: URL_44, file, line: lineNo
        });
      }
    }

    // === REQ-4.7 + GameplayAPI lifecycle: pause/resume callbacks must call
    // GameplayAPI.stop()/start() (or wrapper equivalent), not just audio. ===
    // Past bug (Circle 2048 v1.4): only audio.suspend/resume in onPause/onResume
    // → Yandex bottom panel showed "Gameplay is stopped" stuck after first ad.
    // Look for handler bodies that match these patterns:
    //   ysdk.on('game_api_pause', () => { ... })           // direct registration
    //   ysdk.onEvent('game_api_pause', () => { ... })      // wrapper variant
    //   Plat.onPause = function() { ... }                  // assignment to wrapper
    //   onPause: function() { ... }  / onPause: () => {... } inside wrapper object
    function checkPauseResumeBody(body, fnLabel, lineNo, expectedCall) {
      const stripped = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      // OK if body itself calls GameplayAPI.start/stop (or wrapper).
      const calls = expectedCall === 'stop'
        ? /(?:GameplayAPI[\s\S]{0,40}\.stop\s*\(|stopGameplay\s*\(|GameplayStop\s*\()/
        : /(?:GameplayAPI[\s\S]{0,40}\.start\s*\(|startGameplay\s*\(|GameplayStart\s*\()/;
      if (calls.test(stripped)) return;
      // OK if body just delegates to a Plat.onPause/onResume style callback —
      // that callback gets checked separately by the assignment-pattern branch.
      const delegates = expectedCall === 'stop'
        ? /(?:Plat|this|self|sdk|wrapper|_this)\s*\.\s*on[\s\S]{0,3}Pause\s*\(|_onPause\s*\(|onPause\s*\(/
        : /(?:Plat|this|self|sdk|wrapper|_this)\s*\.\s*on[\s\S]{0,3}Resume\s*\(|_onResume\s*\(|onResume\s*\(/;
      if (delegates.test(stripped)) return;
      // Audio-only handler with no lifecycle/no delegation — this is the bug.
      issues.push({
        id: 'REQ-4.7-LIFECYCLE', level: LEVELS.BLOCKER,
        message: 'Handler "' + fnLabel + '" suspends/resumes audio but never calls GameplayAPI.' + expectedCall + '() (or wrapper). Yandex platform panel will show "Gameplay is stopped" stuck after first ad. Add Plat.' + (expectedCall === 'stop' ? 'stopGameplay' : 'startGameplay') + '() inside the handler body.',
        citation: 'Past bug (Circle 2048 v1.4): only audio handled in onPause/onResume → bottom-panel indicator never returned to "started" after ad. GameplayAPI.start/stop is the only way to tell the platform whether the player can interact.',
        url: URL_44, file, line: lineNo
      });
    }
    function findPauseResumeHandlers() {
      // Pattern A: ysdk.on('game_api_pause', ...) / .onEvent(...)
      const evRe = /\.\s*(?:on|onEvent)\s*\(\s*['"]game_api_(pause|resume)['"]\s*,\s*(?:function\s*\([^)]*\)|\([^)]*\)\s*=>)\s*\{/g;
      let mh;
      while ((mh = evRe.exec(text)) !== null) {
        const which = mh[1]; // 'pause' or 'resume'
        const start = mh.index + mh[0].length;
        let depth = 1, end = start;
        for (let i = start; i < Math.min(text.length, start + 2000); i++) {
          if (text[i] === '{') depth++;
          else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
        }
        const body = text.slice(start, end);
        const lineNo = text.slice(0, mh.index).split('\n').length;
        checkPauseResumeBody(body, "ysdk.on('game_api_" + which + "')", lineNo, which === 'pause' ? 'stop' : 'start');
      }
      // Pattern B: Plat.onPause = function() { ... } / Plat.onResume = ...
      const assignRe = /\b(?:Plat|Yandex|YandexSDK|SDK)\s*\.\s*on(Pause|Resume)\s*=\s*(?:function\s*\([^)]*\)|\([^)]*\)\s*=>)\s*\{/g;
      while ((mh = assignRe.exec(text)) !== null) {
        const which = mh[1].toLowerCase(); // 'pause' or 'resume'
        const start = mh.index + mh[0].length;
        let depth = 1, end = start;
        for (let i = start; i < Math.min(text.length, start + 2000); i++) {
          if (text[i] === '{') depth++;
          else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
        }
        const body = text.slice(start, end);
        const lineNo = text.slice(0, mh.index).split('\n').length;
        checkPauseResumeBody(body, "Plat.on" + (which === 'pause' ? 'Pause' : 'Resume') + " = function", lineNo, which === 'pause' ? 'stop' : 'start');
      }
    }
    findPauseResumeHandlers();

    // === REQ-3.8 (lang→currency map): hardcoded "ru:'₽', en:'$', ..." ===
    // A common WRONG fix attempt: build a fallback map of lang → currency symbol
    // and show "29 ₽" for RU users when catalog is not loaded. This is still
    // hardcoded currency (REQ-3.8 violation) AND structurally broken — Belarus
    // user sees RU lang but pays in BYN, Kazakhstan in KZT etc. UI MUST show a
    // loader, not fake currency. Detect: object literal mapping lang codes
    // (ru/en/es/...) to currency symbols (₽/$/€/¥/₺/₹).
    {
      const langCurrencyRe = /\{\s*(?:[a-z]{2}\s*:\s*['"][₽$€¥₺₹R₸]['"]?\s*,?\s*){2,}\}/i;
      const m2 = text.match(langCurrencyRe);
      if (m2) {
        const lineNo = text.slice(0, m2.index).split('\n').length;
        issues.push({
          id: 'REQ-3.8', level: LEVELS.BLOCKER,
          message: 'Found a lang→currency symbol mapping object — this is a WRONG fallback for catalog-not-loaded state. Hardcoded currency violates REQ-3.8 AND is structurally wrong (BY user on RU lang pays BYN, not RUB). Show "Loading..." in UI instead.',
          citation: 'REQ-3.8: валюта должна обозначаться автоматически. Currency depends on user account country — NOT UI language. Use Plat.isCatalogReady() to gate IAP price display behind a loader.',
          url: URL_38, file, line: lineNo
        });
      }
    }

    // === REQ-3.8 (text-currency): hardcoded YAN / RUB / USD / EUR text ===
    // Yandex's "abstract" currency code shown when SDK can't resolve real
    // currency. Past rejection (Driftworld v1.9): "29 YAN" hardcoded in IAP
    // catalog fallback → moderation rejected for "валюта должна обозначаться
    // автоматически" (п.3.8). The fix is to use priceValue + getPriceCurrencyImage().
    {
      const linesArr2 = text.split('\n');
      for (let i = 0; i < linesArr2.length; i++) {
        const line = linesArr2[i];
        if (/^\s*(\/\/|\/\*|\*)/.test(line)) continue; // skip comments
        // Match: digit(s) followed by space and currency code
        //   "29 YAN", "49 RUB", "99 USD", "149 EUR"
        // or quoted: "'29 YAN'" — tolerated in source where it's the literal string.
        const m = line.match(/(?:^|[^A-Za-z0-9_$])(\d{1,5})\s+(YAN|RUB|USD|EUR|GBP|JPY|CNY)\b/i);
        if (m) {
          // Don't flag SDK-related code (the wrapper itself defines these constants)
          if (/getPriceCurrency|priceCurrencyCode|currencyCodes\s*=|YAN_/.test(line)) continue;
          issues.push({
            id: 'REQ-3.8', level: LEVELS.BLOCKER,
            message: 'Hardcoded currency text "' + m[1] + ' ' + m[2].toUpperCase() + '" next to a number. Yandex requires currency to be rendered via getPriceCurrencyImage() so it auto-localizes (₽ for RU, $ for US etc). Past rejection (Driftworld v1.9): "29 YAN" in IAP catalog fallback was rejected for п.3.8 "валюта должна обозначаться автоматически".',
            citation: 'https://yandex.ru/dev/games/doc/ru/concepts/requirements (п. 3.8) — валюта должна обозначаться автоматически.',
            url: URL_38, file, line: i + 1
          });
          break; // one is enough — usually it's a list of items in a row
        }
      }
    }

    // === REQ-3.8: hardcoded currency next to a number ===
    // Match: digits + currency symbol (or vice versa).
    // Don't flag inside comments.
    const linesArr = text.split('\n');
    for (let i = 0; i < linesArr.length; i++) {
      const line = linesArr[i];
      // Skip comment-only lines
      if (/^\s*(\/\/|\/\*|\*)/.test(line)) continue;
      // Skip lines defining a getter or returning currency from SDK
      if (/getCurrency|getPriceCurrency|priceCurrencyCode/.test(line)) continue;
      // Pattern: 100₽ / 100$ / 100€ / 100¥ / 100¢ OR ₽100 / $100 / €100
      // Allow + - in front, allow comma/dot decimals.
      // For `$`: be strict — `$1`/`$2` are i18n placeholders, `${...}` is JS
      // template literal, neither is currency. Real prices: `$100`, `$1.99`, `$1,000`.
      const m = line.match(
        /(?:^|[^A-Za-z0-9])([+\-]?\d(?:[\d.,]*\d)?\s?[₽€¥¢])|([₽€¥¢]\s?\d(?:[\d.,]*\d)?)|(?:^|[^A-Za-z0-9])([+\-]?\d(?:[\d.,]*\d)?\s?\$)(?!\{)|(\$\s?\d{2,}(?:[.,]\d+)?)|(\$\s?\d[.,]\d+)/
      );
      if (m) {
        const raw = (m[1] || m[2] || m[3] || m[4] || m[5]).trim();
        // Extra guard: skip if the `$` in the snippet is part of a template
        // literal `${...}` or i18n placeholder `$N` followed by space/letter.
        const dollarIdx = raw.indexOf('$');
        if (dollarIdx >= 0) {
          const afterIdx = line.indexOf(raw) + dollarIdx + 1;
          const next = line[afterIdx];
          if (next === '{') continue;          // ${...} template literal
        }
        hardcodedCurrency.push({ file, line: i + 1, value: raw });
        if (hardcodedCurrency.length > 30) break; // cap
      }
    }
  }

  // Emit RV button issues.
  if (hasShowRewarded && rvButtons.length === 0) {
    issues.push({
      id: 'REQ-4.5.1', level: LEVELS.WARNING,
      message: 'showRewarded() is called somewhere but no HTML button with onclick="showRewarded(...)" found. JS-bound RV buttons cannot be auto-checked — verify text is explicit (must say "ad" + reward).',
      citation: '"Кнопка вызова RV должна быть привязана к тексту, который однозначно отображает, что пользователю будет показана реклама за вознаграждение" (4.5.1)',
      url: URL_45, file: workPath
    });
  } else {
    for (const btn of rvButtons) {
      if (!btn.hasAdKw) {
        issues.push({
          id: 'REQ-4.5.1', level: LEVELS.BLOCKER,
          message: 'RV button text "' + btn.visible.slice(0, 80) + '" — no ad/реклама/watch keyword. Past rejection (DeepWorld): "Маленький значок RV недостаточно очевидный".',
          citation: '"text must communicate the user will watch an ad for reward" (4.5.1)',
          url: URL_45, file: btn.file, line: btn.line
        });
      }
      if (!btn.hasReward) {
        issues.push({
          id: 'REQ-4.5.1', level: LEVELS.WARNING,
          message: 'RV button text "' + btn.visible.slice(0, 80) + '" — no explicit reward (no +N coin/life/gold). Should say what user gets.',
          citation: '"...communicate what specific reward the user will receive" (4.5.1)',
          url: URL_45, file: btn.file, line: btn.line
        });
      }
    }
  }

  // Ads from timer/loop.
  for (const a of adFromTimer) {
    issues.push({
      id: 'REQ-4.4', level: LEVELS.BLOCKER,
      message: 'Ad call from timer/loop without user gesture: "' + a.snippet + '". Past rejection (Circle 2048): "Реклама без пользовательского неигрового действия".',
      citation: 'Ads must follow a logical pause triggered by user action (4.4)',
      url: URL_44, file: a.file, line: a.line
    });
  }

  // Hardcoded currency (down-grade if game has no IAP).
  if (hardcodedCurrency.length > 0) {
    const hasPayments = files.some(f => {
      const t = readTextSafe(f);
      return t && /getPayments\s*\(/.test(t);
    });
    const level = hasPayments ? LEVELS.BLOCKER : LEVELS.INFO;
    const sample = hardcodedCurrency.slice(0, 5).map(c => c.value).join(', ');
    const more = hardcodedCurrency.length > 5 ? ' (+' + (hardcodedCurrency.length - 5) + ' more)' : '';
    issues.push({
      id: 'REQ-3.8', level,
      message: 'Hardcoded currency symbol(s) found: ' + sample + more + '. ' + (hasPayments ? 'Game has IAP — must use SDK currency methods (getPriceCurrencyCode/getPriceCurrencyImage). Past rejection (DriftWorld): п. 3.8.' : 'No IAP detected — using ₽/$/€ in display text is OK if you do not show prices to user.'),
      citation: '"Портальная валюта определяется автоматически, для ее обозначения используются методы SDK" (3.8)',
      url: URL_38, file: hardcodedCurrency[0].file, line: hardcodedCurrency[0].line
    });
  }

  // REQ-4.7: pause+mute on ad
  if ((hasShowRewarded || hasShowFullscreen) && !hasMuteOnAd) {
    issues.push({
      id: 'REQ-4.7', level: LEVELS.BLOCKER,
      message: 'Ad calls present but no audio mute logic detected (no AudioContext.suspend() or muteForAd helper).',
      citation: '"При показе полноэкранной рекламы звук в игре и игровой процесс должны ставиться на паузу" (4.7)',
      url: URL_45, file: workPath
    });
  }
  if ((hasShowRewarded || hasShowFullscreen) && !hasGameApiPause) {
    issues.push({
      id: 'REQ-4.7', level: LEVELS.WARNING,
      message: 'Ad calls present but no game_api_pause / onPause hook detected. Verify game logic pauses during ads.',
      citation: 'REQ-4.7',
      url: URL_45, file: workPath
    });
  }

  return issues;
}

if (isMain(import.meta.url)) {
  runCli({ ID, validate });
}
