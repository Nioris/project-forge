// YG Screenshot — Background Service Worker
// Captures game screenshots by scaling current viewport via CDP
// Does NOT change viewport — works with DevTools device mode

const PRESETS = {
  'shot-pc':      { w: 1920, h: 1080, label: 'pc' },
  'shot-mobile':  { w: 1080, h: 1920, label: 'mobile' },
  'shot-current': { w: 0,    h: 0,    label: 'current' },
  'shot-square':  { w: 1080, h: 1080, label: 'square' },
};

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  const preset = PRESETS[command];
  if (!preset) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  await takeScreenshot(tab, preset.w, preset.h, preset.label, 1);
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'screenshot') {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) { sendResponse({ ok: false, error: 'No active tab' }); return; }
        const result = await takeScreenshot(tab, msg.w, msg.h, msg.label, msg.dpr || 1);
        sendResponse({ ok: true, filename: result });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }
});

async function takeScreenshot(tab, w, h, label, dpr) {
  dpr = dpr || 1;
  const tabId = tab.id;

  // Get game name — use cached name from first screenshot to avoid
  // different folder names when language changes document.title
  const titleResult = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.__ygssGameName || document.title || 'game'
  });
  const gameName = (titleResult?.[0]?.result || 'game')
    .replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
  // Cache for future screenshots
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (n) => { window.__ygssGameName = n; },
    args: [gameName]
  });

  // Get current language
  const langResult = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      try { if (typeof _lang !== 'undefined') return _lang; } catch(e) {}
      return window._lang || 'xx';
    }
  });
  const lang = langResult?.[0]?.result || 'xx';

  // Get current viewport size
  const sizeResult = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({ w: window.innerWidth, h: window.innerHeight })
  });
  const viewport = sizeResult?.[0]?.result || { w: 1920, h: 1080 };

  const useExactSize = (w > 0 && h > 0);
  let outW = useExactSize ? w : Math.round(viewport.w * dpr);
  let outH = useExactSize ? h : Math.round(viewport.h * dpr);

  // Hide overlays before capture
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      window.__ssHidden = [];
      const sels = ['#cheat-panel','#debug-overlay','#debug-panel','#platform-debug','#fps-counter','#mkt-notify','.debug-overlay'];
      sels.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          if (el.style.display !== 'none') {
            window.__ssHidden.push({ el, d: el.style.display });
            el.style.display = 'none';
          }
        });
      });
      document.querySelectorAll('*').forEach(el => {
        const z = parseInt(getComputedStyle(el).zIndex) || 0;
        if (z > 90000 && el.tagName !== 'CANVAS') {
          const id = (el.id||'').toLowerCase();
          if (!id.includes('game') && !id.includes('hud') && !id.includes('touch') && !id.includes('joy')) {
            window.__ssHidden.push({ el, d: el.style.display });
            el.style.display = 'none';
          }
        }
      });
    }
  });

  await sleep(100);

  let dataUrl;

  try {
    await chrome.debugger.attach({ tabId }, '1.3');

    if (useExactSize) {
      // Check if current viewport matches target aspect ratio (DevTools mobile mode)
      // If viewport is already portrait and target is portrait, just scale — don't resize
      const vpIsPortrait = viewport.h > viewport.w;
      const targetIsPortrait = h > w;
      const aspectMatch = vpIsPortrait === targetIsPortrait &&
        Math.abs((viewport.w/viewport.h) - (w/h)) < 0.15;

      if (aspectMatch && vpIsPortrait) {
        // DevTools mobile mode — scale current viewport to target resolution
        const scale = w / viewport.w;
        outW = w;
        outH = Math.round(viewport.h * scale);
        const result = await chrome.debugger.sendCommand({ tabId }, 'Page.captureScreenshot', {
          format: 'png',
          clip: { x: 0, y: 0, width: viewport.w, height: viewport.h, scale: scale },
          fromSurface: true
        });
        dataUrl = 'data:image/png;base64,' + result.data;
      } else {
        // Desktop mode — set exact viewport via CDP
        await chrome.debugger.sendCommand({ tabId }, 'Emulation.setDeviceMetricsOverride', {
          width: w,
          height: h,
          deviceScaleFactor: 1,
          mobile: false
        });
        await chrome.scripting.executeScript({
          target: { tabId },
          func: () => { window.dispatchEvent(new Event('resize')); }
        });
        await sleep(500);

        const result = await chrome.debugger.sendCommand({ tabId }, 'Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: false
        });
        dataUrl = 'data:image/png;base64,' + result.data;
        outW = w;
        outH = h;

        // Restore original viewport
        await chrome.debugger.sendCommand({ tabId }, 'Emulation.clearDeviceMetricsOverride');
        await sleep(100);
        await chrome.scripting.executeScript({
          target: { tabId },
          func: () => { window.dispatchEvent(new Event('resize')); }
        });
      }
    } else {
      // Current mode: scale current viewport by DPR
      const scale = dpr || 1;
      outW = Math.round(viewport.w * scale);
      outH = Math.round(viewport.h * scale);
      const result = await chrome.debugger.sendCommand({ tabId }, 'Page.captureScreenshot', {
        format: 'png',
        clip: { x: 0, y: 0, width: viewport.w, height: viewport.h, scale: scale },
        fromSurface: true
      });
      dataUrl = 'data:image/png;base64,' + result.data;
    }

    await chrome.debugger.detach({ tabId });
  } catch (e) {
    try { await chrome.debugger.detach({ tabId }); } catch(_) {}
    console.warn('[YG-SS] CDP failed, fallback:', e.message);
    dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    outW = viewport.w;
    outH = viewport.h;
  }

  // Restore overlays
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      if (window.__ssHidden) {
        window.__ssHidden.forEach(({ el, d }) => el.style.display = d);
        window.__ssHidden = [];
      }
    }
  });

  // Download
  const ts = timestamp();
  const sizeLabel = `${outW}x${outH}`;
  const filename = `screenshots/${gameName}/${label}_${lang}_${sizeLabel}_${ts}.png`;

  await chrome.downloads.download({
    url: dataUrl,
    filename: filename,
    saveAs: false
  });

  // Notify on page
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (sz) => {
      const n = document.createElement('div');
      n.textContent = sz + ' saved';
      n.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:999999;background:rgba(0,180,80,.92);color:#fff;padding:10px 18px;border-radius:8px;font:bold 13px sans-serif;pointer-events:none;transition:opacity .5s';
      document.body.appendChild(n);
      setTimeout(() => { n.style.opacity = '0'; setTimeout(() => n.remove(), 500); }, 2000);
    },
    args: [sizeLabel]
  });

  return filename;
}

function timestamp() {
  const d = new Date();
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
function p(n) { return String(n).padStart(2, '0'); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
