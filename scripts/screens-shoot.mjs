#!/usr/bin/env node
/**
 * screens-shoot.mjs — снять КАЖДЫЙ экран игры и собрать контактный лист для самооценки.
 * Работает поверх local-stage/puppeteer: обходит состояния игры, снимает мобильный 412
 * и десктоп 1920, кладёт рядом лист index.html со всеми кадрами в один взгляд.
 *
 * Usage (Phase 4): node <движок>/scripts/screens-shoot.mjs <игра> --project-root <project>
 * Legacy diagnostic only: add --states "штаб,карта,бой,итог" (cannot satisfy Phase 4).
 *        [--mobile 412x915] [--desktop 1920x1080]
 * Скрипт НЕ оценивает качество — он создаёт неизменяемый capture-manifest с хешами,
 * размерами, coverage и runtime errors. Независимый reviewer заполняет review-template.
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, basename, dirname, relative } from 'node:path';
import { createServer } from 'node:http';
import { extname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  captureReceiptPayload,
  computeVisualCaptureId,
  currentVisualRuntimeIdentity,
  sha256File,
} from '../.claude/skills/status/references/phase-4-visual-evidence.mjs';
import { FORGE_VISUAL_QA_GLOBAL, FORGE_VISUAL_QA_QUERY, SCREEN_FLOW_PATH, validateScreenFlow } from '../.claude/skills/status/references/screen-flow-contract.mjs';
import { recordVisualReceipt } from '../.claude/skills/status/references/visual-receipts.mjs';

const dir = resolve(process.argv[2] || '.');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const legacyStates = arg('states', '').split(',').map(s => s.trim()).filter(Boolean);
const [mw, mh] = arg('mobile', '412x915').split('x').map(Number);
const [dw, dh] = arg('desktop', '1920x1080').split('x').map(Number);
if (!existsSync(join(dir, 'index.html'))) { console.error('[X] Нет index.html в', dir); process.exit(2); }
const OUT = join(dir, 'screens', 'review'); mkdirSync(OUT, { recursive: true });

const normalize = value => String(value || '').replaceAll('\\', '/');
const findProjectRoot = start => {
  let current = resolve(start);
  while (true) {
    if (existsSync(join(current, '.forge-managed.json')) || existsSync(join(current, 'wiki', 'phases'))) return current;
    const parent = dirname(current);
    if (parent === current) return resolve(start);
    current = parent;
  }
};
const projectRoot = resolve(arg('project-root', findProjectRoot(dir)));
const relativeToProject = file => normalize(relative(projectRoot, file));
const slug = value => String(value || 'state').normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/gu, '').toLowerCase() || 'state';
const screenFlow = validateScreenFlow({ root: projectRoot });
const strictPhase4 = legacyStates.length === 0;
if (strictPhase4 && !screenFlow.ok) {
  console.error(`[X] Strict Phase 4 capture requires approved ${SCREEN_FLOW_PATH}: ${screenFlow.failures.join('; ')}`);
  process.exit(2);
}
const builder = currentVisualRuntimeIdentity();
if (strictPhase4 && !builder) {
  console.error('[X] Strict Phase 4 capture requires a Forge/Codex/Claude host session identity. Anonymous shell capture cannot close Phase 4.');
  process.exit(2);
}
const requestedStates = strictPhase4 ? screenFlow.ids : ['start', ...legacyStates];
const startedAt = new Date().toISOString();

const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png',
  '.jpg':'image/jpeg','.mp3':'audio/mpeg','.json':'application/json','.webp':'image/webp','.svg':'image/svg+xml' };
const server = createServer((req, res) => {
  const requestPath = decodeURIComponent(req.url.split('?')[0]);
  if (requestPath === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  if (requestPath === '/sdk.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end('window.YaGames=window.YaGames||undefined;'); return; }
  const u = requestPath.replace(/^\/+/, '') || 'index.html';
  try { const b = readFileSync(join(dir, u));
    res.writeHead(200, { 'Content-Type': MIME[extname(u)] || 'application/octet-stream' }); res.end(b);
  } catch { res.writeHead(404); res.end(); }
});

server.listen(0, async () => {
  const port = server.address().port;
  const loadPup = async () => {
    try { const mod=await import('puppeteer'); return mod.default||mod; }
    catch { try { return createRequire(join(process.cwd(),'package.json'))('puppeteer'); } catch { return null; } }
  };
  let pup=await loadPup();
  if(!pup){
    console.error('[screens-shoot] installing puppeteer...');
    const r=spawnSync('npm',['install','puppeteer','--no-audit','--no-fund'],{stdio:'inherit',shell:true});
    if(r.status!==0){ console.error('[X] puppeteer install failed'); process.exit(2); }
    pup=await loadPup();
  }
  if(!pup){ console.error('[X] puppeteer installed but cannot be resolved from the project'); process.exit(2); }
  const browser = await pup.launch({ args: ['--no-sandbox'] });
  const shots = [];
  const runtimeErrors = [];
  const missingStates = [];

  for (const [label, w, h] of [['mobile', mw, mh], ['desktop', dw, dh]]) {
    const page = await browser.newPage();
    page.on('dialog', async dialog => { try { await dialog.dismiss(); } catch {} });
    page.on('console', message => {
      if (message.type() === 'error') runtimeErrors.push({ viewport: label, type: 'console', message: message.text().slice(0, 500) });
    });
    page.on('pageerror', error => runtimeErrors.push({ viewport: label, type: 'pageerror', message: String(error?.message || error).slice(0, 500) }));
    page.on('requestfailed', request => {
      if (!/favicon\.ico(?:\?|$)/u.test(request.url())) runtimeErrors.push({ viewport: label, type: 'requestfailed', message: `${request.method()} ${request.url()} — ${request.failure()?.errorText || 'failed'}`.slice(0, 500) });
    });
    await page.setViewport({ width: w, height: h, isMobile: label === 'mobile', hasTouch: label === 'mobile' });
    const qaSuffix = strictPhase4 ? `?${FORGE_VISUAL_QA_QUERY}` : '';
    await page.goto(`http://127.0.0.1:${port}/index.html${qaSuffix}`, { waitUntil: 'networkidle2', timeout: 30000 }).catch(()=>{});
    await new Promise(r => setTimeout(r, 1800));

    let i = 1;
    const shoot = async (name, stateProof) => {
      const f = join(OUT, `${label}-${String(i).padStart(2,'0')}-${slug(name)}.png`);
      await page.screenshot({ path: f, fullPage: false });
      // высота контента vs экран — ловит «не влезает в мобильный»
      const over = await page.evaluate(() => Math.round(document.documentElement.scrollHeight / window.innerHeight * 100) / 100);
      shots.push({
        state: name,
        viewport: label,
        file: relativeToProject(f),
        displayFile: basename(f),
        width: w,
        height: h,
        contentHeightRatio: over,
        sha256: sha256File(f),
        stateProof,
      });
      i++;
    };

    if (strictPhase4) {
      const adapterStates = await page.evaluate(globalName => {
        const adapter = window[globalName];
        if (!adapter || typeof adapter.listStates !== 'function' || typeof adapter.showState !== 'function' || typeof adapter.currentState !== 'function') return null;
        try { return adapter.listStates(); } catch { return null; }
      }, FORGE_VISUAL_QA_GLOBAL);
      if (!Array.isArray(adapterStates) || adapterStates.some(item => typeof item !== 'string')) {
        runtimeErrors.push({ viewport: label, type: 'visual-adapter', message: `${FORGE_VISUAL_QA_GLOBAL} is missing or does not implement listStates/showState/currentState` });
        for (const state of requestedStates) missingStates.push({ viewport: label, state });
      } else {
        const actual = [...new Set(adapterStates)].sort();
        const expected = [...requestedStates].sort();
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          runtimeErrors.push({ viewport: label, type: 'visual-adapter-inventory', message: `adapter states ${JSON.stringify(actual)} differ from approved screen flow ${JSON.stringify(expected)}` });
        }
        for (const state of screenFlow.states) {
          let reportedState = null;
          try {
            reportedState = await page.evaluate(async ({ globalName, adapterState }) => {
              const adapter = window[globalName];
              await adapter.showState(adapterState);
              await new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
              return await adapter.currentState();
            }, { globalName: FORGE_VISUAL_QA_GLOBAL, adapterState: state.capture.adapterState });
          } catch (error) {
            runtimeErrors.push({ viewport: label, type: 'visual-adapter-transition', message: `${state.id}: ${String(error?.message || error).slice(0, 400)}` });
          }
          if (reportedState !== state.capture.adapterState) missingStates.push({ viewport: label, state: state.id, reportedState });
          await new Promise(r => setTimeout(r, 400));
          await shoot(state.id, {
            mechanism: 'forge-runtime-adapter',
            requestedState: state.id,
            adapterState: state.capture.adapterState,
            reportedState,
          });
        }
      }
    } else {
      await shoot('start', { mechanism: 'legacy-initial-load', requestedState: 'start', adapterState: null, reportedState: null });
      for (const st of legacyStates) {
        const ok = await page.evaluate(t => {
          const el = [...document.querySelectorAll('button,[onclick],[role=button],a,.btn,[class*=btn],[class*=tab]')]
            .find(e => (e.textContent||'').toLowerCase().includes(t.toLowerCase()));
          if (!el) return false; el.click(); return true;
        }, st);
        if (!ok) {
          console.log(`  · ${label}: состояние "${st}" не найдено по тексту кнопки`);
          missingStates.push({ viewport: label, state: st });
          continue;
        }
        await new Promise(r => setTimeout(r, 1200));
        await shoot(st, { mechanism: 'legacy-text-click', requestedState: st, adapterState: null, reportedState: null });
      }
    }
    await page.close();
  }
  await browser.close(); server.close();

  const capturedAt = new Date().toISOString();
  const captureId = computeVisualCaptureId({ capturedAt, captures: shots });
  const capturedStates = [...new Set(shots.map(item => item.state))];
  const captureManifestRel = relativeToProject(join(OUT, 'capture-manifest.json'));
  const captureManifest = {
    schemaVersion: 1,
    kind: 'forge.visual-capture',
    generatedBy: 'screens-shoot.mjs',
    captureMode: strictPhase4 ? 'forge-runtime-adapter' : 'legacy-text-click',
    startedAt,
    capturedAt,
    captureId,
    captureReceiptId: null,
    builder,
    screenFlow: strictPhase4 ? { path: SCREEN_FLOW_PATH, sha256: sha256File(screenFlow.file) } : null,
    stateAdapter: strictPhase4 ? { global: FORGE_VISUAL_QA_GLOBAL, query: FORGE_VISUAL_QA_QUERY } : null,
    projectRoot: '.',
    gameRoot: relativeToProject(dir) || '.',
    command: [process.execPath, ...process.argv.slice(1)].join(' '),
    requestedStates,
    states: capturedStates,
    viewports: {
      mobile: { width: mw, height: mh },
      desktop: { width: dw, height: dh },
    },
    missingStates,
    runtimeErrors,
    captures: shots.map(({ displayFile, ...item }) => item),
  };
  if (strictPhase4) {
    try {
      const receipt = recordVisualReceipt({
        projectRoot,
        kind: 'capture',
        payload: captureReceiptPayload({ manifestPath: captureManifestRel, manifest: captureManifest }),
      });
      captureManifest.captureReceiptId = receipt.receipt.receiptId;
    } catch (error) {
      runtimeErrors.push({ viewport: 'all', type: 'capture-receipt', message: String(error?.message || error).slice(0, 500) });
    }
  }
  writeFileSync(join(OUT, 'capture-manifest.json'), `${JSON.stringify(captureManifest, null, 2)}\n`);

  const bound = rel => {
    const file = join(projectRoot, rel);
    return existsSync(file) && statSync(file).isFile() ? { path: rel, sha256: sha256File(file) } : { path: rel, sha256: '' };
  };
  const targetFrameBinding = bound('assets/target/target-frame.png');
  const screenTargetsBinding = bound('assets/target/screens/manifest.json');
  const styleBibleBinding = bound('assets/style/STYLE-BIBLE.md');
  let screenTargetManifest = null;
  try { screenTargetManifest = JSON.parse(readFileSync(join(projectRoot, 'assets', 'target', 'screens', 'manifest.json'), 'utf8')); } catch {}
  const screenTargetFor = (state, viewport) => {
    const item = Array.isArray(screenTargetManifest?.states) ? screenTargetManifest.states.find(candidate => candidate?.state === state) : null;
    return item?.references?.[viewport] || { path: '', sha256: '' };
  };
  const reviewTemplate = {
    schemaVersion: 1,
    kind: 'forge.phase-4-visual-evidence',
    phase: 4,
    captureManifest: captureManifestRel,
    captureId,
    captureReceiptId: captureManifest.captureReceiptId,
    targetFrame: targetFrameBinding,
    screenTargets: screenTargetsBinding,
    styleBible: styleBibleBinding,
    report: { path: 'wiki/qa/phase-4-visual-review.md', sha256: '' },
    builder,
    reviewer: { id: '', sessionId: '', mode: 'independent' },
    reviewedAt: '',
    coverage: { expectedStates: requestedStates, capturedStates, missingStates, complete: missingStates.length === 0 && capturedStates.length === requestedStates.length },
    minimumScore: 6,
    verdict: 'reject',
    summary: '',
    verification: { command: captureManifest.command, exitCode: missingStates.length || runtimeErrors.length ? 1 : 0 },
    reviews: shots.map(({ state, viewport, file, sha256 }) => ({
      state,
      viewport,
      file,
      sha256,
      verdict: 'reject',
      scores: { composition: 0, hierarchy: 0, readability: 0, styleMatch: 0, responsiveness: 0 },
      targetComparison: {
        targetPath: screenTargetFor(state, viewport).path || '',
        targetSha256: screenTargetFor(state, viewport).sha256 || '',
        distanceScore: 0,
        matches: [],
        differences: [],
      },
      critique: '',
      defects: [],
    })),
  };
  writeFileSync(join(OUT, 'phase-4-visual-evidence.template.json'), `${JSON.stringify(reviewTemplate, null, 2)}\n`);

  const rows = shots.map(s => `<figure><img src="${s.displayFile}"><figcaption>
    <b>${s.state}</b> · ${s.viewport}${s.contentHeightRatio > 1.05 ? ` · <span class="warn">не влезает: ${s.contentHeightRatio} экрана</span>` : ''}
    </figcaption></figure>`).join('');
  writeFileSync(join(OUT, 'index.html'), `<!DOCTYPE html><meta charset="utf-8">
<title>Контактный лист — ${basename(dir)}</title><style>
body{margin:0;background:#0f1117;color:#e8eaf0;font:14px system-ui;padding:20px}
h1{font-size:18px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
figure{margin:0;background:#171a23;border:1px solid #282d3d;border-radius:10px;overflow:hidden}
img{width:100%;display:block;background:#000}
figcaption{padding:8px 11px;font-size:12px}.warn{color:#e05252;font-weight:600}
</style><h1>Контактный лист — ${basename(dir)} <span style="opacity:.5;font-size:13px">${shots.length} кадров</span></h1>
<p style="opacity:.6">Оценивай КАЖДЫЙ по ui-review §самооценка: балл 1-10 + причина + что мешает.</p>
<div class="grid">${rows}</div>`);

  console.log(`\n[OK] Снято кадров: ${shots.length}`);
  console.log(`     Контактный лист: ${join(OUT,'index.html')}`);
  const bad = shots.filter(s => s.contentHeightRatio > 1.05);
  if (bad.length) console.log(`  ⚠️  Не влезают в экран: ${bad.map(s=>`${s.state}/${s.viewport} (${s.contentHeightRatio})`).join(', ')}`);
  if (missingStates.length) console.log(`  [X] Не сняты состояния: ${missingStates.map(s => `${s.state}/${s.viewport}`).join(', ')}`);
  if (runtimeErrors.length) console.log(`  [X] Runtime/browser errors: ${runtimeErrors.length}`);
  console.log(`     Capture manifest: ${join(OUT, 'capture-manifest.json')}`);
  console.log(`     Review template: ${join(OUT, 'phase-4-visual-evidence.template.json')}`);
  console.log('     Дальше: независимый reviewer открывает каждый кадр, пишет критику и только затем формирует Phase 4 evidence.');
  if (bad.length || missingStates.length || runtimeErrors.length) process.exitCode = 1;
});
