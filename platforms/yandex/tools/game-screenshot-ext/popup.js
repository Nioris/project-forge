// YG Screenshot - Popup controller
// Pure ASCII, no encoding issues

var LANGS = ['ru','en','es','tr','pt','ar','id','fr','ja','it','de','hi','zh'];

// ===== STATUS =====
function showStatus(text, type) {
  var el = document.getElementById('status');
  el.textContent = text;
  el.className = 'status ' + type;
  if (type === 'ok') setTimeout(function() { el.style.display = 'none'; }, 3000);
}

function showProgress(pct) {
  var bar = document.getElementById('progress');
  var fill = document.getElementById('progress-bar');
  bar.style.display = pct >= 0 ? 'block' : 'none';
  fill.style.width = pct + '%';
}

// ===== SCREENSHOT =====
function getDpr() {
  return parseInt(document.getElementById('cdpr').value) || 1;
}

function shoot(w, h, label, dprOverride) {
  var dpr = dprOverride || getDpr();
  showStatus('Capturing...', 'busy');
  chrome.runtime.sendMessage({ action: 'screenshot', w: w, h: h, label: label, dpr: dpr }, function(resp) {
    if (resp && resp.ok) showStatus('Done!', 'ok');
    else showStatus('Error: ' + ((resp && resp.error) || '?'), 'err');
  });
}

// Presets (all use DPR from field)
document.getElementById('btn-pc').onclick = function() { shoot(1920, 1080, 'pc'); };
document.getElementById('btn-mobile').onclick = function() { shoot(1080, 1920, 'mobile'); };
document.getElementById('btn-current').onclick = function() { shoot(0, 0, 'current'); };
document.getElementById('btn-square').onclick = function() { shoot(1080, 1080, 'square'); };

// Custom
document.getElementById('btn-custom').onclick = function() {
  var w = parseInt(document.getElementById('cw').value) || 1920;
  var h = parseInt(document.getElementById('ch').value) || 1080;
  shoot(w, h, 'custom');
};

// ===== LANGUAGE GRID =====
var grid = document.getElementById('lang-grid');
LANGS.forEach(function(lang) {
  var b = document.createElement('button');
  b.className = 'lang-btn';
  b.textContent = lang.toUpperCase();
  b.dataset.lang = lang;
  b.onclick = function() { setLang(lang); };
  grid.appendChild(b);
});

function getTab() {
  return chrome.tabs.query({ active: true, currentWindow: true }).then(function(tabs) { return tabs[0]; });
}

function changeLangOnPage(tabId, lang) {
  // Use CDP Runtime.evaluate — executes JS in page context like DevTools console
  // Bypasses both executeScript isolation AND CSP restrictions
  return new Promise(function(resolve) {
    chrome.debugger.attach({ tabId: tabId }, '1.3', function() {
      var code = 'if(typeof setLang==="function"){setLang("' + lang + '")}' +
        'else{try{_lang="' + lang + '"}catch(e){window._lang="' + lang + '"}' +
        'if(typeof applyStaticLang==="function")applyStaticLang();' +
        'if(typeof ui==="function")ui();' +
        'if(typeof renderAll==="function")renderAll();}' +
        '"done"';
      chrome.debugger.sendCommand({ tabId: tabId }, 'Runtime.evaluate', {
        expression: code,
        returnByValue: true
      }, function(result) {
        chrome.debugger.detach({ tabId: tabId }, function() {
          resolve(result);
        });
      });
    });
  });
}

function setLang(lang) {
  getTab().then(function(tab) {
    if (!tab) return;
    changeLangOnPage(tab.id, lang).then(function() {
      document.querySelectorAll('.lang-btn').forEach(function(b) {
        b.classList.toggle('active', b.dataset.lang === lang);
      });
      showStatus(lang.toUpperCase(), 'ok');
    });
  });
}

// ===== ALL LANGUAGES SCREENSHOT =====
function shootAllLangs(w, h, presetName, dpr) {
  showStatus('Capturing 13 langs ' + presetName + '...', 'busy');
  showProgress(0);

  var i = 0;
  function next() {
    if (i >= LANGS.length) {
      showProgress(100);
      showStatus('All 13 ' + presetName + ' saved!', 'ok');
      setTimeout(function() { showProgress(-1); }, 2000);
      setLang('ru');
      return;
    }
    var lang = LANGS[i];
    showStatus(lang.toUpperCase() + ' ' + presetName + ' (' + (i+1) + '/13)...', 'busy');
    showProgress(Math.round((i / LANGS.length) * 100));

    getTab().then(function(tab) {
      if (!tab) return;
      changeLangOnPage(tab.id, lang).then(function() {
        document.querySelectorAll('.lang-btn').forEach(function(b) {
          b.classList.toggle('active', b.dataset.lang === lang);
        });
        // Trigger resize to stabilize layout after lang change
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: function() { window.dispatchEvent(new Event('resize')); }
        }).then(function() {
          setTimeout(function() {
            chrome.runtime.sendMessage({
              action: 'screenshot', w: w, h: h, label: presetName + '_' + lang, dpr: dpr
            }, function() {
              setTimeout(function() { i++; next(); }, 400);
            });
          }, 600);
        });
      });
    });
  }
  next();
}

document.getElementById('btn-all-pc').onclick = function() { shootAllLangs(1920, 1080, 'pc', getDpr()); };
document.getElementById('btn-all-mobile').onclick = function() { shootAllLangs(1080, 1920, 'mobile', getDpr()); };

// ===== DETECT CURRENT LANG =====
getTab().then(function(tab) {
  if (!tab) return;
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'MAIN',
    func: function() {
      try { if (typeof _lang !== 'undefined') return _lang; } catch(e) {}
      return window._lang || null;
    }
  }).then(function(results) {
    var lang = results && results[0] && results[0].result;
    if (lang) {
      document.querySelectorAll('.lang-btn').forEach(function(b) {
        b.classList.toggle('active', b.dataset.lang === lang);
      });
    }
  }).catch(function() {});
});
