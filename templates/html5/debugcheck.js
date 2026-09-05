/**
 * Yandex Games Debug Checker v2.25
 * ─────────────────────────────────
 * Universal overlay that verifies SDK integration.
 * Activation: Press Ctrl+Shift+2 three times.
 *
 * PLACEMENT: In <head>, AFTER <script src="/sdk.js"> but BEFORE game scripts!
 *   (example HTML — "script" tags unescaped in the comment would break
 *    inlined builds; keep them escaped here and in any docstring)
 *   <script src="/sdk.js"><\/script>
 *   <script src="debugcheck.js"><\/script>  ← HERE
 *   <script src="game.js"><\/script>
 *
 * ⚠️ If placed before <\/body> — timing probes load AFTER game and miss GameReady!
 * Before release: remove the script tag and this file.
 *
 * ─────────────────────────────────
 * v2.25 — Sep 2026: event checks stop at the actual handler boundary; unrelated statements and quoted/commented actions cannot grant PASS. Overlay and standalone HTML share contract regressions.
 * v2.24 — Sep 2026: requirements refresh from 18.08.2026: +1.2/1.2.1 Yandex-ID-only auth and benefit copy, +1.3 any-focus-loss audio coverage, stronger 1.6.2.4 physical-key check, +1.9 destructive rotation reset warning, stricter 1.10 rotation binding.
 * v2.23 — Aug 2026: +3.5 brand-word check (Яндекс/Yandex in game texts), +1.8 touch-target static hint, +4.5.1 RV button must state the REWARD not a bare number.
 * v2.22 — Aug 2026: +static check for leftover dev tools in the build (seed field, AI selector, speed, measurement panel) → WARN per REQ-1.15.
 * v2.21 — Jul 2026: Event Timeline VERDICTS the order (click-vs-ready 1.19, lang-vs-click 2.14, lang-vs-ready, ready-vs-init) + ORDER FAIL badge — panel knew the expected order but never checked it.
 * v2.20 — Jul 2026: +REQ-1.19 input-before-ready detection (runtime FAIL + static gate check) — field rejection case app-553975 (click 1143ms vs ready 2535ms).
 * v2.19 — Jul 2026: +keyboard layout-independence check (e.key==='w' without e.code → WARN: dead controls in ru layout).
 * v2.18 — Jul 2026: +flat-black letterbox check (centered fixed-width stage + pure-black body, no gradient/pattern → WARN; full-viewport games N/A). Pairs with visual-upgrade Step 0.7 desktop-layout doctrine.
 * v2.17 — Jul 2026: I18N-USE parity (tyl case): runtime instrumentation registers the FACT game reads ysdk.environment.i18n.lang (panel "I18n is used"); static check detectLang URL-before-SDK order; legacy Sound-toggle heuristic aligned with реком.6.2 (no contradicting verdicts).
 * v2.16 — Jul 2026: +4 advisory checks from NEW Section 6 "Рекомендуемые" (07.2026 doc): 6.2 sound-toggle, 6.3 pause, 6.5 title w/o "игра/game", 6.7 no exit button. All WARN; quality now matters (2.13: rating ≤30 3wks → unpublished).
 * v2.15 — Jun 2026: +7 checks from full requirements audit — 1.6.1.1 fullscreen, 1.6.2.2 aspect, 1.6.2.6 OS-keys, 1.15 WIP-text, 1.16 fake-ad, 3.9 youtube, 4.3 ad-orientation, 8.2.4 profanity. All WARN except 3.9 (FAIL).
 * v2.14 — Jun 2026: +lang/ready ordering check (2.14/1.19) — input bound at DOMContentLoaded while detectLang/ready deferred into init().then() = "after game playable" (Hexfront case). WARN.
 * v2.13 — Jun 2026: +music-via-Web-Audio check (1.6.1.6/1.6.2.5) — new Audio()/<audio loop>/MediaSession surfaces the OS media player (Hexfront case). WARN with Web Audio fix guidance.
 * v2.12 — Jun 2026: +canvas resize on orientationchange/fullscreenchange (п.1.6.1.3/1.10.1) — WebGL/canvas games that only bind window.resize deform/clip on mobile rotate & fullscreen-exit (parkour case).
 * v2.11 — Jun 2026: fix two false-FAILs — keyboard 1.6.1.2 (native text input shows keyboard on tap; only fail if suppressed) + anti-gaming now WARN not hard-FAIL (Probe E is source of truth).
 * v2.10 — Jun 2026: anti-gaming integrity check (flag timer tuned to pass checker before ready) + pairs with runtime Probe E (un-gameable ready-timing: loading-visible-at-ready).
 * v2.9 — Jun 2026: 1.19.2 GameReady timing — flag ready() too-early (before content) AND too-late (after gameplay), 90s window.
 * v2.8 — Jun 2026: 4.4/4.5 ad-gesture threshold tightened 500ms->330ms (Yandex limit 0.33s).
 * v2.7 — Jun 2026: +WebGL-notice (1.6.1.7), system-video-player (1.6.1.6/2.5),
 *        keyboard-on-input (1.6.1.2), URL-gating (1.18), progress-before-ad (4.2).
 * v2.6 — Apr 2026 (false-positive purge):
 *   • Self-detection fix: `getSource()` now strips DEBUGCHECK_SELF_*
 *     and CHEATS_SELF_* marker blocks before scanning. Without this,
 *     debugcheck's own regex literals (e.g. /alert\(/, /let\s+_lang/)
 *     matched themselves in the inlined source → 6+ false-positive FAILs
 *     for marketing builds (alert/confirm/prompt/eval/let_lang/IAP-found).
 *   • {pass,details} return shape: runChecks now supports rich check
 *     results (pass:'warn'|true|false + custom details string) so v2.5
 *     IAP guards stop showing as FAIL when a game has no IAP.
 *   • Optional category presence: only `result===true` counts as
 *     "feature in use" (guard checks tagged guard:true skipped). Prevents
 *     IAP category from rendering as "all-FAIL" when game has no payments.
 *   • All-13-langs: now matches unquoted `ru:{` form too (Circle 2048
 *     pattern), not only quoted `'ru':` and `I18N.ru =`.
 *   • Yandex lang fallback: recognises array form `['be','kk','uk','uz']`
 *     in addition to LANG_FALLBACK constants and inline cases.
 *   • Cyrillic-on-non-RU: visibility check walks ancestors (was checking
 *     only immediate parent — text inside `display:none` overlays was
 *     incorrectly flagged because parent <h1> itself was display:block).
 *   • GameReady-after-paint: same-frame timing downgraded from FAIL to
 *     WARN (single-file games on local server can't separate the events).
 *
 * v2.5 — Apr 2026:
 *   • Pre-Submit Banner: panel auto-fetches `.pre-submit-report.json` and
 *     shows static-validator verdict alongside runtime checks (single pane
 *     of glass — see what scripts/pre-submit.mjs decided + runtime delta).
 *   • IAP gap: added getCatalog() check (REQ-1.13/3.8), hardcoded currency
 *     scan (REQ-3.8), and IAP-PERMIT marker check (BattleFront rejection).
 *
 * ─────────────────────────────────
 * NOT YET IMPLEMENTED (intentional gaps — manual verification still required):
 *   B. REQ-1.9 full save round-trip — v2.24 flags destructive rotation handlers,
 *      but proving setData → rotate/reload → exact state equality still requires
 *      a game-specific state contract. Currently manual: play, rotate, refresh, check.
 *   C. REQ-1.13.5 purchase applies — runtime probe could hook purchase().then()
 *      and diff state, but requires per-game knowledge of what "purchased item
 *      arrived" looks like. Currently manual.
 *   D. REQ-4.5.2 RV-not-mandatory — would need to count RV-gated state
 *      transitions and flag if any progress path requires watching one.
 *      Currently manual.
 *   E. Per-language screenshot reminder — checklist UI of which langs already
 *      have generated screenshots. Currently external (game-screenshot-ext).
 *   See backlog in debugcheck-enhance skill / CLAUDE.md "ручная проверка".
 */
// === DEBUGCHECK_SELF_START === (do not remove — used by getSource() to strip self from scan)
(function(){
'use strict';

// ── Activation: Ctrl+Shift+2 × 3 ──────────────────────────────
let _seq=0, _timer=null;
document.addEventListener('keydown',function(e){
  if(e.ctrlKey&&e.shiftKey&&(e.key==='2'||e.key==='@')){
    e.preventDefault();
    _seq++;
    clearTimeout(_timer);
    if(_seq>=3){_seq=0;togglePanel();}
    else{_timer=setTimeout(function(){_seq=0;},1500);}
  }
});

// ── Activation: tap/click on #game-version ────────────────────
(function initVersionTap(){
  var el=document.getElementById('game-version');
  if(!el){document.addEventListener('DOMContentLoaded',function(){initVersionTap();});return;}
  el.style.pointerEvents='auto';el.style.cursor='pointer';
  el.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();togglePanel();});
  el.addEventListener('touchstart',function(e){e.preventDefault();e.stopPropagation();togglePanel();},{passive:false});
})();

let _panel=null, _visible=false;

function togglePanel(){
  if(_panel){_visible=!_visible;_panel.style.display=_visible?'flex':'none';if(_visible)runChecks();return;}
  _visible=true;
  createPanel();
  runChecks();
}

// ── Runtime SDK tracker ─────────────────────────────────────────
const RT={
  calls:new Set(),
  errors:[],
  warnings:[],
  track:function(name){this.calls.add(name);}
};

// ── Runtime Timing Probes ────────────────────────────────────────
const TIMING={
  domReady:0,firstPaint:0,fontsLoaded:0,sdkInit:0,
  gameReady:0,gameplayStart:0,langDetected:0,
  firstAdShown:0,firstUserClick:0,firstInterstitial:0,
  log:[],
  record:function(event){
    var t=performance.now();
    this[event]=t;
    this.log.push({event:event,time:t,delta:t-(this.domReady||0)});
  }
};
document.addEventListener('DOMContentLoaded',function(){TIMING.record('domReady');});
window.addEventListener('load',function(){TIMING.record('firstPaint');});
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(function(){TIMING.record('fontsLoaded');});
// "First user click" tracking — used by REQ-2.14 check (langDetected must
// happen BEFORE first user interaction). Skip OUR OWN debug-panel hotkey
// (Ctrl+Shift+2) so opening the panel doesn't trick the test into thinking
// the user is interacting with the game.
function _isOwnHotkey(e) {
  return e && e.ctrlKey && e.shiftKey && (e.key === '2' || e.key === '@');
}
['click','touchstart','keydown'].forEach(function(evt){
  document.addEventListener(evt,function handler(e){
    if (_isOwnHotkey(e)) return; // ignore Ctrl+Shift+2 (debug panel hotkey)
    if(!TIMING.firstUserClick)TIMING.record('firstUserClick');
    document.removeEventListener(evt,handler);
  },{once:false}); // can't be once:true — must allow re-firing if first event was our hotkey
});
// v2.4: track EVERY user gesture for ad-context probe (not just the first one).
TIMING.lastUserGesture=0;
TIMING.adCalls=[]; // {type, time, gestureDelta}
['click','touchstart','keydown'].forEach(function(evt){
  document.addEventListener(evt,function(e){
    if (_isOwnHotkey(e)) return;
    TIMING.lastUserGesture=performance.now();
  },{capture:true,passive:true});
});
// v2.6: expose TIMING and RT (defined later) on window via lazy getters so external
// tools (scripts/runtime-test.mjs, e2e tests) can read state without breaking encapsulation.
// IIFE-internal reads/writes still go through the local references; the window aliases
// are read-only views. Added because runtime-test.mjs needs to inspect TIMING.adCalls
// after triggering state-driven game functions (REQ-4.4 violation detection).
window.__dbg = window.__dbg || {};
Object.defineProperty(window.__dbg, 'TIMING', { get: function(){ return TIMING; }, configurable: true });
Object.defineProperty(window.__dbg, 'RT',     { get: function(){ return RT; },     configurable: true });
// Monkey-patch SDK methods to record timing
// Strategy: intercept YaGames.init() to catch ysdk the moment it's created,
// PLUS poll every 50ms for ysdk/YandexSDK/Plat objects as fallback.

function _patchYSDK(sdk){
  if(!sdk||TIMING._patched)return;
  try{
    // Patch LoadingAPI.ready()
    if(sdk.features&&sdk.features.LoadingAPI&&sdk.features.LoadingAPI.ready){
      var _r=sdk.features.LoadingAPI.ready;
      sdk.features.LoadingAPI.ready=function(){
        TIMING.record('gameReady');
        console.log('[DBG] LoadingAPI.ready() caught at +'+Math.round(TIMING.gameReady-TIMING.domReady)+'ms');
        return _r.apply(this,arguments);
      };
    }
    // Patch GameplayAPI.start()
    if(sdk.features&&sdk.features.GameplayAPI&&sdk.features.GameplayAPI.start){
      var _s=sdk.features.GameplayAPI.start;
      sdk.features.GameplayAPI.start=function(){
        TIMING.record('gameplayStart');
        return _s.apply(this,arguments);
      };
    }
    // Patch showFullscreenAdv
    if(sdk.adv&&sdk.adv.showFullscreenAdv){
      var _f=sdk.adv.showFullscreenAdv;
      sdk.adv.showFullscreenAdv=function(cfg){
        var now=performance.now();
        var gestureDelta=TIMING.lastUserGesture?(now-TIMING.lastUserGesture):Infinity;
        TIMING.adCalls.push({type:'interstitial',time:now,gestureDelta:gestureDelta});
        if(!TIMING.firstInterstitial)TIMING.record('firstInterstitial');
        if(!TIMING.firstUserClick||gestureDelta>330){
          TIMING.log.push({event:'AD_WITHOUT_GESTURE',time:now,gestureDelta:Math.round(gestureDelta),warning:'Interstitial called >330ms after user gesture (or before any) — REQ-4.4 risk'});
          console.warn('[DBG] showFullscreenAdv called '+Math.round(gestureDelta)+'ms after last user gesture — likely REQ-4.4 violation');
        }
        return _f.apply(this,arguments);
      };
    }
    // Patch showRewardedVideo (v2.4)
    if(sdk.adv&&sdk.adv.showRewardedVideo){
      var _r2=sdk.adv.showRewardedVideo;
      sdk.adv.showRewardedVideo=function(cfg){
        var now=performance.now();
        var gestureDelta=TIMING.lastUserGesture?(now-TIMING.lastUserGesture):Infinity;
        TIMING.adCalls.push({type:'rewarded',time:now,gestureDelta:gestureDelta});
        if(gestureDelta>330){
          TIMING.log.push({event:'RV_WITHOUT_GESTURE',time:now,gestureDelta:Math.round(gestureDelta),warning:'Rewarded video called >330ms after gesture — must be user-initiated (REQ-4.5)'});
          console.warn('[DBG] showRewardedVideo called '+Math.round(gestureDelta)+'ms after last user gesture — REQ-4.5 risk');
        }
        return _r2.apply(this,arguments);
      };
    }
    // Patch environment.i18n.lang access
    if(sdk.environment&&sdk.environment.i18n){
      var _origLang=sdk.environment.i18n.lang;
      try{
        Object.defineProperty(sdk.environment.i18n,'lang',{
          get:function(){if(!TIMING.langDetected)TIMING.record('langDetected');return _origLang;},
          configurable:true
        });
        // REQ-2.14 hardening: the moment SDK is ready, lang IS available — record
        // langDetected proactively, regardless of when the game gets around to
        // reading it. Otherwise an impatient user (e.g. opening debug panel via
        // hotkey before init finishes) would race ahead and the check fails
        // even though the game uses lang correctly.
        if(!TIMING.langDetected) TIMING.record('langDetected');
      }catch(e){/* some environments don't allow defineProperty */}
    }
    TIMING._patched=true;
    TIMING.record('sdkPatched');
    console.log('[DBG] SDK methods patched successfully');
  }catch(e){console.warn('[DBG] Patch error:',e);}
}

// Method 1: Intercept YaGames.init() BEFORE game calls it
if(typeof YaGames!=='undefined'&&YaGames.init){
  var _origInit=YaGames.init;
  YaGames.init=function(){
    TIMING.record('sdkInit');
    return _origInit.apply(this,arguments).then(function(sdk){
      // Catch ysdk the MOMENT it's created — before game code gets it
      _patchYSDK(sdk);
      // [v2.17] I18N-USE parity with Yandex debug panel: register the FACT that game code
      // reads sdk.environment.i18n.lang at runtime. Static presence of the string is not use —
      // tyl case: URL-first detectLang made the SDK read dead code → panel said "I18n is not used".
      try{
        if(sdk&&sdk.environment&&sdk.environment.i18n){
          var _i18n=sdk.environment.i18n, _lang0=_i18n.lang;
          RT._i18nRead=false;
          var patched={};
          Object.keys(_i18n).forEach(function(k){ if(k!=='lang')patched[k]=_i18n[k]; });
          Object.defineProperty(patched,'lang',{get:function(){RT._i18nRead=true;return _lang0;},enumerable:true});
          try{ Object.defineProperty(sdk.environment,'i18n',{get:function(){return patched;},configurable:true}); }
          catch(e){ /* environment может быть frozen — тогда факт не измерим, чек станет N/A */ RT._i18nRead=null; }
        }
      }catch(e){ RT._i18nRead=null; }
      return sdk;
    });
  };
  console.log('[DBG] YaGames.init() intercepted');
}

// Method 2: Poll for ysdk/YandexSDK/Plat every 50ms as fallback
var _pollCount=0;
var _pollTimer=setInterval(function(){
  _pollCount++;
  // Direct ysdk global
  if(window.ysdk&&!TIMING._patched)_patchYSDK(window.ysdk);
  // YandexSDK wrapper (stores _ysdk internally)
  if(window.YandexSDK&&YandexSDK._ysdk&&!TIMING._patched)_patchYSDK(YandexSDK._ysdk);
  // Plat object (another common wrapper)
  if(window.Plat&&Plat.ysdk&&!TIMING._patched)_patchYSDK(Plat.ysdk);
  if(window.Plat&&Plat._ysdk&&!TIMING._patched)_patchYSDK(Plat._ysdk);
  // Stop after 30 seconds (600 × 50ms)
  if(TIMING._patched||_pollCount>600)clearInterval(_pollTimer);
},50);

// Hook console.error/warn for tracking
const _origErr=console.error, _origWarn=console.warn;
console.error=function(){RT.errors.push(Array.from(arguments).join(' '));_origErr.apply(console,arguments);};
console.warn=function(){RT.warnings.push(Array.from(arguments).join(' '));_origWarn.apply(console,arguments);};

// Probe SDK state — runs on background + fresh on each check
function probeRuntime(){
  if(typeof YaGames!=='undefined')RT.track('YaGames global found');
  if(window.ysdk)RT.track('ysdk global found');
  if(window.Plat){
    RT.track('Plat object found');
    if(Plat.ysdk)RT.track('Plat.ysdk initialized');
    if(Plat.player)RT.track('Plat.player loaded');
    if(Plat._devMode)RT.track('Dev mode active');
  }
  if(window.YandexSDK){
    RT.track('YandexSDK wrapper found');
    if(YandexSDK._initialized)RT.track('YandexSDK initialized');
  }
}
setTimeout(probeRuntime,1000);
setTimeout(probeRuntime,3000);
setTimeout(probeRuntime,6000);

// ── Auto-report critical issues to console ────────────────────
setTimeout(function(){
  var issues=[];
  if(TIMING.firstUserClick&&TIMING.sdkInit&&TIMING.firstUserClick<TIMING.sdkInit){
    issues.push('⚠️ USER CLICKED BEFORE SDK INIT! (click: '+Math.round(TIMING.firstUserClick)+'ms, sdk: '+Math.round(TIMING.sdkInit)+'ms, gap: '+Math.round(TIMING.sdkInit-TIMING.firstUserClick)+'ms)');
  }
  if(TIMING.langDetected&&TIMING.firstUserClick&&TIMING.langDetected>TIMING.firstUserClick){
    issues.push('⚠️ LANGUAGE DETECTED AFTER USER INTERACTION! (lang: '+Math.round(TIMING.langDetected)+'ms, click: '+Math.round(TIMING.firstUserClick)+'ms)');
  }
  if(TIMING.firstUserClick&&TIMING.gameReady&&TIMING.firstUserClick<TIMING.gameReady){
    issues.push('🚫 ОТКАЗ 1.19: ВВОД ПРИНЯТ ДО ready()! (клик: '+Math.round(TIMING.firstUserClick)+'ms, ready: '+Math.round(TIMING.gameReady)+'ms, окно: '+Math.round(TIMING.gameReady-TIMING.firstUserClick)+'ms). Игра доступна для играния РАНЬШЕ, чем сказала ready() — модератор кликами проскакивает загрузку. Фикс: флаг inputEnabled=false до резолва ready(), все обработчики первым делом проверяют его.');
  }
  if(TIMING.gameReady&&TIMING.sdkInit&&TIMING.gameReady<TIMING.sdkInit){
    issues.push('⚠️ GameReady() BEFORE SDK init! (ready: '+Math.round(TIMING.gameReady)+'ms, sdk: '+Math.round(TIMING.sdkInit)+'ms)');
  }
  // REQ-1.19.2: ready() must fire WHEN the game is interactive — not too early (while a
  // progress bar / black screen / throbber is still showing) and not several seconds late.
  // We can't see "interactive" directly, but we approximate:
  //  - too EARLY: ready() before first meaningful content paint (firstPaint/fontsLoaded)
  //  - too LATE: ready() fires noticeably after gameplay already started
  if(TIMING.gameReady&&TIMING.fontsLoaded&&TIMING.gameReady<TIMING.fontsLoaded-50){
    issues.push('⚠️ GameReady() likely TOO EARLY — ready() at '+Math.round(TIMING.gameReady)+'ms but fonts/content not ready until '+Math.round(TIMING.fontsLoaded)+'ms. Yandex 1.19.2: green only when game is interactive (no progress bar/black screen).');
  }
  if(TIMING.gameReady&&TIMING.gameplayStart&&TIMING.gameReady>TIMING.gameplayStart+1000){
    issues.push('⚠️ GameReady() TOO LATE — gameplay started at '+Math.round(TIMING.gameplayStart)+'ms but ready() not until '+Math.round(TIMING.gameReady)+'ms (>1s late). Yandex 1.19.2: green must appear AS the game becomes interactive, not seconds after.');
  }
  if(TIMING.gameReady&&(TIMING.gameReady-TIMING.domReady)>90000){
    issues.push('⚠️ GameReady() after 90s — Yandex marks the game as "ready not implemented" past 90s.');
  }
  if(!TIMING.gameReady){
    issues.push('⚠️ LoadingAPI.ready() NOT CALLED after 8 seconds! (Yandex 1.19.2 — red after 90s = not implemented)');
  }
  if(issues.length>0){
    console.warn('%c[DEBUGCHECK] '+issues.length+' TIMING ISSUES DETECTED:','color:#ff4040;font-weight:bold;font-size:14px');
    issues.forEach(function(i){console.warn('[DEBUGCHECK] '+i);});
    console.warn('[DEBUGCHECK] Open panel: Ctrl+Shift+2 (×3) for full report');
  }
},8000);

// ── Check definitions ───────────────────────────────────────────
function pat(s,r){return r.test(s);}

function sourceWithoutComments(s){
  return String(s||'').replace(/\/\*[\s\S]*?\*\//g,'').replace(/^[\t ]*\/\/.*$/gm,'');
}

function hasAudioSource(s){
  return pat(sourceWithoutComments(s),/AudioContext|webkitAudioContext|new\s+Audio\s*\(|<audio\b|Howl\s*\(|Tone\./i);
}

function hasAudioPauseAction(s){
  return pat(s,/\.suspend\s*\(|\.pause\s*\(|suspendAudio|pauseAudio|pauseAppAudio|muteAll|muteSound|muteAudio|setMuted|volume\s*=\s*0/i);
}

// EVENT_HANDLER_SCAN_START — keep both standalone checker surfaces identical.
/** Blank strings/comments without changing offsets; templates are deliberately opaque. */
function maskHandlerText(s){
  return String(s).replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g,function(m){return m.replace(/[^\r\n]/g,' ');});
}
/** Extract only this event registration/assignment, never unrelated statements after it. */
function extractEventBlock(s,startRegex){
  var m=s.match(startRegex);
  if(!m)return null;
  var raw=s.slice(m.index),masked=maskHandlerText(raw);
  var call=masked.indexOf('addEventListener');
  var start=call>=0&&call<m[0].length?masked.indexOf('(',call):-1;
  var assignment=start<0,depth=0,braces=0,brackets=0;
  if(assignment)start=masked.indexOf('=');
  if(start<0)return null;
  for(var i=start;i<Math.min(masked.length,start+20000);i++){
    var ch=masked[i];
    if(ch==='(')depth++;
    else if(ch===')'){
      depth--;
      if(!assignment&&depth===0)return masked.slice(0,i+1);
    }else if(ch==='{')braces++;
    else if(ch==='}')braces--;
    else if(ch==='[')brackets++;
    else if(ch===']')brackets--;
    else if(assignment&&ch===';'&&depth===0&&braces===0&&brackets===0)return masked.slice(0,i);
    if(depth<0||braces<0||brackets<0)return null;
  }
  return assignment&&depth===0&&braces===0&&brackets===0?masked:null;
}
// EVENT_HANDLER_SCAN_END

function extractBlock(s,startRegex){
  var m=s.match(startRegex);
  if(!m)return null;
  return s.slice(m.index,m.index+800);
}

var CATS=[
  {id:'sdk',title:'SDK Integration',icon:'\u{1F4E6}',checks:[
    {name:'SDK script tag',desc:'/sdk.js in head',
      test:function(s){return pat(s,/<script[^>]*src=["']\/sdk\.js["'][^>]*>/i);}},
    {name:'YaGames.init()',desc:'SDK initialization',
      test:function(s){return pat(s,/YaGames\.init\s*\(/);}},
  ]},
  {id:'lifecycle',title:'Lifecycle API',icon:'\u{1F504}',checks:[
    {name:'LoadingAPI.ready()',desc:'Called when game loaded',
      test:function(s){return pat(s,/LoadingAPI[\s\S]{0,4}ready\s*\(/);}},
    {name:'GameplayAPI.start()',desc:'Called on gameplay start',
      test:function(s){return pat(s,/GameplayAPI[\s\S]{0,4}start\s*\(/);}},
    {name:'GameplayAPI.stop()',desc:'Called on pause/end',
      test:function(s){return pat(s,/GameplayAPI[\s\S]{0,4}stop\s*\(/);}},
  ]},
  {id:'auth',title:'Authorization',icon:'\u{1F511}',checks:[
    {name:'Only Yandex ID authorization (п.1.2)',desc:'No third-party identity provider or custom OAuth flow in the game.',
      test:function(s){
        var c=sourceWithoutComments(s);
        var explicit=pat(c,/firebase\s*\.\s*auth\s*\(|GoogleAuthProvider|google\s*\.\s*accounts\s*\.\s*id\s*\.(?:initialize|prompt|renderButton)|FB\s*\.\s*login\s*\(|VKID\s*\.\s*(?:Auth|Config)|VKWebAppGetAuthToken|AppleID\s*\.\s*auth|auth0\s*\.\s*(?:loginWithRedirect|authorize)|discord(?:app)?\.com\/(?:api\/)?oauth2\/authorize|steamcommunity\.com\/openid/i);
        if(explicit)return false;
        return pat(c,/\/api\/auth\/|oauth2\/authorize|openid\/login/i)?'warn':true;
      },warnText:'Найден собственный/generic OAuth endpoint. Проверь вручную: в Яндекс Играх допустима только авторизация через Яндекс ID, запрошенная через SDK.',
      failText:'Найдена сторонняя авторизация. Удали Google/Facebook/VK/Apple/Auth0/Discord/Steam login: допустим только Яндекс ID через SDK Яндекс Игр.'},
    {name:'Yandex ID dialog is user-initiated (п.1.2)',desc:'auth.openAuthDialog() must follow an explicit click/tap, never run automatically at startup.',
      test:function(s){
        var c=sourceWithoutComments(s);
        if(!pat(c,/openAuthDialog\s*\(/))return true;
        var direct=pat(c,/(?:onclick\s*=|addEventListener\s*\(\s*['"](?:click|pointerup|touchend)['"])[\s\S]{0,700}openAuthDialog\s*\(/i);
        var named=c.match(/function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{[\s\S]{0,500}?openAuthDialog\s*\(/i);
        var bound=named&&new RegExp("addEventListener\\s*\\(\\s*['\"](?:click|pointerup|touchend)['\"]\\s*,\\s*"+named[1].replace(/[$]/g,'\\$&'), 'i').test(c);
        return direct||bound?true:'warn';
      },warnText:'auth.openAuthDialog() найден, но checker не видит привязку к click/tap. Не открывай авторизацию автоматически при загрузке — вызывай её только из явного действия игрока.'},
    {name:'Authorization offer explains its benefit (п.1.2.1)',desc:'The login prompt says what the player gains: cloud progress, sync or leaderboard identity.',
      test:function(s){
        var c=sourceWithoutComments(s);
        if(!pat(c,/openAuthDialog\s*\(/))return true;
        return pat(c,/сохран[а-яё]{0,12}[^<\n]{0,50}прогресс|синхрониз|облачн(?:ое|ые|ая)[^<\n]{0,30}(?:сохран|прогресс)|друг(?:ом|их)[^<\n]{0,30}устройств|таблиц[^<\n]{0,20}лидер|save[^<\n]{0,30}progress|cloud[^<\n]{0,30}save|sync[^<\n]{0,30}(?:progress|device)|leaderboard/i)?true:'warn';
      },warnText:'Предложение входа не объясняет пользу. Добавь нейтральный текст вроде «Войдите, чтобы сохранять прогресс в облаке и продолжать на другом устройстве».'},
  ]},
  {id:'sound',title:'Sound Management',icon:'\u{1F50A}',checks:[
    {name:'visibilitychange actually mutes (п.1.3)',desc:'Hidden tab must call an audio pause/mute path, not merely register the event name.',
      test:function(s){
        if(!hasAudioSource(s))return true;
        var c=sourceWithoutComments(s),block=extractEventBlock(c,/(?:addEventListener\s*\(\s*['"]visibilitychange['"]|onvisibilitychange\s*=)/i);
        if(!block)return 'warn';
        var resumes=pat(block,/\.resume\s*\(|\.play\s*\(|resumeAudio|unmute/i);
        if(resumes&&!hasAudioPauseAction(block))return false;
        return pat(block,/document\s*\.\s*hidden|visibilityState/i)&&hasAudioPauseAction(block)?true:'warn';
      },warnText:'Игра использует звук, но checker не подтверждает document.hidden/visibilityState + suspend/mute/pause внутри visibilitychange. Одного имени события недостаточно.',
      failText:'Обработчик visibilitychange возобновляет звук без остановки при скрытии вкладки. При потере фокуса нужен suspend/mute/pause (п.1.3).'},
    {name:'Window blur/pagehide mutes sound (п.1.3)',desc:'Switching to another window or system overlay must mute/pause audio too.',
      test:function(s){
        if(!hasAudioSource(s))return true;
        var c=sourceWithoutComments(s),block=extractEventBlock(c,/(?:addEventListener\s*\(\s*['"](?:blur|pagehide|freeze)['"]|on(?:blur|pagehide)\s*=)/i);
        if(!block)return 'warn';
        var resumes=pat(block,/\.resume\s*\(|\.play\s*\(|resumeAudio|unmute/i);
        if(resumes&&!hasAudioPauseAction(block))return false;
        return hasAudioPauseAction(block)?true:'warn';
      },warnText:'Нет подтверждённого mute/pause на window.blur/pagehide. Одного visibilitychange недостаточно: п.1.3 требует остановить звук при любой потере фокуса.',
      failText:'Обработчик blur/pagehide возобновляет звук вместо остановки. На любой потере фокуса нужен suspend/mute/pause (п.1.3).'},
    {name:'game_api_pause',desc:'SDK pause handler',
      test:function(s){return pat(s,/game_api_pause/);}},
    {name:'game_api_resume',desc:'SDK resume handler',
      test:function(s){return pat(s,/game_api_resume/);}},
    {name:'AudioContext suspend/resume',desc:'AC.suspend() + AC.resume()',
      test:function(s){return(pat(s,/\.suspend\s*\(/)||pat(s,/suspendAudio/))&&(pat(s,/\.resume\s*\(/)||pat(s,/resumeAudio/));}},
  ]},
  {id:'ads_inter',title:'Ads \u2014 Interstitial',icon:'\u{1F4FA}',checks:[
    {name:'showFullscreenAdv',desc:'Interstitial present',
      test:function(s){return pat(s,/showFullscreenAdv\s*\(/);}},
    {name:'onOpen callback',desc:'Pause+mute on ad',
      test:function(s){var m=extractBlock(s,/showFullscreenAdv\s*\(/);return m&&/onOpen/.test(m);}},
    {name:'onClose callback',desc:'Resume after ad',
      test:function(s){var m=extractBlock(s,/showFullscreenAdv\s*\(/);return m&&/onClose/.test(m);}},
    {name:'onError callback',desc:'Error handling',
      test:function(s){var m=extractBlock(s,/showFullscreenAdv\s*\(/);return m&&/onError/.test(m);}},
  ]},
  {id:'ads_rw',title:'Ads \u2014 Rewarded',icon:'\u{1F3AC}',checks:[
    {name:'showRewardedVideo',desc:'Rewarded present',
      test:function(s){return pat(s,/showRewardedVideo\s*\(/);}},
    {name:'onRewarded callback',desc:'Grant reward',
      test:function(s){var m=extractBlock(s,/showRewardedVideo\s*\(/);return m&&/onRewarded/.test(m);}},
    {name:'onOpen callback',desc:'Pause+mute',
      test:function(s){var m=extractBlock(s,/showRewardedVideo\s*\(/);return m&&/onOpen/.test(m);}},
    {name:'onClose callback',desc:'Resume',
      test:function(s){var m=extractBlock(s,/showRewardedVideo\s*\(/);return m&&/onClose/.test(m);}},
  ]},
  {id:'save',title:'Cloud Saves',icon:'\u{1F4BE}',checks:[
    {name:'player.setData()',desc:'Cloud save',
      test:function(s){return pat(s,/\.setData\s*\(/);}},
    {name:'player.getData()',desc:'Cloud load',
      test:function(s){return pat(s,/\.getData\s*\(/);}},
    {name:'No raw localStorage.setItem',desc:'Saves through SDK',
      test:function(s){
        var matches=s.match(/localStorage\.setItem/g);
        if(!matches)return true;
        var all=true;
        var idx=0,from=0;
        while((idx=s.indexOf('localStorage.setItem',from))!==-1){
          var ctx=s.slice(Math.max(0,idx-300),idx+100);
          if(!/dev[_\-]?[Mm]ode|_devMode/.test(ctx))all=false;
          from=idx+20;
        }
        return all?true:'warn';
      },warnText:'localStorage.setItem found \u2014 verify dev-mode only'},
    {name:'Rotation does not reset progress (п.1.9)',desc:'Orientation handlers must not reload/reset the run unless state is saved and restored.',
      test:function(s){
        var c=sourceWithoutComments(s);
        var block=extractEventBlock(c,/(?:addEventListener\s*\(\s*['"]orientationchange['"]|screen\s*\.\s*orientation[\s\S]{0,80}addEventListener\s*\(\s*['"]change['"])/i);
        if(!block)return true;
        var destructive=pat(block,/location\s*\.\s*reload\s*\(|resetGame\s*\(|restartGame\s*\(|newGame\s*\(|initGame\s*\(|(?:score|level|stage|round)\s*=\s*(?:0|1)\b|clear(?:Progress|Save|State)\s*\(/i);
        if(!destructive)return true;
        var saves=pat(c,/\.setData\s*\(|save(?:Progress|Game|State)\s*\(|snapshot|serialize/i);
        var restores=pat(c,/\.getData\s*\(|load(?:Progress|Game|State)\s*\(|restore|deserialize/i);
        return saves&&restores?true:'warn';
      },warnText:'Обработчик поворота перезапускает/обнуляет игру, но checker не видит связку save+restore. Поворот экрана не должен терять текущий прогресс (п.1.9).'},
  ]},
  {id:'payments',title:'In-App Purchases',icon:'\u{1F4B0}',optional:true,checks:[
    {name:'getPayments()',desc:'Payments init',
      test:function(s){return pat(s,/getPayments\s*\(/);}},
    {name:'consumePurchase()',desc:'Consume after grant',
      test:function(s){return pat(s,/consumePurchase\s*\(/);}},
    {name:'getPurchases()',desc:'Check pending at start',
      test:function(s){return pat(s,/getPurchases\s*\(/);}},
    {name:'getCatalog() called (REQ-1.13/3.8)',desc:'Catalog provides priceCurrencyCode + getPriceCurrencyImage — required when game has IAP',
      guard:true,
      test:function(s){
        var hasPayments = pat(s,/getPayments\s*\(/);
        if(!hasPayments) return {pass:true,details:'No IAP — n/a'};
        return pat(s,/getCatalog\s*\(/) ? true : {pass:false,details:'getPayments() present but getCatalog() never called. Without catalog you cannot get priceCurrencyImage and prices may be hardcoded — Driftworld was rejected for hardcoded "100₽" (REQ-3.8).'};
      }},
    {name:'No hardcoded ₽/$/€ near numbers (REQ-3.8)',desc:'When IAP is present, prices must use SDK currency methods (getPriceCurrencyCode/getPriceCurrencyImage)',
      guard:true,
      test:function(s){
        var hasPayments = pat(s,/getPayments\s*\(/);
        if(!hasPayments) return {pass:true,details:'No IAP — symbols in display text are OK'};
        var re = /(?:^|[^A-Za-z0-9])([+\-]?\d[\d.,]*\s?[₽€¥¢])|([₽€¥¢]\s?\d[\d.,]*)|([+\-]?\d[\d.,]*\s?\$)(?!\{)|(\$\s?\d{2,}(?:[.,]\d+)?)|(\$\s?\d[.,]\d+)/;
        var lines = String(s||'').split('\n');
        for (var i=0;i<lines.length;i++){
          if(/getCurrency|getPriceCurrency|priceCurrencyCode/.test(lines[i])) continue;
          if(re.test(lines[i])){
            var m = lines[i].match(re);
            return {pass:false,details:'Hardcoded currency near number: ' + (m[1]||m[2]||m[3]||m[4]||m[5]).trim() + ' (line ' + (i+1) + ')'};
          }
        }
        return true;
      }},
    {name:'IAP-PERMIT marker present',desc:'Comment / config noting that games-partners@yandex-team.ru approved IAP. Past rejection (BattleFront): "Покупки не подключены... Дождитесь ответного письма"',
      guard:true,
      test:function(s){
        var hasPayments = pat(s,/getPayments\s*\(/);
        if(!hasPayments) return {pass:true,details:'No IAP — n/a'};
        return pat(s,/IAP[\s_-]?PERMIT|games-partners@yandex-team\.ru|IAP\s+approved/i) ? true : {pass:false,details:'IAP code present but no marker confirming you have requested approval. Add a comment "// IAP-PERMIT: requested 2026-01-15" or similar.'};
      }},
  ]},
  {id:'i18n',title:'Localization (I18N)',icon:'\u{1F310}',checks:[
    {name:'environment.i18n.lang',desc:'Language from SDK (п.2.14)',
      test:function(s){return pat(s,/i18n\??\.lang/);}},
    {name:'detectLang()',desc:'Detection function',
      test:function(s){return pat(s,/function\s+detectLang|detectLang\s*=/);}},
    {name:'var _lang (NOT let/const)',desc:'Cheat panel & YG screenshotter need window._lang',
      test:function(s){
        if(pat(s,/\blet\s+_lang\b/)&&!pat(s,/\bvar\s+_lang\b/))return false;
        if(pat(s,/\bconst\s+_lang\b/))return false;
        if(pat(s,/\bvar\s+_lang\b/))return true;
        return 'warn';
      },failText:'let/const _lang found — must be var _lang (window._lang needed for YG screenshotter)',
      warnText:'_lang variable not found — check how language is stored'},
    {name:'setLang() function',desc:'Language switching for cheat panel / extension',
      test:function(s){return pat(s,/function\s+setLang|setLang\s*=/);}},
    {name:'t() function used',desc:'UI localization',
      test:function(s){var m=s.match(/\bt\s*\(\s*['"]/g);return !!(m&&m.length>=5);}},
    {name:'All 13 languages',desc:'RU EN ES TR PT AR ID FR JA IT DE HI ZH',
      test:function(s){
        var langs=['ru','en','es','tr','pt','ar','id','fr','ja','it','de','hi','zh'];
        var found=0,missing=[];
        langs.forEach(function(l){
          // Match all common I18N declaration shapes:
          //   'ru':{...}  "ru":{...}  ru:{...}  I18N.ru = {...}  DATA_RU = {...}  STRINGS_RU = {...}
          var patterns = [
            new RegExp("['\"]"+l+"['\"]\\s*:\\s*\\{"),
            new RegExp("\\b"+l+"\\s*:\\s*\\{"),
            new RegExp("I18N\\."+l+"\\s*="),
            new RegExp("(?:DATA|NARRATIVE|STRINGS)_"+l.toUpperCase()+"\\s*=")
          ];
          if(patterns.some(function(re){return pat(s,re);})) found++;
          else missing.push(l);
        });
        if(found>=13)return true;
        if(found>=10)return 'warn';
        RT._missingLangs=missing;
        return false;
      },warnText:'Some languages missing — check RT._missingLangs',
      failText:'Missing languages! Check RT._missingLangs in console'},
    {name:'Yandex lang fallback',desc:'be/kk/uk/uz → ru (Yandex docs)',
      test:function(s){
        // Common ways to express the fallback:
        if(pat(s,/LANG_FALLBACK|langFallback|RU_LIKE|RU_FALLBACK/))return true;
        // Inline conditional: `be.*ru`, `case 'be':...return 'ru'`
        if(pat(s,/be.*['"]ru['"]|kk.*['"]ru['"]/))return true;
        // Array form: ['be','kk','uk','uz'] (any order, any 3+ of them)
        var arrRe = /\[\s*(?:['"](?:be|kk|uk|uz)['"]\s*,?\s*){3,}\s*\]/;
        if(arrRe.test(s))return true;
        return 'warn';
      },warnText:'No explicit fallback for be/kk/uk/uz → ru'},
    {name:'No optional chaining on i18n',desc:'Direct access for SDK tracking',
      test:function(s){
        if(pat(s,/environment\?\.i18n\?\.lang/))return 'warn';
        return pat(s,/i18n\.lang/);
      },warnText:'Optional chaining (?.) may prevent SDK detection'},
  ]},
  {id:'ux',title:'UX & Mobile',icon:'\u{1F4F1}',checks:[
    {name:'Context menu disabled',desc:'п.1.6.2.7 — right-click prevented',
      test:function(s){return pat(s,/contextmenu/)&&pat(s,/preventDefault/);}},
    {name:'Text selection disabled',desc:'п.1.6.2.7 — user-select or selectstart',
      test:function(s){return pat(s,/user-select\s*:\s*none/)||pat(s,/selectstart/);}},
    {name:'touch-action configured',desc:'touch-action: none/manipulation on game area',
      test:function(s){return pat(s,/touch-action\s*:\s*(none|manipulation)/);}},
    {name:'Viewport meta tag',desc:'Mobile viewport with user-scalable=no',
      test:function(s){return pat(s,/<meta[^>]*viewport[^>]*>/);}},
    {name:'Overflow hidden on body/html',desc:'п.1.10.2 — prevent page scroll',
      test:function(s){return pat(s,/overflow\s*:\s*hidden/);}},
    {name:'overscroll-behavior',desc:'п.1.10.2 — prevent swipe-to-refresh / bounce',
      test:function(s){return pat(s,/overscroll-behavior\s*:\s*(none|contain)/);}},
    {name:'-webkit-touch-callout: none',desc:'Prevent iOS callout menu on long press',
      test:function(s){return pat(s,/touch-callout\s*:\s*none/);}},
  ]},
  {id:'rejections',title:'Common Rejections',icon:'\u{1F6A8}',checks:[
    {name:'Scroll prevention (п.1.10.2)',desc:'No browser scroll during gameplay',
      test:function(s){
        // Must have at least 2 of: overflow:hidden, overscroll-behavior, touchmove preventDefault, touch-action:none
        var score=0;
        if(pat(s,/overflow\s*:\s*hidden/))score++;
        if(pat(s,/overscroll-behavior\s*:\s*(none|contain)/))score++;
        if(pat(s,/touchmove/)&&pat(s,/preventDefault/))score++;
        if(pat(s,/touch-action\s*:\s*none/))score++;
        if(pat(s,/position\s*:\s*fixed/)&&pat(s,/html|body/))score++;
        return score>=2?true:(score===1?'warn':false);
      },warnText:'Only 1 scroll prevention method — add overscroll-behavior:none and overflow:hidden',
      failText:'No scroll prevention! Add: overflow:hidden + overscroll-behavior:none + touchmove preventDefault'},
    {name:'Swipe-to-refresh blocked (iOS/Android)',desc:'п.1.10.2 — overscroll-behavior: none/contain',
      test:function(s){
        if(pat(s,/overscroll-behavior\s*:\s*(none|contain)/))return true;
        // Alternative: touchmove preventDefault at top of page
        if(pat(s,/touchmove/)&&pat(s,/preventDefault/))return 'warn';
        return false;
      },warnText:'touchmove preventDefault found but overscroll-behavior:none is more reliable',
      failText:'Add CSS: html,body{overscroll-behavior:none} to block pull-to-refresh'},
    {name:'GameReady timing (п.1.19)',desc:'LoadingAPI.ready() called AFTER full load, not in SDK init',
      test:function(s){
        if(!pat(s,/LoadingAPI[\s\S]{0,4}ready/))return false;
        // Check: ready() should NOT be called synchronously inside YaGames.init callback
        // It should be after game assets are loaded
        // Look for ready() being called after some async operation (setTimeout, await, .then)
        var readyBlock=extractBlock(s,/LoadingAPI[\s\S]{0,4}ready\s*\(/);
        if(!readyBlock)return false;
        // Warn if ready() is in the same function as YaGames.init()
        var initBlock=extractBlock(s,/YaGames\.init\s*\(/);
        if(initBlock&&initBlock.indexOf('ready')!==-1){
          // ready() is very close to init() — might be called too early
          return 'warn';
        }
        return true;
      },warnText:'LoadingAPI.ready() may be called too early — ensure it runs AFTER game is playable'},
    {name:'I18N auto-detection (п.2.14)',desc:'Language from SDK, not hardcoded',
      test:function(s){
        // Must use ysdk.environment.i18n.lang, not just navigator.language
        if(pat(s,/environment[\s\S]{0,5}i18n[\s\S]{0,5}lang/))return true;
        if(pat(s,/getLang\s*\(/)||pat(s,/detectLang/))return 'warn';
        return false;
      },warnText:'detectLang found but verify it reads ysdk.environment.i18n.lang',
      failText:'Must use ysdk.environment.i18n.lang for auto-detection'},
    {name:'Sound paused during ads (п.4.7)',desc:'AudioContext suspend in ad onOpen callback',
      test:function(s){
        // Check interstitial
        var fsBlock=extractBlock(s,/showFullscreenAdv\s*\(/);
        var rwBlock=extractBlock(s,/showRewardedVideo\s*\(/);
        if(!fsBlock&&!rwBlock)return false;
        // Look for audio pause/suspend/mute near ad callbacks
        var hasMuteInFs=fsBlock&&(pat(fsBlock,/suspend|mute|pause.*[Aa]udio|[Aa]udio.*pause/));
        var hasMuteInRw=rwBlock&&(pat(rwBlock,/suspend|mute|pause.*[Aa]udio|[Aa]udio.*pause/));
        // Also check if there's a generic pauseAudio/muteAll function called
        var hasGeneric=pat(s,/pauseAppAudio|muteAll|muteSound|suspendAudio|audioSuspend|_muteForAd|muteForAd/);
        if(fsBlock&&!hasMuteInFs&&!hasGeneric)return false;
        if(rwBlock&&!hasMuteInRw&&!hasGeneric)return false;
        return true;
      },failText:'Ad callbacks must suspend AudioContext / mute sound in onOpen!'},
    {name:'Game paused during ads (п.4.7)',desc:'Gameplay stops when ad is shown',
      test:function(s){
        var fsBlock=extractBlock(s,/showFullscreenAdv\s*\(/);
        if(!fsBlock)return 'warn';
        // Check for pause/stop in ad context (within 300 chars or via helper function)
        var hasPause=pat(fsBlock,/pause|stop|frozen|mute|speed\s*=\s*0|GameplayAPI[\s\S]{0,4}stop/)
          ||pat(s,/pauseAppAudio|pauseGame|gamePause|_paused\s*=\s*true|_muteForAd|muteForAd/);
        return hasPause;
      },warnText:'No showFullscreenAdv found',
      failText:'Game must pause during fullscreen ad — set paused state in onOpen callback'},
    {name:'Selection/callout in game area (п.1.6.2.7)',desc:'No text selection or context menu on interaction',
      test:function(s){
        var score=0;
        if(pat(s,/user-select\s*:\s*none/))score++;
        if(pat(s,/selectstart/)&&pat(s,/preventDefault/))score++;
        if(pat(s,/contextmenu/)&&pat(s,/preventDefault/))score++;
        if(pat(s,/touch-callout\s*:\s*none/))score++;
        return score>=2?true:(score===1?'warn':false);
      },warnText:'Only partial protection — add user-select:none + selectstart + contextmenu preventDefault',
      failText:'Must disable: user-select, selectstart, contextmenu in game area'},
  ]},
  {id:'danger',title:'Dangerous Patterns',icon:'\u26A0\uFE0F',checks:[
    {name:'No alert()',desc:'alert() forbidden',
      test:function(s){var c=s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');var m=c.match(/\balert\s*\(/g);return!m||m.length===0;},
      failText:'alert() found!'},
    {name:'No confirm()',desc:'confirm() forbidden',
      test:function(s){var c=s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');var m=c.match(/(?<![.\w])confirm\s*\(/g);return!m||m.length===0;},
      failText:'confirm() found!'},
    {name:'No prompt()',desc:'prompt() forbidden',
      test:function(s){var c=s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');var m=c.match(/(?<![.\w])prompt\s*\(/g);return!m||m.length===0;},
      failText:'prompt() found!'},
    {name:'No document.write()',desc:'document.write forbidden',
      test:function(s){return!pat(s,/document\.write\s*\(/);}},
    {name:'No eval()',desc:'eval() dangerous',
      test:function(s){var c=s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');var m=c.match(/(?<![.\w])eval\s*\(/g);return!m||m.length===0;}},
  ]},
  {id:'archive',title:'Archive',icon:'\u{1F4E6}',checks:[
    {name:'index.html loads',desc:'Entry point OK',
      test:function(){return true;}},
    {name:'Page source < 100 MB',desc:'Yandex limit (approximate)',
      test:function(s){
        // This checks concatenated source size — actual ZIP will be smaller
        // For real file size, use scripts/verify.sh
        var sizeMB=(new Blob([s])).size/(1024*1024);
        if(sizeMB>100)return false;
        if(sizeMB>50)return 'warn';
        return true;
      },warnText:'Source > 50 MB — verify final ZIP is under 100 MB with scripts/verify.sh'},
    {name:'No Yandex S3 URLs',desc:'Must use relative paths',
      test:function(s){return!pat(s,/https?:\/\/[^"']*yandex.*\.s3/);}},
  ]},
  {id:'quality',title:'Quality',icon:'\u2B50',checks:[
    {name:'Sound toggle',desc:'Mute button exists (heuristic aligned with реком. 6.2 — two checks must not contradict)',
      test:function(s){
        if(!pat(s,/new Audio|AudioContext|<audio|Howl|Tone\./i))return true; // no sound → N/A
        return pat(s,/(mute|sound|звук|audio)[^>]{0,40}(toggle|btn|button|onclick|checkbox)/i)
            || pat(s,/(toggle|btn|button)[^>]{0,40}(mute|sound|звук)/i)
            || pat(s,/soundToggle|toggleSound|muteBtn|btnSound|soundOn\s*=|sound[_\-]?on/i);
      }},
    {name:'Pause function',desc:'Game can be paused',
      test:function(s){return pat(s,/pause|_paused|isPaused|gamePaused/);}},
    {name:'No YouTube player',desc:'External video forbidden',
      test:function(s){return!pat(s,/youtube\.com\/embed|YT\.Player/);}},
    {name:'No WebGL notice (п.1.6.1.7)',desc:'No "WebGL not supported/enable WebGL" prompt shown to user',
      test:function(s){return!pat(s,/WebGL[^<]{0,40}(not |unavailable|enable|unsupported|включите|не поддерж)/i);}},
    {name:'Video has no system controls (п.1.6.1.6/2.5)',desc:'<video> must not show the native player UI (use controlsList/no controls attr)',
      test:function(s){
        // Pass if there is no <video> at all, OR every <video> suppresses native controls.
        var vids=s.match(/<video\b[^>]*>/gi);
        if(!vids)return true;
        return vids.every(function(v){
          // bad: has `controls` and does NOT disable them
          if(/\bcontrols\b/i.test(v) && !/controlsList=("|')?nodownload|disablePictureInPicture/i.test(v))return false;
          return true;
        });
      }},
    {name:'Music via Web Audio, not <audio>/new Audio (п.1.6.1.6/1.6.2.5)',desc:'Background music played through HTMLAudioElement (new Audio()/<audio>) surfaces in the OS media player (desktop) and the mobile notification shade. Use Web Audio API (AudioContext + BufferSource) instead.',
      test:function(s){
        // BAD: new Audio(...) used for music, or <audio> with autoplay/loop (i.e. background music
        // not a one-shot). SFX via Web Audio (createBufferSource) is fine and doesn't trip this.
        var hasNewAudio = pat(s,/new\s+Audio\s*\(/);
        var bgAudioTag  = pat(s,/<audio\b[^>]*\b(autoplay|loop)\b/i);
        if(hasNewAudio || bgAudioTag){
          // If MediaSession metadata is also set, it's DEFINITELY showing in the OS player.
          // Either way HTMLAudioElement music is the rejection cause → WARN (manual confirm: is it music?).
          return 'warn';
        }
        // Explicit MediaSession usage always surfaces the OS player.
        if(pat(s,/navigator\.mediaSession/)) return 'warn';
        return true;
      },warnText:'Music appears to use HTMLAudioElement (new Audio()/<audio loop>) or MediaSession — these show a system media player (desktop п.1.6.2.5) and a mobile notification-shade player (п.1.6.1.6). Route music through Web Audio API: fetch→decodeAudioData→AudioBufferSourceNode (loop=true) on your existing AudioContext, and remove any navigator.mediaSession metadata. SFX via Web Audio is unaffected.'},
    {name:'detectLang: SDK before ?lang= URL param (кейс tyl)',desc:'Яндекс всегда добавляет &lang= в URL — если detectLang проверяет URL-параметр раньше SDK, чтение environment.i18n.lang становится мёртвым кодом.',
      test:function(s){
        var m=s.match(/function\s+detectLang\s*\([^)]*\)\s*\{([\s\S]{0,900}?)\n\}/);
        if(!m)return true; // нет detectLang в таком виде → другие чеки разберутся
        var body=m[1];
        var iUrl=body.search(/get\(\s*("|')lang\1\s*\)/);
        var iSdk=body.search(/environment\s*\.\s*i18n/);
        if(iUrl<0||iSdk<0)return true;
        // URL раньше SDK И после URL есть ранний return → SDK недостижим на платформе
        var afterUrl=body.slice(iUrl, iSdk);
        return (iUrl<iSdk && /return/.test(afterUrl)) ? 'warn' : true;
      },warnText:'detectLang() проверяет ?lang= из URL РАНЬШЕ SDK и возвращается — на Яндексе (&lang= есть всегда) чтение environment.i18n.lang мёртвый код → панель «I18n is not used», риск 2.14. Поменяй порядок: SDK первым, URL-параметр — только dev-fallback без SDK.'},
    {name:'Language detected before the game is interactive (п.2.14/1.19)',desc:'detectLang()/ready() must run as part of startup BEFORE input handlers are bound / the board is built — not in a parallel init().then() while DOMContentLoaded already made the game playable.',
      test:function(s){
        // Heuristic for the Hexfront/parkour pattern: the game binds canvas/window input or starts a
        // match at DOMContentLoaded, while detectLang()/LoadingAPI.ready() live inside an async
        // init().then() that resolves LATER → Yandex sees lang/ready fire "after game is playable".
        // Only relevant if SDK lang-detection exists at all.
        var usesLang = pat(s,/environment\.i18n\.lang|detectLang\s*\(/);
        if(!usesLang) return true; // no SDK lang detection → handled by other checks
        // Is input bound / a match started synchronously at boot (DOMContentLoaded or top-level)?
        var bootBinds = pat(s,/DOMContentLoaded[\s\S]{0,400}addEventListener\s*\(\s*("|')(click|pointerdown|mousedown|keydown|touchstart)/i)
                     || pat(s,/(CV|canvas|cv)\.addEventListener\s*\(\s*("|')(click|pointerdown|mousedown)/i);
        if(!bootBinds) return true;
        // Are detectLang() AND ready() BOTH only reached via an async init().then()/await chain?
        var langInAsync  = pat(s,/init\s*\(\s*\)\s*\.then\s*\([\s\S]{0,300}detectLang/i) || pat(s,/await[\s\S]{0,200}init[\s\S]{0,300}detectLang/i);
        var readyInAsync = pat(s,/init\s*\(\s*\)\s*\.then\s*\([\s\S]{0,400}(LoadingAPI|\.ready\s*\()/i) || pat(s,/await[\s\S]{0,200}init[\s\S]{0,400}\.ready\s*\(/i);
        // If lang/ready are deferred into init().then() but input is bound at boot → ordering smell.
        return (langInAsync || readyInAsync) ? 'warn' : true;
      },warnText:'Input handlers are bound / the board is built at DOMContentLoaded, but detectLang()/LoadingAPI.ready() only run inside init().then() — so Yandex sees language auto-detection and GameReady fire AFTER the game is already playable (п.2.14 + п.1.19). Gate interactivity: await the SDK (or its language) before binding input / showing the playable board, then call detectLang()→applyLang()→ready() up front. Even in a Russian-only game the CALL ORDER is checked.'},
    {name:'Keyboard auto-shows on input (п.1.6.1.2)',desc:'A text <input> must raise the mobile keyboard on tap (native behavior). Flag only if the keyboard is actively suppressed.',
      test:function(s){
        var tags=s.match(/<input\b[^>]*>/gi);
        if(!tags)return true; // no inputs → N/A
        var textInputs=tags.filter(function(tag){
          var tm=tag.match(/type\s*=\s*("|')?\s*([a-z]+)/i);
          if(!tm)return true;
          var ty=tm[2].toLowerCase();
          return (ty==='text'||ty==='search'||ty==='email'||ty==='tel'||ty==='url'||ty==='password'||ty==='number');
        });
        if(!textInputs.length)return true; // only buttons/checkboxes/range → N/A
        // A normal text input raises the keyboard on tap natively — that satisfies 1.6.1.2.
        // It FAILS only if the keyboard is actively suppressed: inputmode="none", readonly,
        // or disabled on every text input.
        var allSuppressed=textInputs.every(function(tag){
          return /inputmode\s*=\s*("|')?none/i.test(tag) || /\breadonly\b/i.test(tag) || /\bdisabled\b/i.test(tag);
        });
        return allSuppressed ? false : true;
      }},
    {name:'No URL-based gating (п.1.18)',desc:'Game must not restrict itself by location.host/href',
      test:function(s){return!pat(s,/location\.(host|hostname|href)\s*[!=]==?\s*("|')|referrer\s*[!=]==?|top\.location\s*[!=]/);}},
    {name:'Fullscreen on mobile (п.1.6.1.1)',desc:'Game should run fullscreen during play on mobile — viewport-fit=cover + 100vh/100% root, or a requestFullscreen call.',
      test:function(s){
        // WARN only if clearly NOT fullscreen: no viewport-fit=cover, no requestFullscreen, AND a fixed
        // pixel-sized root container (e.g. width:800px) which would letterbox on mobile.
        var hasCover = pat(s,/viewport-fit\s*=\s*cover/i) || pat(s,/requestFullscreen/) || pat(s,/100vh|100vw|height:\s*100%/i);
        if(hasCover) return true;
        var fixedRoot = pat(s,/#(app|game|root|stage|container)\b[^}]*\bwidth:\s*\d{3,4}px/i);
        return fixedRoot ? 'warn' : true;
      },warnText:'No fullscreen hint (viewport-fit=cover / 100vh root / requestFullscreen) and a fixed-pixel root container — on mobile the game may not fill the screen (п.1.6.1.1). Use 100vh/100vw or dvh on the root and viewport-fit=cover.'},
    {name:'Desktop field aspect ≤ 2:1 (п.1.6.2.2)',desc:'On desktop the long side of the active field must not exceed 2× the short side. A canvas locked to an extreme ratio fails. (Runtime Probe F measures the live ratio; this flags a hard-coded extreme.)',
      test:function(s){
        // Look for a canvas/stage with hard-coded width&height where ratio > 2.2 (static smell).
        var m = s.match(/(canvas|#stage|#game)[^{};]{0,80}width:\s*(\d{2,5})px[^{};]{0,40}height:\s*(\d{2,5})px/i);
        if(!m) return true;
        var w=parseInt(m[2],10), h=parseInt(m[3],10); if(!w||!h) return true;
        var r = Math.max(w,h)/Math.min(w,h);
        return r > 2.2 ? 'warn' : true;
      },warnText:'A canvas/stage is hard-coded to an aspect ratio worse than 2:1 — desktop requirement 1.6.2.2 caps the long side at 2× the short side. Let the field scale to the window (Probe F also checks the live ratio).'},
    {name:'Нет бренда «Яндекс» в текстах игры (п.3.5)',desc:'Лицензионное соглашение не даёт прав на товарные знаки и фирменные наименования Яндекса. Диалоги авторизации и оплаты платформа рисует сама — в игре надписи нейтральные.',
      test:function(s){
        var m = s.match(/["'>][^"'<>]{0,40}(Яндекс|Yandex)[^"'<>]{0,40}["'<]/g) || [];
        var real = m.filter(function(x){ return !/games-sdk|yandex\.ru\/games|sdk\.js|@|https?:/i.test(x); });
        return real.length ? 'warn' : true;
      },warnText:'В текстах игры встречается «Яндекс/Yandex». Соглашение разработчика не даёт прав на товарные знаки платформы: замени на нейтральное («Войти», «Таблица лидеров», «Купить»). Диалог авторизации платформа показывает сама.'},
    {name:'Тач-цели ≥44px (п.1.8)',desc:'Мелкие кнопки на мобильном = случайные нажатия и отказ по 1.8.',
      test:function(s){
        if(!pat(s,/@media|viewport|touch/i))return true;
        var small = (s.match(/(width|height)\s*:\s*(1[0-9]|2[0-9]|3[0-9])px/g)||[]).length;
        return small > 6 ? 'warn' : true;
      },warnText:'Много размеров 10-39px в стилях — проверь тач-цели на мобильном: интерактивные элементы должны быть не меньше 44×44 CSS-пикселей (п.1.8). Рантайм-проверка «Touch targets» покажет конкретные.'},
    {name:'RV-кнопка говорит О НАГРАДЕ (п.4.5.1)',desc:'На кнопке RV должно быть однозначно видно, что покажут рекламу И что за неё дадут. Голое число рядом читается как размер награды, хотя это остаток применений.',
      test:function(s){
        if(!pat(s,/showRewardedVideo/))return true;
        var honest = pat(s,/(за рекламу|Реклама:|смотреть рекламу|📺|▶[^<]{0,30}(×|x)\s*\d)/i);
        return honest ? true : 'warn';
      },warnText:'У RV-кнопок не видно текста награды. Пиши на кнопке ЧТО дадут («Реклама: ×2 монеты»), а остаток применений — отдельной строкой словами («осталось 3 из 5»). Голая цифра = отказ по 4.5.1.'},
    {name:'Нет debug-инструментов в UI (п.1.15)',desc:'Поля сида, выбор поведения ИИ, скорость хода, «Заново», панели замеров в релизной сборке = игра выглядит незавершённой.',
      test:function(s){
        var hits = 0;
        if (pat(s,/>\s*(сид|seed)\s*</i)) hits++;
        if (pat(s,/замер механики|debug panel|дебаг|отладк/i)) hits++;
        if (pat(s,/<select[^>]*>[\s\S]{0,200}(стратег|случайн|агрессивн)/i)) hits++;
        if (pat(s,/>\s*(Заново|Reset seed|Подсказка: (вкл|выкл))\s*</i)) hits++;
        return hits >= 2 ? 'warn' : true;
      },warnText:'Похоже, в билде остались инструменты разработчика (сид / выбор ИИ / скорость хода / панель замеров). Спрячь под ?debug=1 — иначе модерация видит WIP (п.1.15).'},
    {name:'Ввод закрыт до ready() (REQ-1.19)',desc:'Игра не должна принимать клики/клавиши, пока не вызван LoadingAPI.ready(): модератор кликами проскакивает загрузку → отказ 1.19.',
      test:function(s){
        if(!pat(s,/addEventListener\s*\(\s*['"](?:click|pointerdown|mousedown|keydown|touchstart)/i))return true;
        var gate = pat(s,/inputEnabled|inputLocked|acceptInput|canPlay|isReady|readyFired/i);
        return gate ? true : 'warn';
      },warnText:'Обработчики ввода вешаются без видимого гейта (inputEnabled/isReady и т.п.). Проверь рантайм-строку «ВВОД ПРИНЯТ ДО ready()» в консоли: если клик проходит раньше ready(), это отказ по 1.19.'},
    {name:'Keyboard uses physical codes (п.1.6.2.4)',desc:'WASD movement must use event.code (physical keys), not layout-dependent event.key/keyCode.',
      test:function(s){
        var c=sourceWithoutComments(s);
        if(!pat(c,/keydown|keyup/i))return true;
        var direct=pat(c,/\.key\s*(?:===?|==)\s*['"][wasd]['"]/i);
        var switched=pat(c,/switch\s*\([^)]*\.key[^)]*\)\s*\{[\s\S]{0,500}?case\s*['"][wasd]['"]\s*:/i);
        var lowered=pat(c,/\.key\s*\.\s*toLowerCase\s*\(\s*\)[\s\S]{0,180}?(?:['"][wasd]['"]|includes\s*\(\s*['"]wasd['"])/i);
        var deprecated=pat(c,/\.(?:keyCode|which)\s*(?:===?|==)\s*(?:65|68|83|87)\b/);
        return direct||switched||lowered||deprecated?'warn':true;
      },warnText:'Найден layout-dependent путь WASD через event.key/keyCode. Даже если где-то ещё есть event.code, этот путь сломается в другой раскладке. Используй event.code === "KeyW/KeyA/KeyS/KeyD" и продублируй стрелками.'},
    {name:'No OS-shortcut key handlers (п.1.6.2.6)',desc:'Desktop games must not bind Ctrl/Alt/Meta+key combos that collide with OS/browser shortcuts.',
      test:function(s){
        // WARN if a keydown handler checks ctrlKey/metaKey/altKey together with a letter key (likely an OS combo).
        if(pat(s,/(ctrlKey|metaKey)\s*&&[^;{]{0,60}\bkey(Code)?\s*===?/i) && pat(s,/addEventListener\s*\(\s*("|')keydown/)) return 'warn';
        return true;
      },warnText:'A keydown handler reacts to Ctrl/Meta/Alt+key — these collide with OS/browser shortcuts (п.1.6.2.6). Use plain keys (WASD/arrows/space) or in-game buttons instead.'},
    {name:'No flat-black letterbox void (десктоп, 1.6.2.1)',desc:'Игра-квадрат в плоской черноте на широком экране = непродакшн. Фон должен быть атмосферным (градиент/паттерн/арт), либо ширина занята панелями.',
      test:function(s){
        // Узкая эвристика (без false-positive на полноэкранных играх):
        // фикс-ширина/центрированный stage + body с ЧИСТО чёрным фоном + нигде нет градиента/картинки фона.
        var centered = pat(s,/(#(app|game|root|stage|container)|\.(game|stage|wrap))[^}]{0,120}(max-width|margin:\s*(0\s+)?auto)/i);
        if(!centered) return true; // full-viewport игра → N/A
        var blackBody = pat(s,/body[^}]{0,80}background(-color)?:\s*(#000\b|#000000|black)\s*[;}]/i);
        if(!blackBody) return true;
        var hasAtmo = pat(s,/(body|html|::before|#bg|\.bg)[^}]{0,200}(gradient|background-image|url\()/i);
        return hasAtmo ? true : 'warn';
      },warnText:'Центрированное поле фиксированной ширины + чисто-чёрный body без градиента/паттерна/арта — на широком десктопе игра выглядит «квадратом в пустоте» (1.6.2.1: поле растягивается до края; рантайм-чек Canvas fills screen тоже упадёт). Реши по visual-upgrade Step 0.7: боковые панели на ≥1200px, либо атмосферный фон (radial-gradient палитры + тематический паттерн + виньетка).'},
    {name:'Game looks finished, not WIP (п.1.15)',desc:'No "in development / coming soon / TODO / placeholder" text visible in the UI.',
      test:function(s){
        // Scan visible-ish text for dev placeholders. Conservative word list to avoid false hits.
        if(pat(s,/coming soon|work in progress|under construction|в разработке|скоро здесь|здесь будет|placeholder text|lorem ipsum|тут будет|TODO:.{0,40}<\//i)) return 'warn';
        return true;
      },warnText:'The build shows development/placeholder text ("coming soon / в разработке / lorem ipsum / здесь будет"). Yandex rejects games that look unfinished (п.1.15). Remove placeholder copy and stub screens.'},
    {name:'No imitation ad blocks (п.1.16)',desc:'Game must not fake Yandex ad blocks (custom fullscreen "interstitial"/"RV" UI with its own buttons).',
      test:function(s){
        // WARN if there is a custom element literally labelled as an ad block with its own close/skip button,
        // rather than calling the SDK. Heuristic: a class/id named like an ad block + a "skip/close ad" control,
        // WITHOUT the real SDK ad call nearby.
        var fakeUI = pat(s,/(class|id)\s*=\s*("|')[^"']*(interstitial|rewarded|adblock|fake-?ad|custom-?ad)/i);
        var hasSdkAd = pat(s,/showFullscreenAdv|showRewardedVideo|adv\.show/);
        var skipBtn = pat(s,/(skip|close|закрыть|пропустить)[^<]{0,20}(ad|рекл)/i);
        if(fakeUI && skipBtn && !hasSdkAd) return 'warn';
        return true;
      },warnText:'There appears to be a CUSTOM ad-like block (named interstitial/rewarded with its own skip/close button) but no SDK ad call — imitating Yandex ad blocks is forbidden (п.1.16). Show ads only via ysdk.adv.showFullscreenAdv / showRewardedVideo.'},
    {name:'No YouTube/external video player (п.3.9)',desc:'Video must not be embedded via a player that can navigate to external sites (YouTube iframe forbidden).',
      test:function(s){
        if(pat(s,/youtube\.com\/embed|youtube-nocookie\.com|<iframe[^>]+youtu\.?be|player\.vimeo\.com/i)) return false;
        return true;
      },failText:'Video is embedded via YouTube/Vimeo iframe — forbidden by п.3.9 (lets the user navigate to external sites). Self-host the video (e.g. a <video> tag with your own file, no external player UI).'},
    {name:'Ad orientation matches game (п.4.3)',desc:'Declared ad orientation should match the game orientation (no portrait ad in a landscape-only game).',
      test:function(s){
        // Light static heuristic: if orientation is locked via CSS/meta to one mode AND ad calls pass an
        // explicit conflicting orientation. Hard to prove statically → informational WARN only when both present.
        var landscapeLock = pat(s,/orientation:\s*landscape|screen\.orientation\.lock\(\s*("|')landscape/i);
        var portraitAd = pat(s,/orientation\s*:\s*("|')portrait/i);
        if(landscapeLock && portraitAd) return 'warn';
        return true;
      },warnText:'Game orientation looks locked to landscape but an ad/orientation reference says portrait (п.4.3 — ad orientation must match the game). Verify ad blocks use the same orientation as the game.'},
    {name:'Sound toggle present (реком. 6.2)',desc:'Recommended (07.2026): a way to mute/toggle sound. Not moderated, but affects quality/rating (2.13: rating ≤30 for 3 weeks → unpublished).',
      test:function(s){
        if(!pat(s,/new Audio|AudioContext|<audio|Howl|Tone\./i))return true; // no sound at all → N/A
        return pat(s,/(mute|sound|звук|audio)[^>]{0,40}(toggle|btn|button|onclick|checkbox)/i)
            || pat(s,/(toggle|btn|button)[^>]{0,40}(mute|sound|звук)/i)
            || pat(s,/soundToggle|toggleSound|muteBtn|btnSound|soundOn\s*=/i) ? true : 'warn';
      },warnText:'Игра со звуком, но не видно переключателя звука (рекомендация 6.2). Не блокер, но качество влияет на рейтинг, а рейтинг ≤30 три недели = снятие (2.13).'},
    {name:'Pause available (реком. 6.3)',desc:'Recommended (07.2026): a pause. N/A for idle/turn-based without real-time pressure.',
      test:function(s){
        if(!pat(s,/requestAnimationFrame|setInterval\s*\(\s*game|gameLoop|update\s*\(dt/i))return true; // no realtime loop → N/A
        return pat(s,/pauseGame|isPaused|paused\s*=|btnPause|pauseBtn|пауза/i) ? true : 'warn';
      },warnText:'Реалтайм-цикл без видимой паузы (рекомендация 6.3). Не блокер; советует Яндекс.'},
    {name:'Title without the word "игра/game" (реком. 6.5)',desc:'Recommended (07.2026): lakoничное название без слова «игра/game».',
      test:function(s){
        var m=s.match(/<title>([^<]{1,80})<\/title>/i); if(!m)return true;
        return /\b(game|games)\b|игра|игры/i.test(m[1]) ? 'warn' : true;
      },warnText:'В <title> есть слово «игра/game» — рекомендация 6.5 советует лаконичное название без него.'},
    {name:'No useless exit button (реком. 6.7)',desc:'Recommended (07.2026): no non-functional buttons — an "exit/quit" button is meaningless in a web game.',
      test:function(s){
        return pat(s,/(btn|button)[^>]{0,60}>(\s|&nbsp;)*(выход|выйти\s*из\s*игры|exit\s*game|quit\s*game)/i)
            || pat(s,/(выход из игры|exit game|quit game)[^<]{0,20}<\/button/i) ? 'warn' : true;
      },warnText:'Найдена кнопка «выход/exit game» — в веб-игре она бесполезна (рекомендация 6.7). Убери или замени на «в меню».'},
    {name:'No profanity in UI text (п.8.2.4)',desc:'Visible text must not contain profanity in any language.',
      test:function(s){
        // \b word-boundary is ASCII-only in JS, so it never matches before Cyrillic. Split:
        //   English → require word boundaries (avoids Scunthorpe-style false hits);
        //   Russian → match distinctive stems (no \b; these stems don't occur in clean words).
        var en = /\b(fuck|shit|bitch|asshole|cunt|dick|bastard)\w*/i;
        var ru = /(хуй|хуё|хуя|пизд|бляд|еба[лнтя]|ебу|ебё|ебан|сука|суки|залуп|мудак|мудил|пидор|пидар|гандон|гондон|долбоёб|охуе|ахуе|нахуй|похуй)/i;
        // standalone "бля" needs a Cyrillic-aware boundary (\b is ASCII-only and never matches
        // next to Cyrillic — a dead pattern the audit caught). Match "бля" NOT followed/preceded
        // by another Cyrillic letter (so "бляха" stays clean, "ну бля" is caught).
        var ruBlya = /(^|[^а-яё])бля([^а-яё]|$)/i;
        return (en.test(s) || ru.test(s) || ruBlya.test(s)) ? 'warn' : true;
      },warnText:'Possible profanity detected in the source/UI text (п.8.2.4 — no obscene language in any language). Review and replace; if it is a false match (clean homograph), ignore.'},
    {name:'Canvas resizes on orientation change (п.1.6.1.3/1.10.1)',desc:'A <canvas>/WebGL game must re-fit on orientationchange + fullscreenchange, not only window resize — else it deforms / clips on mobile rotate & fullscreen-exit',
      test:function(s){
        var c=sourceWithoutComments(s);
        if(!pat(c,/<canvas|getContext\s*\(\s*(?:"|')(?:webgl|2d)|THREE\.|renderer\.setSize/i))return true;
        var bindsResize=pat(c,/addEventListener\s*\(\s*['"]resize['"]/i);
        var resizeNamed=c.match(/addEventListener\s*\(\s*['"]resize['"]\s*,\s*([A-Za-z_$][\w$]*)/i);
        var shared=false;
        if(resizeNamed){
          var cb=resizeNamed[1].replace(/[$]/g,'\\$&');
          shared=new RegExp("(?:orientationchange|fullscreenchange)['\"]\\s*,\\s*"+cb+"\\b",'i').test(c)
              || new RegExp("screen\\s*\\.\\s*orientation[\\s\\S]{0,100}['\"]change['\"]\\s*,\\s*"+cb+"\\b",'i').test(c)
              || new RegExp("visualViewport[\\s\\S]{0,100}['\"]resize['\"]\\s*,\\s*"+cb+"\\b",'i').test(c);
        }
        var orientationBlock=extractEventBlock(c,/(?:addEventListener\s*\(\s*['"](?:orientationchange|fullscreenchange)['"]|screen\s*\.\s*orientation[\s\S]{0,80}addEventListener\s*\(\s*['"]change['"]|visualViewport[\s\S]{0,80}addEventListener\s*\(\s*['"]resize['"])/i);
        var activeOrientation=orientationBlock&&pat(orientationBlock,/(?:fit|resize|layout|reflow|setSize|updateViewport|canvas\s*\.\s*(?:width|height)|style\s*\.\s*(?:width|height))\s*(?:\(|=)/i);
        var activeObserver=pat(c,/ResizeObserver\s*\(\s*(?:[A-Za-z_$][\w$]*(?:fit|resize|layout|reflow)[\w$]*|[^)]{0,240}(?:setSize|updateViewport|canvas\s*\.\s*(?:width|height)))/i);
        return bindsResize&&(shared||activeOrientation||activeObserver)?true:'warn';
      },warnText:'Canvas/WebGL-сцена не имеет подтверждённой связки resize + orientation/fullscreen/ResizeObserver. После поворота интерфейс может обрезаться или деформироваться (п.1.6.1.3/1.10.1).'},
    {name:'ready() not tuned to pass the checker (integrity)',desc:'No magic delay / debugcheck-targeting right before ready() — ready() must reflect real interactivity, not a tuned timer',
      test:function(s){
        // Anti-gaming: a fixed setTimeout immediately before LoadingAPI.ready(), or a comment
        // admitting the timing exists to pass debugcheck/probe, means the game was tuned to the
        // CHECKER instead of the requirement. WARN (not hard-fail): the un-gameable runtime Probe E
        // is the source of truth for ready-timing; this static signal just flags tuning to clean up.
        if(pat(s,/(pass|fail)[^\n]{0,40}(debugcheck|debug checker|probe|runtime[- ]?test)/i))return 'warn';
        if(pat(s,/debugcheck[^\n]{0,40}(poll|tick|timing|delay)/i))return 'warn';
        if(pat(s,/setTimeout\([^)]*,\s*\d+\s*\)[\s\S]{0,120}?LoadingAPI[\s\S]{0,4}ready\s*\(/))return 'warn';
        return true;
      },warnText:'Timing appears tuned to the checker (a delay/comment referencing debugcheck/probe before ready()). Runtime Probe E verifies the REAL timing — but remove the checker-targeting code: fire ready() when the menu is actually painted (double requestAnimationFrame), not on a magic delay.'},
    {name:'Progress saved before ad (п.4.2)',desc:'player.setData/save called near ad open (progress survives ad reload)',
      test:function(s){
        // Heuristic: if interstitial is used, a save (setData/saveProgress/localStorage write) should exist too.
        if(!pat(s,/showFullscreenAdv/))return true; // no interstitial → N/A
        return pat(s,/setData\s*\(|saveProgress|saveGame|player\.setData/);
      }},
    {name:'No external ad networks',desc:'Only Yandex SDK ads (checks game source only)',
      test:function(s){
        // Only check INLINE scripts in the game source, not injected platform scripts
        // Extract content between <script> tags (inline only, skip src= tags)
        var inlineScripts='';
        var re=/<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/gi;
        var m;
        while((m=re.exec(s))!==null){inlineScripts+=m[1]+'\n';}
        return!pat(inlineScripts,/googletag|doubleclick\.net|adsbygoogle|google_ad_client/);
      }},
  ]},
  {id:'leaderboard',title:'Leaderboard',icon:'\u{1F3C6}',optional:true,checks:[
    {name:'Leaderboard API (current)',desc:'ysdk.leaderboards direct access',
      test:function(s){
        // Current API: ysdk.leaderboards.setScore/getEntries/getPlayerEntry
        if(pat(s,/ysdk\.leaderboards\b/))return true;
        // Wrapper pattern: .leaderboards. access
        if(pat(s,/\.leaderboards\./))return true;
        // Deprecated: ysdk.getLeaderboards() — warn
        if(pat(s,/getLeaderboards\s*\(/))return 'warn';
        return false;
      },failText:'No leaderboard API — use ysdk.leaderboards.setScore(name, score)',
      warnText:'Uses deprecated getLeaderboards() — migrate to ysdk.leaderboards'},
    {name:'setScore() call',desc:'ysdk.leaderboards.setScore(name, score)',
      test:function(s){
        // Current: .setScore( — direct on leaderboards or wrapper
        if(pat(s,/\.setScore\s*\(/))return true;
        // Deprecated: setLeaderboardScore — warn
        if(pat(s,/setLeaderboardScore\s*\(/))return 'warn';
        return false;
      },warnText:'Uses deprecated setLeaderboardScore() — use ysdk.leaderboards.setScore(name, score)'},
    {name:'getEntries() call',desc:'ysdk.leaderboards.getEntries(name, opts)',
      test:function(s){
        if(pat(s,/\.getEntries\s*\(/))return true;
        // Deprecated
        if(pat(s,/getLeaderboardEntries\s*\(/))return 'warn';
        return false;
      },warnText:'Uses deprecated getLeaderboardEntries() — use ysdk.leaderboards.getEntries(name, opts)'},
    {name:'Leaderboard name [a-zA-Z0-9]',desc:'Name without _ or - (e.g. "killsbest")',
      test:function(s){
        // Check ALL setScore('name') and submitScore('name') patterns
        var names=[];
        var re=/(?:\.setScore|submitScore)\s*\(\s*['"]([^'"]+)['"]/g,m;
        while((m=re.exec(s))!==null){
          // Skip console.log strings and isAvailableMethod args
          var ctx=s.substring(Math.max(0,m.index-30),m.index);
          if(ctx.indexOf('console.')>=0||ctx.indexOf('isAvailable')>=0)continue;
          names.push(m[1]);
        }
        if(names.length>0){
          var allValid=names.every(function(n){return/^[a-zA-Z0-9]+$/.test(n);});
          if(allValid)return true;
          return false;
        }
        // Check _name:'xxx' pattern (wrapper)
        var m2=s.match(/_name\s*:\s*['"]([^'"]+)['"]/);
        if(m2){
          if(/^[a-zA-Z0-9]+$/.test(m2[1]))return true;
          return false;
        }
        // setScore with variable arg — can't validate statically
        return pat(s,/\.setScore\s*\(/)?'warn':false;
      },failText:'Leaderboard name contains invalid chars — only [a-zA-Z0-9] allowed (no _ or -)',
      warnText:'setScore found but leaderboard name not detected — verify manually'},
  ]},
  // ===== RUNTIME CHECKS (v2.0) =====
  {id:'timing',title:'Timing Verification',icon:'\u23F1\uFE0F',checks:[
    {name:'GameReady after fonts',desc:'\u043F.1.19 \u2014 ready() AFTER fonts loaded',
      test:function(){
        if(!TIMING.gameReady)return 'warn';
        if(!TIMING.fontsLoaded)return 'warn';
        return TIMING.gameReady>TIMING.fontsLoaded;
      },warnText:'Not detected yet \u2014 interact with game, re-check',
      failText:'LoadingAPI.ready() fired BEFORE fonts! Move ready() after document.fonts.ready'},
    {name:'GameReady after first paint',desc:'\u043F.1.19 \u2014 ready() AFTER UI visible',
      test:function(){
        if(!TIMING.gameReady||!TIMING.firstPaint)return 'warn';
        var delta = TIMING.gameReady - TIMING.firstPaint;
        // Strict fail: ready() BEFORE first paint event (negative delta).
        if(delta < 0) return false;
        // Soft warn: same-frame timing — fine in single-file games on local
        // server (no network), suspicious when a real game has many assets.
        if(delta < 50) return 'warn';
        return true;
      },warnText:'ready() fires same frame as load — OK for tiny single-file games. Verify on real Yandex Stage that the title screen renders before the loader hides.',
      failText:'ready() fired BEFORE window.load — must wait for the title screen to be visible (REQ-1.19.2-PRECISION)'},
    {name:'GameReady not too late',desc:'\u043F.1.19 \u2014 ready() within 10s',
      test:function(){
        if(!TIMING.gameReady)return 'warn';
        return(TIMING.gameReady-TIMING.domReady)<10000;
      },warnText:'Not detected yet',
      failText:'ready() took >10s \u2014 moderation may flag as slow'},
    {name:'UI not interactive before SDK',desc:'\u043F.2.14 \u2014 no clickable content before SDK init',
      test:function(){
        if(!TIMING.sdkInit)return 'warn';
        if(!TIMING.firstUserClick)return 'warn';
        // If user clicked BEFORE SDK was initialized, game showed interactive content too early
        if(TIMING.firstUserClick<TIMING.sdkInit){
          RT._earlyClick={userClick:Math.round(TIMING.firstUserClick),sdkInit:Math.round(TIMING.sdkInit),delta:Math.round(TIMING.sdkInit-TIMING.firstUserClick)+'ms'};
          return false;
        }
        return true;
      },warnText:'Not detected yet \u2014 interact with game, re-check',
      failText:'User clicked BEFORE SDK initialized! Game shows interactive UI too early. Check RT._earlyClick'},
    {name:'Language detected before UI',desc:'\u043F.2.14 \u2014 detectLang() before interactive content',
      test:function(){
        if(!TIMING.langDetected)return 'warn';
        if(!TIMING.firstUserClick)return 'warn';
        return TIMING.langDetected<TIMING.firstUserClick;
      },warnText:'Not detected yet',
      failText:'Language detected AFTER user interaction! User sees wrong language first'},
  ]},
  {id:'overflow',title:'Visual Overflow (\u043F.1.10.1)',icon:'\u{1F4D0}',checks:[
    {name:'No elements overflow viewport',desc:'\u043F.1.10.1 \u2014 nothing outside screen',
      test:function(){
        var all=document.querySelectorAll('*'),overflowed=[];
        var vw=window.innerWidth,vh=window.innerHeight;
        all.forEach(function(el){
          var r=el.getBoundingClientRect();
          if(r.width===0||r.height===0)return;
          var cs=getComputedStyle(el);
          if(cs.display==='none'||cs.visibility==='hidden'||cs.opacity==='0')return;
          if(el.closest('.dc-overlay'))return;
          // Skip elements with animation/transform (tickers, marquees)
          if(cs.animation&&cs.animation!=='none')return;
          // Skip inside hidden modals
          if(el.closest('.modal.h,.h,[style*="display: none"],[style*="display:none"]'))return;
          // Skip inside overflow:hidden parents (content clipped, not visible)
          var p=el.parentElement;
          while(p&&p!==document.body){var po=getComputedStyle(p).overflow;if(po==='hidden'||po==='clip')return;p=p.parentElement;}
          if(r.right>vw+2||r.bottom>vh+2||r.left<-2||r.top<-2)
            overflowed.push(el.tagName+(el.id?'#'+el.id:'')+(el.className?' .'+String(el.className).split(' ')[0]:''));
        });
        if(overflowed.length===0)return true;
        RT._overflowed=overflowed;
        return overflowed.length<=2?'warn':false;
      },warnText:'Minor overflow detected \u2014 check RT._overflowed',
      failText:'Elements overflow viewport! Check console: RT._overflowed'},
    {name:'Canvas fills screen',desc:'\u043F.1.6.2.1 \u2014 game stretches to edges',
      test:function(){
        var c=document.querySelector('canvas');
        if(!c)return 'warn';
        var cw=c.clientWidth||c.width,ch=c.clientHeight||c.height;
        var vw=window.innerWidth,vh=window.innerHeight;
        // Direct check: canvas covers >=80% of viewport
        if(cw>=vw*0.8&&ch>=vh*0.8)return true;
        // Game with side panel: canvas + panel together fill width
        var gameArea=c.closest('#game,#app,.game,.app,[id*=game]');
        if(gameArea){var gr=gameArea.getBoundingClientRect();if(gr.width>=vw*0.95&&gr.height>=vh*0.8)return true;}
        // Flexible: if canvas covers >=50% AND total game container covers viewport
        var cr=c.getBoundingClientRect();
        if(cr.width>=vw*0.45&&cr.height>=vh*0.7)return 'warn';
        return false;
      },warnText:'Canvas may not fill screen \u2014 verify game area covers viewport',
      failText:'Game area does not fill screen'},
    {name:'Touch targets >= 44px',desc:'\u043F.1.8 \u2014 buttons big enough to tap',
      test:function(){
        var small=[];
        document.querySelectorAll('button,[onclick],[role=button],a,input,.btn').forEach(function(el){
          if(el.closest('.dc-overlay'))return;
          var cs=getComputedStyle(el);
          if(cs.display==='none'||cs.visibility==='hidden'||cs.opacity==='0')return;
          // Skip elements inside hidden panels/modals
          if(el.closest('.modal.h,.h,[style*="display: none"],[style*="display:none"]'))return;
          // Skip elements inside collapsed panels
          if(el.closest('.collapsed,[aria-hidden=true]'))return;
          var r=el.getBoundingClientRect();
          // Skip off-screen or zero-size elements
          if(r.width<=0||r.height<=0||r.bottom<0||r.top>window.innerHeight)return;
          if(r.width<44||r.height<44)
            small.push(el.tagName+(el.id?'#'+el.id:'')+(el.className?' .'+el.className.split(' ')[0]:'')+' '+Math.round(r.width)+'x'+Math.round(r.height));
        });
        if(small.length===0)return true;
        RT._smallButtons=small;
        return small.length<=3?'warn':false;
      },warnText:'Some buttons may be too small \u2014 check RT._smallButtons',
      failText:'Multiple buttons < 44px! Check RT._smallButtons'},
  ]},
  {id:'ad_behavior',title:'Ad Behavior (Runtime)',icon:'\u{1F4FA}',checks:[
    {name:'No interstitial before user click',desc:'\u043F.4.4 \u2014 ad after interaction',
      test:function(){
        var bad=TIMING.log.find(function(e){return e.event==='AD_WITHOUT_CLICK';});
        if(bad)return false;
        if(!TIMING.firstInterstitial)return 'warn';
        return TIMING.firstInterstitial>TIMING.firstUserClick;
      },warnText:'No interstitial shown yet \u2014 play through, re-check',
      failText:'Interstitial before user click!'},
    {name:'Ad cooldown >= 60s',desc:'\u043F.4.4 \u2014 not too frequent',
      test:function(s){
        if(pat(s,/cooldown|adTimer|lastAd|adInterval|MIN_AD_INTERVAL/i))return true;
        if(pat(s,/60000|60\s*\*\s*1000/))return true;
        return 'warn';
      },warnText:'No explicit ad cooldown found \u2014 verify manually'},
  ]},
  {id:'lang_runtime',title:'Language Check (Runtime)',icon:'\u{1F30D}',checks:[
    {name:'SDK i18n.lang read at runtime (панель Яндекса: I18n is used)',rt:true,
      test:function(){
        if(RT._i18nRead===null||RT._i18nRead===undefined)return true; // не измеримо (frozen env/нет SDK) → N/A
        return RT._i18nRead?true:false;
      },failText:'Игра НИ РАЗУ не прочитала ysdk.environment.i18n.lang в рантайме — debug-панель Яндекса покажет «I18n is not used» (риск 2.14). Типовая причина: detectLang проверяет ?lang= из URL ПЕРВЫМ, а Яндекс ВСЕГДА добавляет &lang= в URL iframe → до SDK-чтения код не доходит никогда. Порядок: SDK → URL (только как dev-fallback) → navigator.'},
    {name:'Current language detected',desc:'\u043F.2.14 \u2014 SDK language applied',
      test:function(){
        var lang=window.currentLang||window.gameLang||window._lang
          ||(window._currentLang)||(window.Plat&&window.Plat._lang)
          ||document.documentElement.lang;
        if(!lang)return 'warn';
        RT._detectedLang=lang;
        return true;
      },warnText:'Could not detect language variable'},
    {name:'setLang resets UI cache',desc:'KNOWN_ISSUES #1 \u2014 lastUIHash reset',
      test:function(s){
        // If game has UI hash caching, setLang must reset it
        if(!pat(s,/lastUIHash|lastHash/))return true; // no cache = no problem
        // Has cache — check it's reset in setLang
        var setLangBlock=extractBlock(s,/function\s+setLang/);
        if(!setLangBlock)return 'warn';
        return pat(setLangBlock,/lastUIHash\s*=\s*['"`]['"`]|lastHash\s*=\s*['"`]['"`]|lastUIHash\s*=\s*0/);
      },warnText:'setLang() not found — verify UI cache is reset on language switch',
      failText:'setLang() does not reset lastUIHash! Language switch will show stale UI'},
    {name:'No untranslated Cyrillic on non-RU',desc:'\u043F.8.2.3 \u2014 no mixed language',
      test:function(){
        var lang=RT._detectedLang||'ru';
        if(lang==='ru')return true;
        var walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
        var cyr=[],node;
        function isVisible(el){
          // Walk ancestors — element is hidden if ANY ancestor has display:none
          // or visibility:hidden, or it has zero offsetParent (not in render tree).
          if(!el)return false;
          if(el.offsetParent===null && el.tagName!=='BODY' && el.tagName!=='HTML')return false;
          while(el && el!==document.body){
            var st=getComputedStyle(el);
            if(st.display==='none'||st.visibility==='hidden')return false;
            el=el.parentElement;
          }
          return true;
        }
        while(node=walker.nextNode()){
          var p=node.parentElement;
          if(!p)continue;
          if(p.closest('.dc-overlay'))continue;
          if(!isVisible(p))continue; // skip text in hidden overlays/screens
          var t=node.textContent.trim();
          if(t.length>2&&/[\u0410-\u044f\u0451\u0401]{3,}/.test(t)){
            cyr.push(t.slice(0,40)+' (in <'+p.tagName.toLowerCase()+(p.id?' #'+p.id:'')+'>)');
          }
        }
        if(cyr.length===0)return true;
        RT._untranslated=cyr;
        return false;
      },failText:'Cyrillic on non-RU language! Check RT._untranslated in console'},
    {name:'Canvas text reminder',desc:'Canvas drawText not scannable by DOM',
      test:function(){return document.querySelector('canvas')?'warn':true;},
      warnText:'Game uses Canvas \u2014 manually verify drawText() translations for each ?lang=xx'},
  ]},
  {id:'scroll_runtime',title:'Scroll/Refresh (Runtime)',icon:'\u{1F4DC}',checks:[
    {name:'No body scroll',desc:'\u043F.1.10.2 \u2014 page should not scroll',
      test:function(){
        var html=getComputedStyle(document.documentElement),body=getComputedStyle(document.body);
        var hOk=html.overflow==='hidden'||html.overflowY==='hidden';
        var bOk=body.overflow==='hidden'||body.overflowY==='hidden';
        var osb=html.overscrollBehavior||body.overscrollBehavior||'';
        var osbOk=osb==='none'||osb==='contain';
        if(hOk&&bOk&&osbOk)return true;
        if(hOk||bOk)return 'warn';
        return false;
      },warnText:'Partial scroll protection \u2014 add overscroll-behavior:none',
      failText:'No scroll protection! Add overflow:hidden + overscroll-behavior:none'},
    {name:'Document not scrollable',desc:'Content fits viewport',
      test:function(){
        return!(document.documentElement.scrollHeight>window.innerHeight+5||document.body.scrollHeight>window.innerHeight+5);
      },failText:'Page taller than viewport \u2014 will scroll on mobile!'},
    {name:'touch-action blocks iOS refresh',desc:'touch-action:none on html/body prevents swipe gestures',
      test:function(){
        var html=getComputedStyle(document.documentElement),body=getComputedStyle(document.body);
        var ta=html.touchAction||'';var tb=body.touchAction||'';
        if(ta==='none'||tb==='none')return true;
        if(ta==='manipulation'||tb==='manipulation')return 'warn';
        return false;
      },warnText:'touch-action:manipulation allows scroll \u2014 use touch-action:none on html,body',
      failText:'No touch-action set! iOS will allow swipe-to-refresh. Add: html,body{touch-action:none}'},
    {name:'contextmenu actually blocked',desc:'Right-click preventDefault covers entire page',
      test:function(){
        // Dispatch synthetic contextmenu and check if defaultPrevented AFTER dispatch
        var testEvt=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});
        document.body.dispatchEvent(testEvt);
        if(testEvt.defaultPrevented)return true;
        // Try on a fresh element outside game area
        var outer=document.createElement('div');document.body.appendChild(outer);
        var testEvt2=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});
        outer.dispatchEvent(testEvt2);
        document.body.removeChild(outer);
        return testEvt2.defaultPrevented?true:false;
      },failText:'contextmenu NOT blocked on entire page! Handler may only cover game area. Fix: document.addEventListener("contextmenu",e=>e.preventDefault())'},
  ]},

  // ===== v2.4 RUNTIME PROBES =====
  {id:'ad_context_runtime',title:'Ad Context (v2.4 Runtime)',icon:'\u{1F4FA}',checks:[
    {name:'All interstitials follow user gesture (REQ-4.4)',desc:'Each showFullscreenAdv must fire <330ms after click/touch (Yandex limit 0.33s)',
      test:function(){
        if(!TIMING.adCalls||TIMING.adCalls.length===0)return 'warn';
        var bad=TIMING.adCalls.filter(function(c){return c.type==='interstitial'&&c.gestureDelta>330;});
        if(bad.length===0)return true;
        RT._adWithoutGesture=bad;
        return false;
      },warnText:'No interstitials shown yet — play through to verify.',
      failText:'Interstitial(s) called >330ms after last user gesture — REQ-4.4 violation. Past rejection (Circle 2048): "Реклама без пользовательского неигрового действия". Check RT._adWithoutGesture'},
    {name:'All rewarded videos follow user gesture (REQ-4.5)',desc:'showRewardedVideo must be user-initiated',
      test:function(){
        if(!TIMING.adCalls||TIMING.adCalls.length===0)return 'warn';
        var bad=TIMING.adCalls.filter(function(c){return c.type==='rewarded'&&c.gestureDelta>330;});
        if(bad.length===0)return true;
        RT._rvWithoutGesture=bad;
        return false;
      },warnText:'No rewarded ads shown yet — click an RV button to verify.',
      failText:'Rewarded video called >330ms after last gesture — REQ-4.5 violation (must be user-initiated). Check RT._rvWithoutGesture'}
  ]},
  {id:'lang_switch_runtime',title:'Lang-Switch Reactivity (v2.4)',icon:'\u{1F310}',checks:[
    {name:'setLang() actually updates visible UI',desc:'Programmatically switch lang and check no Russian remains on non-RU locale',
      test:function(){
        // Snapshot of currently visible text BEFORE switch.
        function visibleText(){
          var sb=[];
          document.body.querySelectorAll('*').forEach(function(el){
            if(el.closest('.dc-overlay'))return;
            if(el.children&&el.children.length>0)return; // leaf nodes only
            var cs=getComputedStyle(el);
            if(cs.display==='none'||cs.visibility==='hidden'||cs.opacity==='0')return;
            var t=(el.textContent||'').trim();
            if(t&&t.length<400)sb.push(t);
          });
          return sb;
        }
        // We need a setLang function and a non-Russian language to switch to.
        if(typeof setLang!=='function'){
          // Maybe game exposes only _lang variable.
          if(typeof window._lang==='undefined')return 'warn';
          // Without setLang we cannot trigger reactive update — flag.
          RT._noSetLang=true;
          return 'warn';
        }
        var currentLang=(typeof window._lang!=='undefined')?window._lang:'ru';
        var probeLang=currentLang==='en'?'tr':'en'; // switch to a different lang
        try{
          setLang(probeLang);
        }catch(e){RT._setLangError=String(e);return false;}
        // Wait a microtask, then sample. (test() is sync; do best-effort sync sampling.)
        var after=visibleText().join(' ');
        // Look for Russian-script characters in visible text. If we switched away from RU,
        // any remaining cyrillic is a renderer that didn't react.
        var cyrillicCount=(after.match(/[а-яА-ЯёЁ]/g)||[]).length;
        // Restore.
        try{setLang(currentLang);}catch(e){}
        if(probeLang!=='ru'&&cyrillicCount>20){
          RT._unreactiveCyrillicCount=cyrillicCount;
          return false;
        }
        return true;
      },warnText:'Could not test setLang — function or _lang not exposed (YG Screenshot extension will fail to switch language)',
      failText:'After setLang() to non-RU lang, visible UI still contains Russian text — some renderers do not register onLangChange. YG Screenshot extension produces wrong-language screenshots. Check RT._unreactiveCyrillicCount'}
  ]},

  {id:'runtime',title:'Runtime Detection',icon:'\u{1F3AE}',checks:[
    {name:'SDK loaded',desc:'YaGames or ysdk available at runtime',
      test:function(s){
        // Direct runtime check
        if(typeof YaGames!=='undefined'||window.ysdk)return true;
        if(RT.calls.has('YaGames global found')||RT.calls.has('ysdk global found'))return true;
        // Static fallback: SDK script tag present = will load on platform
        if(pat(s,/<script[^>]*src=["']\/sdk\.js["']/i))return 'warn';
        return false;
      },warnText:'SDK script present but not loaded (expected locally, OK on Yandex)'},
    {name:'SDK initialized',desc:'YaGames.init() was called (or dev mode)',
      test:function(s){
        // Runtime: check globals
        if(window.ysdk||typeof YaGames!=='undefined')return true;
        if(RT.calls.has('Plat.ysdk initialized')||RT.calls.has('YandexSDK initialized'))return true;
        if(RT.calls.has('Dev mode active'))return true;
        // Static fallback: if source has YaGames.init() — trust it
        if(pat(s,/YaGames\.init\s*\(/))return 'warn';
        return false;
      },warnText:'YaGames.init() in source but SDK not detected at runtime (OK if local)'},
    {name:'No console errors',desc:'Clean console',
      test:function(){
        var real=RT.errors.filter(function(e){return!/favicon|debugcheck|404|sdk\.js/.test(e);});
        return real.length===0?true:(real.length<=3?'warn':false);
      },warnText:'Some console errors detected',failText:'Multiple console errors!'},
  ]},
];

// Node-only export so the negative-test harness can run the REAL static checks against fixtures
// (no behavior change in browser — typeof module is 'undefined' there). This guarantees the test
// exercises the exact same check code that ships, not a re-extracted copy.
try { if (typeof module !== 'undefined' && module.exports) { module.exports.__CATS = CATS; } } catch (e) {}

// ── Last report (for copy) ──────────────────────────────────────
var _lastReport='';

// ── Source code fetch (supports multi-file games) ───────────────
function getSource(cb){
  var bust='?_dc='+Date.now();
  var tryPaths=['index.html'+bust,window.location.pathname+bust,window.location.href+(window.location.href.indexOf('?')===-1?bust:('&_dc='+Date.now()))];
  var attempt=0;
  function tryNext(){
    if(attempt>=tryPaths.length){cb(stripSelf(document.documentElement.outerHTML));return;}
    var xhr=new XMLHttpRequest();
    xhr.open('GET',tryPaths[attempt],true);
    xhr.onload=function(){
      if(xhr.status===200&&xhr.responseText.length>100){
        // Got index.html — now also fetch all linked JS files
        fetchLinkedScripts(xhr.responseText,function(src){cb(stripSelf(src));});
      }else{attempt++;tryNext();}
    };
    xhr.onerror=function(){attempt++;tryNext();};
    xhr.send();
  }
  tryNext();
}

// Strip debugcheck.js and cheats-base.js content from the scanned source.
// Without this, every check that uses regex literals (e.g. /alert\(/, /let\s+_lang/)
// would self-detect inside debugcheck's own check definitions and report FALSE
// positives. Markers are inserted in templates/html5/{debugcheck,cheats-base}.js.
function stripSelf(src){
  if(!src)return src;
  src = src.replace(/\/\/ === DEBUGCHECK_SELF_START ===[\s\S]*?\/\/ === DEBUGCHECK_SELF_END ===/g, '/* debugcheck stripped */');
  src = src.replace(/\/\/ === CHEATS_SELF_START ===[\s\S]*?\/\/ === CHEATS_SELF_END ===/g, '/* cheats stripped */');
  return src;
}

function fetchLinkedScripts(indexSrc,cb){
  // Find all <script src="..."> tags (relative paths only, skip /sdk.js and absolute URLs)
  var re=/<script[^>]+src=["']([^"']+)["'][^>]*>/gi;
  var m,urls=[];
  while((m=re.exec(indexSrc))!==null){
    var u=m[1];
    if(u==='/sdk.js'||/^https?:\/\//.test(u)||/debugcheck/i.test(u))continue; // skip SDK, external, and self
    urls.push(u);
  }
  // Also find <link rel="stylesheet" href="...">
  var cssRe=/<link[^>]+href=["']([^"']+\.css)["'][^>]*>/gi;
  while((m=cssRe.exec(indexSrc))!==null){
    if(!/^https?:\/\//.test(m[1]))urls.push(m[1]);
  }
  if(urls.length===0){cb(indexSrc);return;}

  var allSrc=indexSrc;
  var loaded=0;
  var bust='?_dc='+Date.now();
  urls.forEach(function(url){
    var xhr=new XMLHttpRequest();
    xhr.open('GET',url+bust,true);
    xhr.onload=function(){
      if(xhr.status===200)allSrc+='\n/* === '+url+' === */\n'+xhr.responseText;
      loaded++;
      if(loaded>=urls.length)cb(allSrc);
    };
    xhr.onerror=function(){loaded++;if(loaded>=urls.length)cb(allSrc);};
    xhr.send();
  });
}

// ── Run Checks ──────────────────────────────────────────────────
function runChecks(){
  probeRuntime(); // fresh probe before each check
  getSource(function(src){
    window._dcSource=src; // Store for LB tools auto-detection
    var pass=0,fail=0,warn=0;
    var html='';
    var report='YG DEBUG CHECKER REPORT\n';
    report+='Date: '+new Date().toLocaleString()+'\n';
    report+='URL: '+window.location.href+'\n';
    report+='Source size: '+Math.round(src.length/1024)+' KB\n';
    report+='================================\n\n';

    CATS.forEach(function(cat){
      // Skip optional categories if none of their checks pass.
      // A check is considered "present" only if it returns true (not 'warn', not
      // {pass:true,details:'No IAP — n/a'} — guard checks that pass when feature
      // is absent must NOT count toward presence detection).
      // Additionally: skip checks tagged with `guard:true` — they only validate
      // that an absent feature stays absent, never proving the feature exists.
      if(cat.optional){
        var anyPresent=false;
        cat.checks.forEach(function(ch){
          if(ch.guard) return;
          try{
            var r=ch.test(src);
            if(r === true) anyPresent = true;
          }catch(e){}
        });
        if(!anyPresent){
          // Show as N/A, don't count as fail
          var skipReport=cat.icon+' '+cat.title+' — N/A (not used)\n';
          report+=skipReport+'\n';
          html+='<div class="dc-sec">'
            +'<div class="dc-sh">'
            +'<span class="dc-arr">\u25B6</span>'
            +'<span class="dc-si">'+cat.icon+'</span>'
            +'<span class="dc-st">'+cat.title+'</span>'
            +'<span class="dc-badge" style="background:#1a1a2e;color:#666">N/A</span>'
            +'<span class="dc-cnt" style="color:#555">not used</span>'
            +'</div>'
            +'<div class="dc-sb"></div>'
            +'</div>';
          return; // skip this category
        }
      }
      var cp=0,cf=0,cw=0;
      var rows='';
      var catReport=cat.icon+' '+cat.title+'\n';

      cat.checks.forEach(function(ch){
        var result;
        try{result=ch.test(src);}catch(e){result=false;}

        // Normalize result. Supported shapes:
        //   true                              → PASS
        //   'warn'                            → WARN (use ch.warnText)
        //   false                             → FAIL (use ch.failText)
        //   { pass:true, details:'...' }      → PASS, override "Found" with details
        //   { pass:false, details:'...' }     → FAIL, override failText with details
        //   { pass:'warn', details:'...' }    → WARN, override warnText with details
        var status, customDetails = null;
        if (result && typeof result === 'object' && 'pass' in result) {
          status = result.pass === true ? 'pass' : (result.pass === 'warn' ? 'warn' : 'fail');
          customDetails = result.details || null;
        } else if (result === true) status = 'pass';
        else if (result === 'warn') status = 'warn';
        else status = 'fail';

        var icon,cls,detail,reportLine;
        if(status === 'pass'){
          icon='\u2714';cls='dc-pass';cp++;pass++;
          detail='<span class="dc-det dc-ok">'+(customDetails||'Found')+'</span>';
          reportLine='  [PASS] '+ch.name+(customDetails?' — '+customDetails:'');
        }else if(status === 'warn'){
          icon='\u26A0';cls='dc-warn';cw++;warn++;
          var wt = customDetails || ch.warnText || 'Verify manually';
          detail='<span class="dc-det dc-wr">'+wt+'</span>';
          reportLine='  [WARN] '+ch.name+' — '+wt;
        }else{
          icon='\u2718';cls='dc-fail';cf++;fail++;
          var ft = customDetails || ch.failText || 'Not found!';
          detail='<span class="dc-det dc-no">'+ft+'</span>';
          reportLine='  [FAIL] '+ch.name+' — '+ft;
        }

        catReport+=reportLine+'\n';
        rows+='<div class="dc-row"><span class="dc-icon '+cls+'">'+icon+'</span>'
          +'<div class="dc-txt"><div class="dc-name">'+ch.name+'</div>'
          +'<div class="dc-desc">'+ch.desc+'</div>'+detail+'</div></div>';
      });

      var badge,bcls;
      if(cf>0){badge=cf+' FAIL';bcls='dc-bfail';}
      else if(cw>0){badge=cw+' WARN';bcls='dc-bwarn';}
      else{badge='OK';bcls='dc-bpass';}

      report+=catReport+'\n';

      var open=cf>0||cw>0;
      html+='<div class="dc-sec">'
        +'<div class="dc-sh'+(open?' dc-open':'')+'" onclick="this.classList.toggle(\'dc-open\');this.nextElementSibling.classList.toggle(\'dc-open\')">'
        +'<span class="dc-arr">\u25B6</span>'
        +'<span class="dc-si">'+cat.icon+'</span>'
        +'<span class="dc-st">'+cat.title+'</span>'
        +'<span class="dc-badge '+bcls+'">'+badge+'</span>'
        +'<span class="dc-cnt">'+cp+'/'+cat.checks.length+'</span>'
        +'</div>'
        +'<div class="dc-sb'+(open?' dc-open':'')+'">'+rows+'</div>'
        +'</div>';
    });

    var total=pass+fail+warn;
    var pct=total>0?Math.round(pass/total*100):0;
    var fillCls=pct>=90?'dc-fp':(pct>=70?'dc-fw':'dc-ff');

    report+='================================\n';
    report+='TOTAL: '+pass+' pass, '+fail+' fail, '+warn+' warn ('+pct+'%)\n';
    if(fail===0)report+='READY FOR MODERATION\n';
    else report+='ISSUES TO FIX: '+fail+'\n';
    _lastReport=report;

    var summary='<div class="dc-sum">'
      +'<div class="dc-sc dc-sg"><div class="dc-sn">'+pass+'</div><div class="dc-sl">PASS</div></div>'
      +'<div class="dc-sc dc-sr"><div class="dc-sn">'+fail+'</div><div class="dc-sl">FAIL</div></div>'
      +'<div class="dc-sc dc-sy"><div class="dc-sn">'+warn+'</div><div class="dc-sl">WARN</div></div>'
      +'<div class="dc-sc dc-sb2"><div class="dc-sn">'+pct+'%</div><div class="dc-sl">SCORE</div></div>'
      +'</div>'
      +'<div class="dc-bar"><div class="dc-fill '+fillCls+'" style="width:'+pct+'%"></div></div>'
      +'<div class="dc-msg">'+(fail===0?'\u2705 Ready for moderation!':'\u274C '+fail+' issue(s) to fix')+'</div>';

    var body=_panel.querySelector('.dc-body');
    body.innerHTML=buildPreSubmitBanner()+summary+html+buildTimingLog()+buildLBTools();
    // Async refresh — fetch pre-submit report and re-paint banner if available.
    refreshPreSubmitBanner(body, summary, html);
  });
}

// ── Pre-Submit Report Banner (v2.5) ────────────────────────────
// Tries to fetch ".pre-submit-report.json" (written by scripts/pre-submit.mjs)
// from the same origin as the game. If found, shows static-validator summary
// inline with the runtime checks — single pane of glass.
var _preSubmitCache=null;
function buildPreSubmitBanner(){
  if(_preSubmitCache===null){
    return '<div class="dc-presubmit dc-ps-loading">'
      + '<b>📋 Pre-Submit (static)</b> — fetching <code>.pre-submit-report.json</code>...'
      + '</div>';
  }
  if(_preSubmitCache===false){
    return '<div class="dc-presubmit dc-ps-miss">'
      + '<b>📋 Pre-Submit (static)</b> — report not bundled with game. '
      + 'Run <code>node scripts/pre-submit.mjs WorkProgress/{Game}/</code> separately.'
      + '</div>';
  }
  var r=_preSubmitCache;
  var b=r.summary.blockers, w=r.summary.warnings, i=r.summary.infos, f=r.summary.fatals;
  var cls=b>0||f>0?'dc-ps-fail':(w>0?'dc-ps-warn':'dc-ps-ok');
  var verdict=b>0||f>0?'❌ BLOCKED':(w>0?'⚠️ READY (review warnings)':'✅ READY');
  var ts=r.timestamp?new Date(r.timestamp).toLocaleString():'';
  var details='';
  if(b>0){
    details+='<div class="dc-ps-list"><b>Blockers:</b><ul>';
    r.validators.forEach(function(v){
      if(!v.ok||!v.issues)return;
      v.issues.forEach(function(iss){
        if(iss.level==='blocker'){
          details+='<li><code>'+iss.id+'</code> — '+escHtml(iss.message)+(iss.file?' ('+escHtml((iss.file||'').split(/[\\/]/).pop())+')':'')+'</li>';
        }
      });
    });
    details+='</ul></div>';
  }
  return '<div class="dc-presubmit '+cls+'">'
    + '<b>📋 Pre-Submit (static): '+verdict+'</b> — '
    + b+' blockers, '+w+' warnings, '+i+' infos'+(f>0?', '+f+' fatals':'')
    + (ts?' <span class="dc-ps-ts">('+ts+')</span>':'')
    + details
    + '</div>';
}
function refreshPreSubmitBanner(body, summary, html){
  if(_preSubmitCache!==null)return;
  try{
    fetch('.pre-submit-report.json',{cache:'no-store'})
      .then(function(r){if(!r.ok)throw new Error('404');return r.json();})
      .then(function(json){
        _preSubmitCache=json;
        body.innerHTML=buildPreSubmitBanner()+summary+html+buildTimingLog()+buildLBTools();
      })
      .catch(function(){
        _preSubmitCache=false;
        body.innerHTML=buildPreSubmitBanner()+summary+html+buildTimingLog()+buildLBTools();
      });
  }catch(e){
    _preSubmitCache=false;
  }
}
function escHtml(s){return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}

// ── Event Timeline ─────────────────────────────────────────────
function buildTimingLog(){
  var events=TIMING.log.map(function(e){
    var ms=Math.round(e.delta);
    var color=e.warning?'#ed1b35':'#44b85c';
    return '<div style="font-size:10px;color:'+color+';font-family:monospace">+'+ms+'ms '+e.event+(e.warning?' \u26A0\uFE0F '+e.warning:'')+'</div>';
  }).join('');
  // ВЕРДИКТ ПО ПОРЯДКУ (v2.21): панель знала ожидаемый порядок, но не проверяла его.
  var verdicts=[], bad=false;
  function vd(ok,txt){ verdicts.push('<div style="font-size:10px;font-family:monospace;color:'+(ok?'#44b85c':'#ed1b35')+'">'+(ok?'\u2713 ':'\u2717 ')+txt+'</div>'); if(!ok)bad=true; }
  if(TIMING.firstUserClick&&TIMING.gameReady)
    vd(TIMING.firstUserClick>TIMING.gameReady,'ввод после ready() (REQ-1.19): клик '+Math.round(TIMING.firstUserClick)+'ms, ready '+Math.round(TIMING.gameReady)+'ms'+(TIMING.firstUserClick<TIMING.gameReady?' \u2014 ОТКАЗ: игра играбельна до ready()':''));
  if(TIMING.langDetected&&TIMING.firstUserClick)
    vd(TIMING.langDetected<TIMING.firstUserClick,'язык до первого ввода (REQ-2.14): язык '+Math.round(TIMING.langDetected)+'ms, клик '+Math.round(TIMING.firstUserClick)+'ms');
  if(TIMING.langDetected&&TIMING.gameReady)
    vd(TIMING.langDetected<TIMING.gameReady,'язык до ready(): язык '+Math.round(TIMING.langDetected)+'ms, ready '+Math.round(TIMING.gameReady)+'ms');
  if(TIMING.gameReady&&TIMING.sdkInit)
    vd(TIMING.gameReady>TIMING.sdkInit,'ready() после init SDK');
  var verdictHtml = verdicts.length ? '<div style="margin-top:8px;padding-top:6px;border-top:1px solid #333">'+verdicts.join('')+'</div>' : '';
  return '<div class="dc-sec"><div class="dc-sh" onclick="this.classList.toggle(\'dc-open\');this.nextElementSibling.classList.toggle(\'dc-open\')">'
    +'<span class="dc-arr">\u25B6</span><span class="dc-si">\u{1F4CA}</span>'
    +'<span class="dc-st">Event Timeline</span>'
    +'<span class="dc-badge '+(bad?'dc-bfail':(verdicts.length?'dc-bpass':'dc-bwarn'))+'">'+(bad?'ORDER FAIL':(verdicts.length?'ORDER OK':'LOG'))+'</span></div>'
    +'<div class="dc-sb" style="padding:8px 12px;max-height:200px;overflow-y:auto">'
    +(events||'<div style="color:#666;font-size:11px">No events yet \u2014 interact with game, then re-check</div>')
    +verdictHtml
    +'<div style="margin-top:8px;font-size:10px;color:#666">Expected: domReady \u2192 fontsLoaded \u2192 firstPaint \u2192 langDetected \u2192 gameReady \u2192 firstUserClick \u2192 gameplayStart</div>'
    +'</div></div>';
}

// ── Leaderboard Test Tools ──────────────────────────────────────
function buildLBTools(){
  return '<div class="dc-sec"><div class="dc-sh dc-open" onclick="this.classList.toggle(\'dc-open\');this.nextElementSibling.classList.toggle(\'dc-open\')">'
    +'<span class="dc-arr">\u25B6</span><span class="dc-si">\u{1F3AF}</span>'
    +'<span class="dc-st">Leaderboard Test</span>'
    +'<span class="dc-badge dc-bwarn">TOOLS</span></div>'
    +'<div class="dc-sb dc-open" style="padding:10px 12px">'
    +'<div style="font-size:11px;color:#888;margin-bottom:8px">Send test scores to leaderboards (rate limit: 1/sec)</div>'
    +'<div id="dc-lb-boards"></div>'
    +'<div id="dc-lb-log" style="margin-top:8px;font-size:11px;color:#888;max-height:120px;overflow-y:auto;font-family:monospace"></div>'
    +'</div></div>';
}

// Initialize LB tools after panel renders
var _lbToolsInit=setInterval(function(){
  var el=document.getElementById('dc-lb-boards');
  if(!el)return;
  clearInterval(_lbToolsInit);

  // Auto-detect leaderboard names from game source code
  function detectBoards(){
    var boards=[];
    var seen={};
    // Search page source for setScore('name', ...) patterns
    var scripts=document.querySelectorAll('script:not([src])');
    var src='';
    scripts.forEach(function(s){src+=s.textContent;});
    // Also check linked scripts (already fetched by debugcheck)
    if(window._dcSource)src+=window._dcSource;

    // Pattern 1: setScore('boardname', ...)
    var re1=/\.setScore\s*\(\s*['"]([a-zA-Z0-9]+)['"]/g,m;
    while((m=re1.exec(src))!==null){
      if(!seen[m[1]]&&m[1]!=='name'){seen[m[1]]=1;boards.push({name:m[1],label:m[1],defVal:'1000',desc:'auto-detected'});}
    }
    // Pattern 2: submitScore('boardname', ...)
    var re2=/submitScore\s*\(\s*['"]([a-zA-Z0-9]+)['"]/g;
    while((m=re2.exec(src))!==null){
      if(!seen[m[1]]){seen[m[1]]=1;boards.push({name:m[1],label:m[1],defVal:'1000',desc:'auto-detected'});}
    }
    // Pattern 3: _name:'boardname' in wrapper config
    var re3=/_name\s*:\s*['"]([a-zA-Z0-9]+)['"]/g;
    while((m=re3.exec(src))!==null){
      if(!seen[m[1]]){seen[m[1]]=1;boards.push({name:m[1],label:m[1],defVal:'1000',desc:'auto-detected'});}
    }
    // Pattern 4: getEntries('boardname', ...)
    var re4=/\.getEntries\s*\(\s*['"]([a-zA-Z0-9]+)['"]/g;
    while((m=re4.exec(src))!==null){
      if(!seen[m[1]]){seen[m[1]]=1;boards.push({name:m[1],label:m[1],defVal:'1000',desc:'auto-detected'});}
    }
    // Fallback: manual input if none found
    if(boards.length===0){
      boards.push({name:'score',label:'score',defVal:'1000',desc:'default (edit name)'});
    }
    return boards;
  }

  var boards=detectBoards();

  var html='';
  boards.forEach(function(b){
    html+='<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">'
      +'<span style="width:80px;font-size:11px;color:#ccc">'+b.label+':</span>'
      +'<input id="dc-lb-'+b.name+'" type="number" value="'+b.defVal+'" style="width:100px;background:#1a1a2e;border:1px solid #333;color:#fff;padding:4px 6px;border-radius:4px;font-size:11px;font-family:monospace">'
      +'<span style="font-size:10px;color:#555">'+b.desc+'</span>'
      +'</div>';
  });
  html+='<div style="display:flex;gap:6px;margin-top:8px">'
    +'<button id="dc-lb-send-all" style="flex:1;background:#143d22;border:1px solid #44b85c;color:#44b85c;padding:6px;border-radius:4px;cursor:pointer;font-size:11px;font-family:monospace">\u{1F4E4} Send All (with delays)</button>'
    +'<button id="dc-lb-read" style="flex:1;background:#0a1a2d;border:1px solid #3b82f6;color:#3b82f6;padding:6px;border-radius:4px;cursor:pointer;font-size:11px;font-family:monospace">\u{1F4E5} Read All</button>'
    +'</div>';
  el.innerHTML=html;

  function lbLog(msg){
    var log=document.getElementById('dc-lb-log');
    if(!log)return;
    var t=new Date().toLocaleTimeString();
    log.innerHTML='<div>['+t+'] '+msg+'</div>'+log.innerHTML;
  }

  document.getElementById('dc-lb-send-all').onclick=async function(){
    var plat=window.Plat;
    if(!plat||!plat._lb){lbLog('\u274C Plat._lb not available (dev mode?)');return;}
    var btn=this;btn.disabled=true;btn.textContent='\u23F3 Sending...';
    for(var i=0;i<boards.length;i++){
      var b=boards[i];
      var val=parseInt(document.getElementById('dc-lb-'+b.name).value)||0;
      if(val<=0){lbLog('\u26A0 Skip '+b.name+': value=0');continue;}
      try{
        lbLog('\u{1F4E4} '+b.name+' = '+val+'...');
        await plat._lb.setScore(b.name,val);
        lbLog('\u2705 '+b.name+' OK');
      }catch(e){
        lbLog('\u274C '+b.name+': '+e.message);
      }
      if(i<boards.length-1)await new Promise(function(r){setTimeout(r,1200);});
    }
    btn.disabled=false;btn.textContent='\u{1F4E4} Send All (with delays)';
  };

  document.getElementById('dc-lb-read').onclick=async function(){
    var plat=window.Plat;
    if(!plat||!plat._lb){lbLog('\u274C Plat._lb not available (dev mode?)');return;}
    var btn=this;btn.disabled=true;btn.textContent='\u23F3 Reading...';
    for(var i=0;i<boards.length;i++){
      var b=boards[i];
      try{
        lbLog('\u{1F4E5} Reading '+b.name+'...');
        var res=await plat._lb.getEntries(b.name,{quantityTop:5,includeUser:true});
        var count=res&&res.entries?res.entries.length:0;
        lbLog('\u2705 '+b.name+': '+count+' entries');
        if(res&&res.entries){
          res.entries.forEach(function(e){
            var name=e.player.publicName||'Anon';
            lbLog('  #'+e.rank+' '+name+' = '+e.score);
          });
        }
      }catch(e){
        lbLog('\u274C '+b.name+': '+e.message);
      }
    }
    btn.disabled=false;btn.textContent='\u{1F4E5} Read All';
  };
},200);

// ── Copy report to clipboard ────────────────────────────────────
function copyReport(){
  if(!_lastReport){return;}
  var copyBtn=_panel.querySelector('.dc-copy');
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(_lastReport).then(function(){
      if(copyBtn){copyBtn.textContent='\u2705';setTimeout(function(){copyBtn.textContent='\u{1F4CB}';},1500);}
    }).catch(function(){fallbackCopy();});
  }else{fallbackCopy();}

  function fallbackCopy(){
    var ta=document.createElement('textarea');
    ta.value=_lastReport;
    ta.style.cssText='position:fixed;left:-9999px;';
    document.body.appendChild(ta);
    ta.select();
    try{document.execCommand('copy');
      if(copyBtn){copyBtn.textContent='\u2705';setTimeout(function(){copyBtn.textContent='\u{1F4CB}';},1500);}
    }catch(e){}
    document.body.removeChild(ta);
  }
}

// ── Create Panel UI ─────────────────────────────────────────────
function createPanel(){
  var style=document.createElement('style');
  style.textContent=`
    .dc-overlay{position:fixed;top:0;left:0;width:100%;height:100%;z-index:999999;display:flex;pointer-events:none;}
    .dc-panel{position:absolute;top:10px;right:10px;width:380px;height:calc(100vh - 20px);background:#0f0f1a;border:2px solid #f5a623;border-radius:12px;overflow:hidden;display:flex;flex-direction:column;pointer-events:auto;font-family:'Segoe UI',system-ui,sans-serif;font-size:13px;color:#e0e0e0;box-shadow:0 8px 32px rgba(0,0,0,.6);resize:vertical;}
    .dc-head{padding:12px 16px;background:linear-gradient(135deg,#1a1a2e,#16213e);border-bottom:2px solid #f5a623;display:flex;align-items:center;gap:10px;cursor:move;user-select:none;}
    .dc-head h2{margin:0;font-size:15px;color:#f5a623;flex:1;}
    .dc-hico{font-size:22px;}
    .dc-close{background:none;border:none;color:#888;font-size:20px;cursor:pointer;padding:0 4px;line-height:1;}
    .dc-close:hover{color:#f55;}
    .dc-hbtn{background:none;border:none;color:#888;font-size:16px;cursor:pointer;padding:0 4px;}
    .dc-hbtn:hover{color:#f5a623;}
    .dc-body{overflow-y:auto;padding:12px;flex:1;}
    .dc-presubmit{padding:10px 12px;border-radius:8px;margin-bottom:12px;font-size:12px;border:1px solid #333;background:#0a0a18;}
    .dc-presubmit b{font-size:13px;}
    .dc-presubmit code{background:#1a1a2e;padding:1px 5px;border-radius:3px;font-size:11px;color:#bbb;}
    .dc-ps-loading{color:#888;}
    .dc-ps-miss{color:#aaa;border-color:#555;}
    .dc-ps-ok{background:#0d2818;border-color:#44b85c;color:#9eda9e;}
    .dc-ps-warn{background:#2d2200;border-color:#f5a623;color:#f5cf85;}
    .dc-ps-fail{background:#2d0a0a;border-color:#ed1b35;color:#ed8b8b;}
    .dc-ps-ts{color:#666;font-weight:400;font-size:10px;}
    .dc-ps-list{margin-top:8px;font-size:11px;color:#fff;}
    .dc-ps-list ul{margin:4px 0 0 0;padding-left:18px;}
    .dc-ps-list li{margin-bottom:3px;}
    .dc-sum{display:flex;gap:8px;margin-bottom:12px;}
    .dc-sc{flex:1;padding:10px 6px;border-radius:8px;text-align:center;}
    .dc-sg{background:#0d2818;border:1px solid #44b85c;}
    .dc-sr{background:#2d0a0a;border:1px solid #ed1b35;}
    .dc-sy{background:#2d2200;border:1px solid #f5a623;}
    .dc-sb2{background:#0a1a2d;border:1px solid #3b82f6;}
    .dc-sn{font-size:22px;font-weight:700;}
    .dc-sg .dc-sn{color:#44b85c;}
    .dc-sr .dc-sn{color:#ed1b35;}
    .dc-sy .dc-sn{color:#f5a623;}
    .dc-sb2 .dc-sn{color:#3b82f6;}
    .dc-sl{font-size:10px;color:#888;margin-top:2px;}
    .dc-bar{width:100%;height:4px;background:#222;border-radius:2px;margin-bottom:6px;overflow:hidden;}
    .dc-fill{height:100%;border-radius:2px;transition:width .5s;}
    .dc-fp{background:#44b85c;}.dc-fw{background:#f5a623;}.dc-ff{background:#ed1b35;}
    .dc-msg{text-align:center;font-size:11px;color:#888;margin-bottom:14px;}
    .dc-sec{margin-bottom:8px;border:1px solid #222;border-radius:8px;overflow:hidden;}
    .dc-sh{padding:10px 12px;background:#16162a;cursor:pointer;display:flex;align-items:center;gap:8px;user-select:none;}
    .dc-sh:hover{background:#1a1a35;}
    .dc-arr{font-size:10px;color:#666;transition:transform .2s;}
    .dc-sh.dc-open .dc-arr{transform:rotate(90deg);}
    .dc-si{font-size:15px;}
    .dc-st{flex:1;font-weight:600;font-size:13px;}
    .dc-badge{padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;}
    .dc-bpass{background:#143d22;color:#44b85c;}
    .dc-bfail{background:#3d1414;color:#ed1b35;}
    .dc-bwarn{background:#3d3000;color:#f5a623;}
    .dc-cnt{color:#555;font-size:11px;}
    .dc-sb{display:none;padding:2px 0;}
    .dc-sb.dc-open{display:block;}
    .dc-row{padding:7px 12px;display:flex;align-items:flex-start;gap:8px;border-top:1px solid #1a1a2e;}
    .dc-row:first-child{border-top:none;}
    .dc-icon{font-size:14px;min-width:18px;text-align:center;padding-top:1px;}
    .dc-icon.dc-pass{color:#44b85c;}
    .dc-icon.dc-fail{color:#ed1b35;}
    .dc-icon.dc-warn{color:#f5a623;}
    .dc-txt{flex:1;}
    .dc-name{font-size:12px;color:#ccc;}
    .dc-desc{font-size:10px;color:#666;margin-top:1px;}
    .dc-det{font-size:10px;display:block;margin-top:2px;font-family:'Cascadia Code','Fira Code',monospace;}
    .dc-ok{color:#44b85c;}
    .dc-no{color:#ed1b35;}
    .dc-wr{color:#f5a623;}
  `;
  document.head.appendChild(style);

  _panel=document.createElement('div');
  _panel.className='dc-overlay';
  _panel.innerHTML='<div class="dc-panel">'
    +'<div class="dc-head">'
    +'<span class="dc-hico">\u{1F3AE}</span>'
    +'<h2>YG Debug Checker</h2>'
    +'<button class="dc-hbtn dc-copy" title="Copy report">\u{1F4CB}</button>'
    +'<button class="dc-hbtn dc-refresh" title="Re-check">\u{1F504}</button>'
    +'<button class="dc-close" title="Close">\u2715</button>'
    +'</div>'
    +'<div class="dc-body"><div style="text-align:center;padding:30px;color:#888;">\u{1F50D} Analyzing...</div></div>'
    +'</div>';

  document.body.appendChild(_panel);

  _panel.querySelector('.dc-close').onclick=function(){_visible=false;_panel.style.display='none';};
  _panel.querySelector('.dc-refresh').onclick=function(){runChecks();};
  _panel.querySelector('.dc-copy').onclick=function(){copyReport();};

  // Draggable
  var head=_panel.querySelector('.dc-head');
  var panel=_panel.querySelector('.dc-panel');
  var dx=0,dy=0,dragging=false;
  head.onmousedown=function(e){
    if(e.target.tagName==='BUTTON')return;
    dragging=true;
    dx=e.clientX-panel.offsetLeft;
    dy=e.clientY-panel.offsetTop;
    e.preventDefault();
  };
  document.addEventListener('mousemove',function(e){
    if(!dragging)return;
    panel.style.left=(e.clientX-dx)+'px';
    panel.style.top=(e.clientY-dy)+'px';
    panel.style.right='auto';
  });
  document.addEventListener('mouseup',function(){dragging=false;});
}

})();
// === DEBUGCHECK_SELF_END === (do not remove)
