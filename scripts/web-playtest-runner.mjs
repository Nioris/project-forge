#!/usr/bin/env node
/** Execute a bounded browser scenario with real player input and an engine-owned proof. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { recordVisualReceipt } from '../.claude/skills/status/references/visual-receipts.mjs';
import { WEB_PLAYTEST_PROTOCOL, readWebPlaytestContract, snapshotWebGameSource, webPlaytestReceiptPayload } from './web-playtest-contract.mjs';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const OPERATION_TIMEOUT_MS = 10_000;
const RUN_TIMEOUT_MS = 90_000;

async function bounded(promise, label, deadline) {
  const remaining = deadline - Date.now();
  const timeout = Math.max(1, Math.min(OPERATION_TIMEOUT_MS, remaining));
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeout);
    })]);
  } finally { clearTimeout(timer); }
}

function parseArgs(argv) {
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--contract') continue;
    if (value === '--project-root') { if (!argv[index + 1]) throw new Error('--project-root requires a directory'); positional.push(argv[++index]); continue; }
    if (value.startsWith('--')) throw new Error(`Unsupported option for contract playtest: ${value}`);
    positional.push(value);
  }
  if (positional.length > 1) throw new Error('Contract playtest accepts one project root');
  return path.resolve(positional[0] || '.');
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function sdkStub() {
  return `(() => {
    const runtime = { sdkInit:0, loadingReady:0, gameplayStart:0, gameplayStop:0, ad:0, pointerInput:0, events:{} };
    Object.defineProperty(window, '__FORGE_WEB_PLAYTEST_RUNTIME__', { configurable:false, get: () => Object.freeze({ ...runtime, events: Object.freeze({ ...runtime.events }) }) });
    addEventListener('pointerdown', () => { runtime.pointerInput += 1; }, true);
    const on = (event, callback) => { (runtime.events[event] ||= []).push(callback); };
    window.__forgeWebPlaytestEvent = event => { for (const fn of runtime.events[event] || []) fn(); return (runtime.events[event] || []).length; };
    window.YaGames = {
      init() { runtime.sdkInit += 1; return Promise.resolve({
        features: {
          LoadingAPI: { ready() { runtime.loadingReady += 1; } },
          GameplayAPI: { start() { runtime.gameplayStart += 1; }, stop() { runtime.gameplayStop += 1; } }
        },
        adv: {
          showRewardedVideo(options={}) { runtime.ad += 1; options.callbacks?.onOpen?.(); options.callbacks?.onRewarded?.(); options.callbacks?.onClose?.(); },
          showFullscreenAdv(options={}) { runtime.ad += 1; options.callbacks?.onOpen?.(); options.callbacks?.onClose?.(true); }
        },
        environment: { i18n: { lang: 'ru' }, app: { id: 'forge-playtest' } },
        getPlayer: () => Promise.resolve({ getData: () => Promise.resolve({}), setData: () => Promise.resolve(), getMode: () => '' }),
        on, onEvent: on, off() {}, offEvent() {}
      }); }
    };
  })();`;
}

async function loadPuppeteer() {
  try { const module = await import('puppeteer'); return module.default || module; }
  catch {
    try { return createRequire(path.join(process.cwd(), 'package.json'))('puppeteer'); }
    catch { throw new Error('Puppeteer is unavailable; browser scenario is unverified'); }
  }
}

async function observe(page, adapterName) {
  return page.evaluate(async globalName => {
    const adapter = window[globalName];
    if (!adapter || typeof adapter.listStates !== 'function' || typeof adapter.currentState !== 'function') throw new Error(`${globalName} is missing currentState/listStates`);
    const states = await adapter.listStates();
    const state = await adapter.currentState();
    if (!Array.isArray(states) || states.some(item => typeof item !== 'string') || typeof state !== 'string') throw new Error('visual runtime adapter returned invalid observable state');
    return { state, states: [...new Set(states)].sort() };
  }, adapterName);
}

async function screenshotHash(page) {
  return digest(await page.screenshot({ type: 'png' }));
}

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await sleep(180);
}

function runtimeFacts(runtime, pointerInputObserved) {
  return {
    'sdk-init': Number(runtime?.sdkInit || 0) > 0,
    'loading-ready': Number(runtime?.loadingReady || 0) > 0,
    'gameplay-start': Number(runtime?.gameplayStart || 0) > 0,
    'gameplay-stop': Number(runtime?.gameplayStop || 0) > 0,
    ad: Number(runtime?.ad || 0) > 0,
    // A page-global counter is only diagnostic. The trusted runner itself saw
    // the real pointer event change both observable state and rendered pixels.
    'pointer-input': pointerInputObserved === true,
  };
}

async function executeAction(page, action) {
  if (action.kind === 'click') {
    const viewport = page.viewport();
    await page.mouse.click(Math.round(viewport.width * action.x), Math.round(viewport.height * action.y));
    return { kind: 'click', x: action.x, y: action.y };
  }
  if (action.kind === 'key') {
    await page.keyboard.press(action.key);
    return { kind: 'key', key: action.key };
  }
  const listeners = await page.evaluate(event => {
    if (typeof window.__forgeWebPlaytestEvent !== 'function') throw new Error('SDK platform event bridge is unavailable');
    return window.__forgeWebPlaytestEvent(event);
  }, action.event);
  return { kind: 'platform-event', event: action.event, listeners };
}

export async function runWebPlaytest(projectRoot) {
  const contract = readWebPlaytestContract(projectRoot); // parse before any output mutation
  const reportPath = path.join(contract.gameRoot, 'playtest-out', 'report.json');
  const reportRelative = path.relative(contract.root, reportPath).replaceAll('\\', '/');
  const beforeSnapshot = snapshotWebGameSource(contract.gameRoot);
  const report = {
    schemaVersion: 1,
    kind: 'forge.web-playtest-report',
    protocol: WEB_PLAYTEST_PROTOCOL,
    generatedAt: new Date().toISOString(),
    status: 'failed',
    gameRoot: contract.gameRootRelative,
    contract: { path: contract.fileRelative, sha256: contract.hash },
    sourceSnapshotSha256: beforeSnapshot,
    initialState: null,
    steps: [],
    persistence: { mode: contract.persistence.mode, checked: false, state: null },
    runtime: { mode: 'local-sdk-mock', consoleErrors: [], facts: {}, required: contract.tech?.required || [] },
    receiptId: null,
  };
  const browserErrors = report.runtime.consoleErrors;
  let browser = null; let server = null;
  const deadline = Date.now() + RUN_TIMEOUT_MS;
  let pointerInputObserved = false;
  const observedFacts = {};
  const mergeRuntimeFacts = async page => {
    const runtime = await bounded(page.evaluate(() => window.__FORGE_WEB_PLAYTEST_RUNTIME__ || {}), 'read mocked SDK runtime', deadline);
    const facts = runtimeFacts(runtime, pointerInputObserved);
    for (const [name, value] of Object.entries(facts)) observedFacts[name] = observedFacts[name] === true || value === true;
  };
  try {
    const puppeteer = await bounded(loadPuppeteer(), 'load browser runner', deadline);
    server = createServer((request, response) => {
      let requested;
      try { requested = decodeURIComponent(String(request.url || '/').split('?')[0]); }
      catch { response.writeHead(400); response.end(); return; }
      if (requested === '/favicon.ico') { response.writeHead(204); response.end(); return; }
      if (requested === '/sdk.js') { response.writeHead(200, { 'Content-Type': 'text/javascript' }); response.end(sdkStub()); return; }
      const relative = requested.replace(/^\/+/, '') || 'index.html';
      const file = path.resolve(contract.gameRoot, relative);
      if (!inside(contract.gameRoot, file) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
      if (!inside(contract.gameRoot, fs.realpathSync(file))) { response.writeHead(403); response.end(); return; }
      response.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      response.end(fs.readFileSync(file));
    });
    await bounded(new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }), 'start local playtest server', deadline);
    browser = await bounded(puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] }), 'launch browser', deadline);
    const page = await bounded(browser.newPage(), 'open browser page', deadline);
    await bounded(page.setViewport({ width: 1280, height: 720, hasTouch: true, isMobile: false }), 'set browser viewport', deadline);
    page.on('pageerror', error => browserErrors.push(`pageerror: ${String(error?.message || error).slice(0, 500)}`));
    page.on('console', message => { if (message.type() === 'error') browserErrors.push(`console.error: ${message.text().slice(0, 500)}`); });
    page.on('requestfailed', request => browserErrors.push(`requestfailed: ${request.url().slice(0, 400)}`));
    const url = `http://127.0.0.1:${server.address().port}/index.html`;
    await bounded(page.goto(url, { waitUntil: 'networkidle2', timeout: OPERATION_TIMEOUT_MS }), 'load normal game launch', deadline);
    await bounded(settle(page), 'settle initial game frame', deadline);
    const initial = await bounded(observe(page, contract.adapter.global), 'observe initial game state', deadline);
    if (initial.state !== contract.initialState) throw new Error(`initial observable state ${initial.state} differs from contract ${contract.initialState}`);
    report.initialState = initial.state;
    const expectedStates = new Set([contract.initialState, ...contract.steps.map(step => step.expect.state)]);
    if ([...expectedStates].some(state => !initial.states.includes(state))) throw new Error('contract references a state absent from the production runtime adapter');
    for (const step of contract.steps) {
      const before = await bounded(observe(page, contract.adapter.global), `observe before ${step.id}`, deadline);
      const beforeVisual = await bounded(screenshotHash(page), `capture before ${step.id}`, deadline);
      const action = await bounded(executeAction(page, step.action), `perform ${step.id}`, deadline);
      await bounded(settle(page), `settle ${step.id}`, deadline);
      const after = await bounded(observe(page, contract.adapter.global), `observe after ${step.id}`, deadline);
      const afterVisual = await bounded(screenshotHash(page), `capture after ${step.id}`, deadline);
      const changed = before.state !== after.state;
      if (after.state !== step.expect.state || changed !== step.expect.changed) throw new Error(`step ${step.id} expected state=${step.expect.state}, changed=${step.expect.changed}; got state=${after.state}, changed=${changed}`);
      if (step.expect.changed && beforeVisual === afterVisual) throw new Error(`step ${step.id} changed adapter state but rendered UI did not change`);
      report.steps.push({ id: step.id, action, beforeState: before.state, afterState: after.state, changed, beforeVisualSha256: beforeVisual, afterVisualSha256: afterVisual });
      if (step.action.kind === 'click' && changed && beforeVisual !== afterVisual) pointerInputObserved = true;
    }
    // Preserve runtime evidence produced during player actions before a
    // persistence reload creates a fresh page and resets local mock counters.
    await mergeRuntimeFacts(page);
    if (contract.persistence.mode === 'required') {
      await bounded(page.reload({ waitUntil: 'networkidle2', timeout: OPERATION_TIMEOUT_MS }), 'reload persisted game', deadline);
      await bounded(settle(page), 'settle persisted game frame', deadline);
      const restored = await bounded(observe(page, contract.adapter.global), 'observe restored game state', deadline);
      if (restored.state !== contract.persistence.expectState) throw new Error(`reload state ${restored.state} differs from persistence expectState ${contract.persistence.expectState}`);
      report.persistence = { mode: 'required', checked: true, state: restored.state };
    }
    await mergeRuntimeFacts(page);
    report.runtime.facts = observedFacts;
    const requiredMissing = (contract.tech?.required || []).filter(item => !report.runtime.facts[item]);
    if (requiredMissing.length) throw new Error(`runtime did not prove required technical facts: ${requiredMissing.join(', ')}`);
    if (browserErrors.length) throw new Error(`browser emitted ${browserErrors.length} error(s)`);
    if (snapshotWebGameSource(contract.gameRoot) !== beforeSnapshot) throw new Error('game source changed during browser playtest');
    report.status = 'passed';
    const receipt = recordVisualReceipt({ projectRoot: contract.root, kind: 'web-playtest', payload: webPlaytestReceiptPayload({ reportPath: reportRelative, report }) });
    report.receiptId = receipt.receipt.receiptId;
  } catch (error) {
    report.failure = { code: error?.code || 'WEB_PLAYTEST_FAILED', message: String(error?.message || error).slice(0, 1000) };
  } finally {
    try { await bounded(browser?.close() || Promise.resolve(), 'close browser', deadline); } catch {}
    try { await new Promise(resolve => server?.close(resolve) || resolve()); } catch {}
  }
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { report, reportPath, ok: report.status === 'passed' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runWebPlaytest(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify({ status: result.report.status, report: result.reportPath, receiptId: result.report.receiptId, failure: result.report.failure || null }));
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    console.error(JSON.stringify({ status: 'failed', code: error?.code || 'WEB_PLAYTEST_USAGE', message: String(error?.message || error) }));
    process.exitCode = 2;
  }
}
