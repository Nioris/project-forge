// Universal Cheat Panel — Marketing Build Template
// Activation: Ctrl+Shift+9 (toggle panel)
// Hotkeys: P = silent pause, L = cycle language
//
// USAGE: Copy this file as cheats.js into marketing builds.
// Add game-specific buttons by editing the `gameButtons` array below.
// The panel auto-detects common game APIs (_mktFreeze, _lang, applyStaticLang, etc.)
//
(function(){
  let panel = null;
  let visible = false;

  // ===== GAME-SPECIFIC BUTTONS =====
  // Override this array per game. Format: [label, function]
  // Access game cheat API: window._cheat
  const gameButtons = [
    // Example:
    // ['+1000 Score', () => { if(C()) C().addScore(1000); }],
  ];

  function C() { return window._cheat; }

  // ===== PANEL UI =====
  function createPanel() {
    panel = document.createElement('div');
    panel.id = 'cheat-panel';
    panel.style.cssText = 'position:fixed;top:10px;left:10px;z-index:999999;background:rgba(10,5,30,.95);border:2px solid #edc22e;border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:5px;font-family:monospace;font-size:11px;color:#edc22e;max-width:200px;max-height:90vh;overflow-y:auto;backdrop-filter:blur(4px)';

    // Title
    const title = document.createElement('div');
    title.textContent = '\u{1F3AE} CHEATS';
    title.style.cssText = 'font-size:14px;font-weight:bold;text-align:center;margin-bottom:2px;color:#fc4';
    panel.appendChild(title);

    // Close button
    const closeBtn = document.createElement('div');
    closeBtn.textContent = '\u2715';
    closeBtn.style.cssText = 'position:absolute;top:6px;right:10px;cursor:pointer;font-size:16px;color:#888';
    closeBtn.onclick = () => toggle();
    panel.appendChild(closeBtn);

    // --- Marketing tools section ---
    addSeparator('\u{1F4F7} SCREENSHOT TOOLS');

    addBtn('\u23F8 Silent Pause [P]', silentFreeze, '#4af');
    addBtn('\u{1F310} Cycle Lang [L]', cycleLang, '#4af');
    addBtn('\u{1F441} Hide Overlays', hideOverlays, '#4af');

    // --- Game-specific section ---
    if (gameButtons.length > 0) {
      addSeparator('\u{1F3AE} GAME CHEATS');
      gameButtons.forEach(([label, fn]) => addBtn(label, fn));
    }

    document.body.appendChild(panel);
  }

  function addBtn(label, fn, color) {
    const c = color || '#edc22e';
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = `background:rgba(${hexToRgb(c)},.12);border:1px solid ${c}55;border-radius:4px;color:${c};padding:5px 8px;cursor:pointer;font-family:monospace;font-size:10px;text-align:left;width:100%`;
    b.onmouseenter = () => b.style.background = `rgba(${hexToRgb(c)},.25)`;
    b.onmouseleave = () => b.style.background = `rgba(${hexToRgb(c)},.12)`;
    b.onclick = fn;
    panel.appendChild(b);
  }

  function addSeparator(text) {
    const s = document.createElement('div');
    s.textContent = text;
    s.style.cssText = 'font-size:9px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-top:6px;padding-bottom:2px;border-bottom:1px solid #333';
    panel.appendChild(s);
  }

  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    return [parseInt(hex.substr(0,2),16), parseInt(hex.substr(2,2),16), parseInt(hex.substr(4,2),16)].join(',');
  }

  function toggle() {
    if (!panel) createPanel();
    visible = !visible;
    panel.style.display = visible ? 'flex' : 'none';
  }

  // ===== SILENT FREEZE =====
  function silentFreeze() {
    if (typeof window._mktFreeze === 'function') {
      var r = window._mktFreeze();
      showNotify(r === 'paused' ? '\u23F8 FREEZE' : '\u25B6 PLAY');
    } else {
      showNotify('\u26A0 No _mktFreeze()');
    }
  }

  // ===== CYCLE LANGUAGE =====
  const LANGS = ['ru','en','es','tr','pt','ar','id','fr','ja','it','de','hi','zh'];
  let langIdx = 0;

  function cycleLang() {
    langIdx = (langIdx + 1) % LANGS.length;
    const l = LANGS[langIdx];

    // Set global lang variable (try multiple patterns)
    try { if (typeof _lang !== 'undefined') _lang = l; } catch(e) {}
    window._lang = l;

    // RTL for Arabic
    if (l === 'ar') document.documentElement.setAttribute('dir', 'rtl');
    else document.documentElement.removeAttribute('dir');

    // Try common re-render functions
    if (typeof applyStaticLang === 'function') applyStaticLang();
    if (typeof applyLang === 'function') applyLang();
    if (typeof updateLang === 'function') updateLang(l);
    if (typeof setLanguage === 'function') setLanguage(l);

    // Force re-draw
    if (typeof render === 'function') render();
    if (typeof draw === 'function') draw();
    if (typeof redraw === 'function') redraw();

    showNotify('\u{1F310} ' + l.toUpperCase());
  }

  // Sync langIdx with current game language
  function syncLangIdx() {
    const cur = (typeof _lang !== 'undefined') ? _lang : (window._lang || null);
    if (cur) {
      const idx = LANGS.indexOf(cur);
      if (idx >= 0) langIdx = idx;
    }
  }

  // ===== HIDE OVERLAYS =====
  let overlaysHidden = false;
  let hiddenEls = [];

  function hideOverlays() {
    if (!overlaysHidden) {
      hiddenEls = [];
      const sels = ['#cheat-panel','#debug-overlay','#debug-panel','[id*="debug"]','#platform-debug','#fps-counter','.debug-overlay'];
      sels.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          if (el.offsetParent !== null || (el.style.display && el.style.display !== 'none')) {
            hiddenEls.push({ el, display: el.style.display });
            el.style.display = 'none';
          }
        });
      });
      overlaysHidden = true;
      // Don't show notify — it would appear in screenshot
    } else {
      hiddenEls.forEach(({ el, display }) => el.style.display = display);
      hiddenEls = [];
      overlaysHidden = false;
    }
  }

  // ===== NOTIFY TOAST =====
  let _nt = null, _ntt = 0;
  function showNotify(s) {
    if (!_nt) {
      _nt = document.createElement('div');
      _nt.id = 'mkt-notify';
      _nt.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:999999;background:rgba(0,0,0,.88);border:2px solid #4af;border-radius:12px;padding:16px 32px;font:bold 20px monospace;color:#fff;pointer-events:none;transition:opacity .4s';
      document.body.appendChild(_nt);
    }
    _nt.textContent = s;
    _nt.style.display = 'block';
    _nt.style.opacity = '1';
    clearTimeout(_ntt);
    _ntt = setTimeout(() => {
      _nt.style.opacity = '0';
      setTimeout(() => _nt.style.display = 'none', 400);
    }, 1200);
  }

  // ===== KEYBOARD SHORTCUTS =====

  // Ctrl+Shift+9 — toggle panel
  document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.ctrlKey && e.shiftKey && (e.code === 'Digit9' || e.key === '9' || e.key === '(')) {
      e.preventDefault();
      toggle();
      return;
    }

    // L — cycle language (no modifiers)
    if (e.code === 'KeyL' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      cycleLang();
      return;
    }
  });

  // P — silent freeze (capture phase to block game's own pause handler)
  document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'KeyP' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      silentFreeze();
    }
  }, true); // capture phase!

  // Init: sync language index
  setTimeout(syncLangIdx, 1000);

  console.log('[MKT] Cheat panel ready. Ctrl+Shift+9 to open. P=pause, L=lang');
})();
