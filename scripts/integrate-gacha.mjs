#!/usr/bin/env node
/**
 * Deterministically integrate the Forge gacha contract into an already
 * modularized merge-grid game. This is intentionally narrower than a model
 * rewrite: all related state/persistence/reset/load-order edits succeed as one
 * operation or the script stops on an unknown project shape.
 *
 * Usage: node scripts/integrate-gacha.mjs WorkProgress/<game>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

const project = resolve(process.cwd());
const requested = resolve(project, process.argv.slice(2).find(arg => !arg.startsWith('--')) || '.');
const game = existsSync(join(requested, 'index.html')) ? requested : dirname(requested);
const entrypoint = join(game, 'index.html');
const files = {
  state: join(game, 'js', '01-state-foundation.js'),
  persistence: join(game, 'js', '14-persistence.js'),
  reset: join(game, 'js', '13-reset.js'),
  core: join(game, 'js', '19-gacha-core.js'),
  integration: join(game, 'js', '18-gacha-integration.js'),
};

function fail(message) { console.error(`[X] ${message}`); process.exit(2); }
function posix(path) { return String(path).split(sep).join('/'); }
function rel(path) { return posix(relative(project, path)); }
function read(path) { if (!existsSync(path)) fail(`required modular game file is missing: ${rel(path)}`); return readFileSync(path, 'utf8'); }
function replaceOnce(content, search, replacement, label) {
  const first = content.indexOf(search);
  if (first < 0) fail(`cannot find ${label} anchor; refusing a speculative rewrite`);
  if (content.indexOf(search, first + search.length) >= 0) fail(`${label} anchor is ambiguous; refusing a speculative rewrite`);
  return content.slice(0, first) + replacement + content.slice(first + search.length);
}

const originals = new Map([
  [entrypoint, read(entrypoint)],
  [files.state, read(files.state)],
  [files.persistence, read(files.persistence)],
  [files.reset, read(files.reset)],
  ...(existsSync(files.core) ? [[files.core, read(files.core)]] : []),
  ...(existsSync(files.integration) ? [[files.integration, read(files.integration)]] : []),
]);

let state = originals.get(files.state);
if (!/\bgachaQueue\s*:/.test(state)) {
  state = replaceOnce(state, '  trueEnding: false, // показана ли финалка директора', '  trueEnding: false, // показана ли финалка директора\n  gachaQueue: [],    // награды гачи, ожидающие свободной клетки', 'state.gachaQueue');
}

let persistence = originals.get(files.persistence);
if (!/gachaQueue:\s*\[\.\.\.state\.gachaQueue\]/.test(persistence)) {
  persistence = replaceOnce(persistence, '      saved_at: Date.now(),', '      gachaQueue: [...state.gachaQueue],\n      saved_at: Date.now(),', 'saveState gacha queue');
}
if (!/state\.gachaQueue\s*=/.test(persistence)) {
  persistence = replaceOnce(persistence, '    return s.saved_at || null;', '    state.gachaQueue = Array.isArray(s.gachaQueue) ? [...s.gachaQueue] : [];\n    return s.saved_at || null;', 'loadState gacha queue');
}

let reset = originals.get(files.reset);
if (!/state\.gachaQueue\s*=\s*\[\]/.test(reset)) {
  reset = replaceOnce(reset, '  state.trueEnding = false;', '  state.trueEnding = false;\n  state.gachaQueue = [];', 'reset gacha queue');
}

const core = `/**
 * Gacha system — weighted part drops for the merge grid.
 */
(function (global) {
  const RARITY_TABLE = [
    { label: 'Обычная', weight: 60 },
    { label: 'Необычная', weight: 25 },
    { label: 'Редкая', weight: 10 },
    { label: 'Эпическая', weight: 4 },
    { label: 'Легендарная', weight: 1 },
  ];
  const PARTS_BY_RARITY = {
    Обычная: ['Болт М6', 'Шайба', 'Скоба'],
    Необычная: ['Вал короткий', 'Втулка', 'Кронштейн малый'],
    Редкая: ['Поршень A', 'Шестерня Z=18', 'Корпус редуктора (заготовка)'],
    Эпическая: ['Двигатель модульный', 'КПП секция', 'Мост ведущий (узел)'],
    Легендарная: ['Прототип V8 блок', 'Турбокит базовый', 'Гибридный привод'],
  };
  function rollRarity() {
    let roll = Math.random() * RARITY_TABLE.reduce((sum, row) => sum + row.weight, 0);
    for (const row of RARITY_TABLE) {
      roll -= row.weight;
      if (roll <= 0) return row.label;
    }
    return RARITY_TABLE[RARITY_TABLE.length - 1].label;
  }
  function pickPart(rarity) {
    const pool = PARTS_BY_RARITY[rarity] || [];
    return pool[Math.floor(Math.random() * pool.length)] || 'Деталь';
  }
  global.Gacha = {
    open(options = {}) {
      const count = Number.isFinite(options.count) ? Math.max(1, Math.floor(options.count)) : 1;
      const drops = Array.from({ length: count }, () => {
        const rarity = rollRarity();
        return { part: pickPart(rarity), rarity };
      });
      document.dispatchEvent(new CustomEvent('gacha:drop', { detail: { drops } }));
      return drops;
    },
    debugTable() { return { rarities: [...RARITY_TABLE], pools: { ...PARTS_BY_RARITY } }; },
  };
})(window);
`;

const integration = `// ======== GACHA INTEGRATION ========
(function () {
  if (!window.Gacha || typeof window.Gacha.open !== 'function') throw new Error('Gacha core must load before integration');
  if (!Array.isArray(state.gachaQueue)) state.gachaQueue = [];

  const rarityToLevel = { Обычная: 1, Необычная: 2, Редкая: 3, Эпическая: 4, Легендарная: 5 };
  const rewardAnchor = document.getElementById('reward-ad-btn');
  const gachaBtn = document.createElement('button');
  gachaBtn.id = 'gacha-btn';
  gachaBtn.className = 'mini-btn reward-ad';
  gachaBtn.textContent = '🎰 Гача за рекламу';
  rewardAnchor.insertAdjacentElement('afterend', gachaBtn);

  const baseRenderItems = renderItems;
  let flushing = false;

  function center() {
    const rect = document.body.getBoundingClientRect();
    return { x: Math.floor(rect.width / 2), y: Math.floor(rect.height / 2) };
  }

  function place(drop) {
    const index = state.grid.findIndex(value => value === null);
    if (index < 0) return false;
    state.grid[index] = drop.level;
    state.parts++;
    state.discovered.add(drop.level);
    trackEvent('gacha_part_dropped', { part: drop.part, level: drop.level, totalParts: state.parts });
    baseRenderItems(index);
    renderStats();
    return true;
  }

  function flushQueue() {
    if (flushing) return [];
    flushing = true;
    const delivered = [];
    while (state.gachaQueue.length && state.grid.includes(null)) {
      const drop = state.gachaQueue.shift();
      if (place(drop)) delivered.push(drop);
    }
    saveState();
    flushing = false;
    return delivered;
  }

  renderItems = function (...args) {
    const result = baseRenderItems(...args);
    if (!flushing && state.gachaQueue.length && state.grid.includes(null)) queueMicrotask(flushQueue);
    return result;
  };

  window.GachaIntegration = { flushQueue };
  gachaBtn.addEventListener('click', () => window.Gacha.open());

  document.addEventListener('gacha:drop', event => {
    const drops = Array.isArray(event.detail?.drops) ? event.detail.drops : [];
    for (const item of drops) {
      const drop = { part: item.part, level: rarityToLevel[item.rarity] ?? 1 };
      if (place(drop)) {
        const point = center();
        showBubble(\`Выпало: \${item.part} [\${item.rarity}]\`, point.x, point.y, 'gold');
      } else {
        state.gachaQueue.push(drop);
        const point = center();
        showBubble(\`Сетка полна — награда сохранена: \${item.part}\`, point.x, point.y, 'silver');
        trackEvent('gacha_drop_queued_full_grid', { part: item.part, level: drop.level, queued: state.gachaQueue.length });
      }
      saveState();
    }
  });
})();
`;

let html = originals.get(entrypoint)
  .replace(/^.*(?:18-gacha-integration|19-gacha-core)\.js.*\r?\n/gm, '');
const loadBlock = '<script src="js/19-gacha-core.js"></script>\n<script src="js/18-gacha-integration.js"></script>\n';
if (html.includes('<script src="js/17-platform-runtime.js"></script>')) {
  html = replaceOnce(html, '<script src="js/17-platform-runtime.js"></script>', `${loadBlock}<script src="js/17-platform-runtime.js"></script>`, 'gacha load order');
} else {
  html = replaceOnce(html, '</body>', `${loadBlock}</body>`, 'body script insertion');
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = join(project, 'wiki', 'runtime', 'gacha-backups', `${basename(game)}-${stamp}`);
mkdirSync(backupDir, { recursive: true });
for (const [path, content] of originals) writeFileSync(join(backupDir, basename(path)), content, 'utf8');

writeFileSync(files.state, state, 'utf8');
writeFileSync(files.persistence, persistence.endsWith('\n') ? persistence : `${persistence}\n`, 'utf8');
writeFileSync(files.reset, reset, 'utf8');
writeFileSync(files.core, core, 'utf8');
writeFileSync(files.integration, integration, 'utf8');
writeFileSync(entrypoint, html, 'utf8');

console.log(`[OK] integrated lossless gacha into ${rel(game)}`);
console.log(`[OK] state, persistence, reset, core, integration and load order updated atomically`);
console.log(`[OK] backup: ${rel(backupDir)}`);
console.log(`[NEXT] run modularize-existing-project.mjs ${rel(entrypoint)} --refresh, --check, then check-gacha-integration.mjs ${rel(game)}`);
