/**
 * Executable Phase 4 visual acceptance contract.
 *
 * A screenshot file is evidence of capture, not evidence of quality. This validator binds a
 * trusted screens-shoot capture manifest to an independent, per-frame visual review and rejects
 * stale, incomplete, undersized, self-reviewed, or defect-bearing evidence.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspectPng } from './png-integrity.mjs';
import { findImageProvenance } from './image-provenance.mjs';
import { SCREEN_FLOW_PATH, validateScreenFlow } from './screen-flow-contract.mjs';
import { verifyVisualReceipt } from './visual-receipts.mjs';
import { enginePhaseSupport, readTrustedProjectEngine } from './project-engine.mjs';
import { resolveTrustedForgeEngineRoot } from './forge-engine-root.mjs';

const MODULE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
let readGodotVisualContract = null;
let inspectMjpegAvi = null;
let snapshotGodotVisualInputs = null;
try {
  const trustedEngineRoot = resolveTrustedForgeEngineRoot({ projectRoot: process.cwd(), moduleRoot: MODULE_ROOT });
  const [contractModule, runtimeModule] = await Promise.all([
    import(pathToFileURL(path.join(trustedEngineRoot, 'scripts', 'godot-visual-contract.mjs')).href),
    import(pathToFileURL(path.join(trustedEngineRoot, 'scripts', 'godot-visual-runtime.mjs')).href),
  ]);
  readGodotVisualContract = contractModule.readGodotVisualContract;
  inspectMjpegAvi = runtimeModule.inspectMjpegAvi;
  snapshotGodotVisualInputs = runtimeModule.snapshotGodotVisualInputs;
} catch {
  // Web/early portable phases do not require native visual modules. A Godot Phase 4 call below
  // fails closed if the trusted sibling engine cannot supply them.
}

export const PHASE4_VISUAL_EVIDENCE_PATH = 'wiki/qa/phase-4-visual-evidence.json';
export const PHASE4_VISUAL_REPORT_PATH = 'wiki/qa/phase-4-visual-review.md';
export const PHASE4_TARGET_FRAME_PATH = 'assets/target/target-frame.png';
export const PHASE4_SCREEN_TARGETS_PATH = 'assets/target/screens/manifest.json';
export const PHASE4_STYLE_BIBLE_PATH = 'assets/style/STYLE-BIBLE.md';
export const PHASE4_VISUAL_SCHEMA_VERSION = 1;
export const PHASE4_MIN_SCORE = 6;

const RENDER_INPUT_EXTENSIONS = new Set([
  '.html', '.css', '.js', '.mjs', '.ts', '.tsx', '.jsx', '.vue', '.svelte', '.json',
  '.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.avif', '.ico', '.woff', '.woff2', '.ttf', '.otf',
]);
const SKIP_DIRS = new Set(['.git', '.claude', '.agents', '.codex', 'node_modules', 'vendor', 'dist', 'build', 'playtest-out', 'stage-out', 'screens']);
const SCORE_KEYS = ['composition', 'hierarchy', 'readability', 'styleMatch', 'responsiveness'];
const CLOCK_SKEW_MS = 5000;

export function normalizeVisualPath(value) {
  return String(value || '').replaceAll('\\', '/').replace(/^\.\//u, '');
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function safeProjectFile(root, rel) {
  const normalized = normalizeVisualPath(rel);
  if (!normalized || path.isAbsolute(normalized) || normalized.split('/').includes('..')) return null;
  try {
    const resolvedRoot = fs.realpathSync(path.resolve(root));
    const lexical = path.resolve(resolvedRoot, normalized);
    const absolute = fs.realpathSync(lexical);
    return inside(resolvedRoot, absolute) && fs.statSync(absolute).isFile() ? { normalized, absolute } : null;
  } catch {
    return null;
  }
}

function parseJsonFile(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

export function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function pngDimensions(file) {
  const result = inspectPng(file);
  return result ? { width: result.width, height: result.height } : null;
}

function isIsoDate(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function identityKey(value) {
  if (!value || typeof value !== 'object') return null;
  const id = String(value.id || '').trim();
  const sessionId = String(value.sessionId || '').trim();
  if (id.length < 2 || sessionId.length < 4) return null;
  return `${id.toLowerCase()}::${sessionId.toLowerCase()}`;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256Json(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function currentVisualRuntimeIdentity(environment = process.env) {
  const sessionId = String(environment.FORGE_RUN_ATTEMPT_ID || environment.CODEX_THREAD_ID
    || environment.CODEX_SESSION_ID || environment.CLAUDE_SESSION_ID || '').trim();
  if (!sessionId) return null;
  const id = String(environment.FORGE_AGENT_ID || environment.CODEX_AGENT_ID
    || (environment.CODEX_THREAD_ID || environment.CODEX_SESSION_ID ? 'codex' : 'claude')).trim();
  return identityKey({ id, sessionId }) ? { id, sessionId } : null;
}

function receiptFreeCaptureManifest(manifest) {
  const copy = JSON.parse(JSON.stringify(manifest || {}));
  delete copy.captureReceiptId;
  return copy;
}

function receiptFreeReviewEvidence(evidence) {
  const copy = JSON.parse(JSON.stringify(evidence || {}));
  delete copy.reviewReceiptId;
  return copy;
}

function receiptFreeProofManifest(manifest) {
  const copy = JSON.parse(JSON.stringify(manifest || {}));
  delete copy.proofId;
  delete copy.proofReceiptId;
  return copy;
}

export function captureReceiptPayload({ manifestPath, manifest }) {
  const payload = {
    schemaVersion: 1,
    kind: 'forge.phase4.capture',
    captureId: manifest?.captureId || '',
    captureManifestPath: normalizeVisualPath(manifestPath),
    captureManifestFactsSha256: sha256Json(receiptFreeCaptureManifest(manifest)),
    screenFlow: manifest?.screenFlow || null,
    startedAt: manifest?.startedAt || '',
    capturedAt: manifest?.capturedAt || '',
    builder: manifest?.builder || null,
    captureMode: manifest?.captureMode || '',
    captures: Array.isArray(manifest?.captures) ? manifest.captures.map(item => ({
      state: item.state,
      viewport: item.viewport,
      file: normalizeVisualPath(item.file),
      sha256: item.sha256,
      width: item.width,
      height: item.height,
      stateProof: item.stateProof || null,
    })) : [],
  };
  if (manifest?.captureMode === 'forge-godot-runtime-adapter') {
    payload.engine = manifest.engine || null;
    payload.visualContract = manifest.visualContract || null;
    payload.stateAdapter = manifest.stateAdapter || null;
    payload.implementationSnapshot = manifest.implementationSnapshot || null;
  }
  return payload;
}

export function computeGodotProofId({ manifest }) {
  return sha256Json(receiptFreeProofManifest(manifest));
}

export function proofReceiptPayload({ manifestPath, manifest }) {
  return {
    schemaVersion: 1,
    kind: 'forge.phase4.godot-proof',
    proofId: manifest?.proofId || '',
    proofManifestPath: normalizeVisualPath(manifestPath),
    proofManifestFactsSha256: sha256Json(receiptFreeProofManifest(manifest)),
    capturedAt: manifest?.capturedAt || '',
    builder: manifest?.builder || null,
    engine: manifest?.engine || null,
    screenFlow: manifest?.screenFlow || null,
    visualContract: manifest?.visualContract || null,
    stateAdapter: manifest?.stateAdapter || null,
    implementationSnapshot: manifest?.implementationSnapshot || null,
    video: manifest?.video || null,
    samples: Array.isArray(manifest?.samples) ? manifest.samples : [],
  };
}

export function reviewReceiptPayload({ evidencePath = PHASE4_VISUAL_EVIDENCE_PATH, evidence }) {
  const payload = {
    schemaVersion: 1,
    kind: 'forge.phase4.review',
    captureId: evidence?.captureId || '',
    captureReceiptId: evidence?.captureReceiptId || '',
    evidencePath: normalizeVisualPath(evidencePath),
    reviewFactsSha256: sha256Json(receiptFreeReviewEvidence(evidence)),
    builder: evidence?.builder || null,
    reviewer: evidence?.reviewer || null,
    reviewedAt: evidence?.reviewedAt || '',
    screenTargetsSha256: evidence?.screenTargets?.sha256 || '',
    reportSha256: evidence?.report?.sha256 || '',
  };
  if (evidence?.nativeProof && typeof evidence.nativeProof === 'object') {
    payload.proofId = evidence.nativeProof.proofId || '';
    payload.proofReceiptId = evidence.nativeProof.proofReceiptId || '';
    payload.proofManifestSha256 = evidence.nativeProof.manifest?.sha256 || '';
  }
  return payload;
}

function walkFiles(dir, predicate, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) walkFiles(absolute, predicate, out);
    else if (entry.isFile() && predicate(absolute)) out.push(absolute);
  }
  return out;
}

function latestVisualInputMtime(root) {
  const files = [];
  for (const base of ['WorkProgress', 'src', 'public', 'assets']) {
    files.push(...walkFiles(path.join(root, base), file => RENDER_INPUT_EXTENSIONS.has(path.extname(file).toLowerCase())));
  }
  files.push(...walkFiles(path.join(root, 'assets', 'target', 'screens'), file => ['.png', '.json'].includes(path.extname(file).toLowerCase())));
  for (const rel of ['index.html', 'main.js', 'app.js', 'package.json', SCREEN_FLOW_PATH, PHASE4_TARGET_FRAME_PATH, PHASE4_SCREEN_TARGETS_PATH, PHASE4_STYLE_BIBLE_PATH]) {
    const file = safeProjectFile(root, rel);
    if (file) files.push(file.absolute);
  }
  return files.reduce((latest, file) => {
    try { return Math.max(latest, fs.statSync(file).mtimeMs); } catch { return latest; }
  }, 0);
}

function sameSet(left, right) {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameUniqueSet(left, right) {
  return left.length === right.length && new Set(left).size === left.length
    && new Set(right).size === right.length && sameSet(left, right);
}

function sameOrderedArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function computeVisualCaptureId({ capturedAt, captures }) {
  const rows = (Array.isArray(captures) ? captures : [])
    .map(item => [item.state, item.viewport, normalizeVisualPath(item.file), item.sha256, item.width, item.height])
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return crypto.createHash('sha256').update(JSON.stringify({ capturedAt, rows })).digest('hex');
}

function validateBoundFile(root, descriptor, expectedPath, label, failures) {
  if (!descriptor || typeof descriptor !== 'object' || normalizeVisualPath(descriptor.path) !== expectedPath) {
    failures.push(`${label} must reference ${expectedPath}`);
    return null;
  }
  const file = safeProjectFile(root, descriptor.path);
  if (!file) {
    failures.push(`${label} file is missing: ${expectedPath}`);
    return null;
  }
  const actualHash = sha256File(file.absolute);
  if (!/^[a-f0-9]{64}$/u.test(String(descriptor.sha256 || '')) || descriptor.sha256 !== actualHash) {
    failures.push(`${label} SHA-256 does not match ${expectedPath}`);
  }
  return file;
}

function validateCaptureManifest(root, manifestPath, screenFlow, failures) {
  const file = safeProjectFile(root, manifestPath);
  if (!file || !/(?:^|\/)screens\/review\/capture-manifest\.json$/u.test(file.normalized)) {
    failures.push('captureManifest must reference a screens/review/capture-manifest.json file inside the project');
    return null;
  }
  const manifest = parseJsonFile(file.absolute);
  if (!manifest || manifest.schemaVersion !== 1 || manifest.kind !== 'forge.visual-capture') {
    failures.push('capture manifest is missing or has the wrong schema/kind');
    return null;
  }
  if (manifest.generatedBy !== 'screens-shoot.mjs') failures.push('capture manifest was not generated by screens-shoot.mjs');
  if (manifest.captureMode !== 'forge-runtime-adapter') failures.push('Phase 4 capture must use the Forge runtime state adapter, not text-click navigation');
  if (!isIsoDate(manifest.startedAt)) failures.push('capture manifest needs a canonical ISO startedAt timestamp');
  if (!isIsoDate(manifest.capturedAt)) failures.push('capture manifest needs a canonical ISO capturedAt timestamp');
  if (!identityKey(manifest.builder)) failures.push('capture manifest needs a host-derived builder identity');
  if (!Array.isArray(manifest.runtimeErrors) || manifest.runtimeErrors.length !== 0) failures.push('visual capture contains runtime/browser errors');
  if (!Array.isArray(manifest.missingStates) || manifest.missingStates.length !== 0) failures.push('screens-shoot could not reach every requested state');
  const expectedFlowHash = screenFlow?.file ? sha256File(screenFlow.file) : '';
  if (normalizeVisualPath(manifest.screenFlow?.path) !== SCREEN_FLOW_PATH || manifest.screenFlow?.sha256 !== expectedFlowHash) {
    failures.push('capture manifest is not bound to the approved Phase 2 screen inventory');
  }
  const declaredCaptures = Array.isArray(manifest.captures) ? manifest.captures : [];
  const expectedStates = screenFlow?.ids || [];
  if (declaredCaptures.length !== expectedStates.length * 2) {
    failures.push('Phase 4 requires exactly one mobile and one desktop capture for every approved screen-flow state');
  }

  const captures = [];
  const keys = new Set();
  for (const [index, item] of declaredCaptures.entries()) {
    if (!item || typeof item !== 'object') {
      failures.push(`capture ${index + 1} is not an object`);
      continue;
    }
    const state = String(item.state || '').trim();
    const viewport = String(item.viewport || '').trim();
    const key = `${state}::${viewport}`;
    if (!state || !['mobile', 'desktop'].includes(viewport)) failures.push(`capture ${index + 1} has an invalid state/viewport`);
    if (!expectedStates.includes(state)) failures.push(`capture ${index + 1} is not part of the approved screen flow: ${state || '(missing state)'}`);
    if (keys.has(key)) failures.push(`capture manifest has duplicate state/viewport: ${key}`);
    keys.add(key);
    const screenshot = safeProjectFile(root, item.file);
    if (!screenshot || !/(?:^|\/)screens\/review\/.+\.png$/u.test(normalizeVisualPath(item.file))) {
      failures.push(`capture image is missing or outside screens/review: ${item.file || '(missing path)'}`);
      continue;
    }
    const dimensions = pngDimensions(screenshot.absolute);
    if (!dimensions) {
      failures.push(`capture is not a valid dimensioned PNG: ${item.file}`);
      continue;
    }
    if (Number(item.width) !== dimensions.width || Number(item.height) !== dimensions.height) {
      failures.push(`capture dimensions do not match PNG pixels: ${item.file}`);
    }
    if (viewport === 'mobile' && dimensions.width !== 412) failures.push(`mobile capture must be exactly 412px wide: ${item.file}`);
    if (viewport === 'desktop' && (dimensions.width < 1280 || dimensions.height < 720)) {
      failures.push(`desktop capture must be at least 1280x720: ${item.file}`);
    }
    const actualHash = sha256File(screenshot.absolute);
    if (item.sha256 !== actualHash) failures.push(`capture SHA-256 does not match screenshot: ${item.file}`);
    if (!Number.isFinite(Number(item.contentHeightRatio)) || Number(item.contentHeightRatio) > 1.05) {
      failures.push(`capture clips or overflows its viewport: ${item.file}`);
    }
    const expectedAdapterState = screenFlow?.flow?.states?.find(candidate => candidate.id === state)?.capture?.adapterState;
    if (item.stateProof?.mechanism !== 'forge-runtime-adapter' || item.stateProof?.requestedState !== state
      || item.stateProof?.adapterState !== expectedAdapterState || item.stateProof?.reportedState !== expectedAdapterState) {
      failures.push(`capture has no runtime adapter proof for state "${state}": ${item.file}`);
    }
    captures.push({ ...item, state, viewport, file: screenshot.normalized, sha256: actualHash, ...dimensions });
  }

  const states = [...new Set(captures.map(item => item.state))];
  if (!sameSet(states, expectedStates)) failures.push('Phase 4 capture does not cover the complete approved screen flow');
  for (const state of states) {
    const viewports = captures.filter(item => item.state === state).map(item => item.viewport);
    if (!viewports.includes('mobile') || !viewports.includes('desktop')) failures.push(`state "${state}" lacks mobile or desktop evidence`);
  }
  const declaredStates = Array.isArray(manifest.states) ? manifest.states.map(String) : [];
  if (!sameSet(states, declaredStates)) failures.push('capture manifest states do not match the actual screenshots');
  const requestedStates = Array.isArray(manifest.requestedStates) ? manifest.requestedStates.map(String) : [];
  if (!sameSet(requestedStates, expectedStates)) failures.push('capture requestedStates must equal the approved screen-flow inventory');
  for (const viewport of ['mobile', 'desktop']) {
    const hashes = new Map();
    for (const item of captures.filter(candidate => candidate.viewport === viewport)) {
      const previous = hashes.get(item.sha256);
      if (previous && previous !== item.state) failures.push(`different ${viewport} states produced an identical screenshot: "${previous}" and "${item.state}"`);
      hashes.set(item.sha256, item.state);
    }
  }
  const expectedCaptureId = computeVisualCaptureId({ capturedAt: manifest.capturedAt, captures });
  if (manifest.captureId !== expectedCaptureId) failures.push('captureId does not match captured screenshot facts');

  if (isIsoDate(manifest.startedAt) && isIsoDate(manifest.capturedAt)) {
    const startedAt = Date.parse(manifest.startedAt);
    const capturedAt = Date.parse(manifest.capturedAt);
    if (capturedAt < startedAt) failures.push('capture finished before it started');
    if (capturedAt > Date.now() + CLOCK_SKEW_MS) failures.push('capture timestamp is implausibly in the future');
    const latestInput = latestVisualInputMtime(root);
    if (latestInput > capturedAt + CLOCK_SKEW_MS) failures.push('visual screenshots are stale: implementation/assets/style/target changed after capture');
    for (const item of captures) {
      const screenshot = safeProjectFile(root, item.file);
      const mtime = screenshot ? fs.statSync(screenshot.absolute).mtimeMs : 0;
      if (screenshot && (mtime < startedAt - CLOCK_SKEW_MS || mtime > capturedAt + CLOCK_SKEW_MS)) {
        failures.push(`screenshot timestamp is not bound to this capture run: ${item.file}`);
      }
    }
  }

  const expectedReceiptPayload = captureReceiptPayload({ manifestPath: file.normalized, manifest });
  const receipt = verifyVisualReceipt({ projectRoot: root, kind: 'capture', receiptId: manifest.captureReceiptId, expectedPayload: expectedReceiptPayload });
  if (!receipt.ok) failures.push(`trusted capture receipt rejected: ${receipt.failure || receipt.code}`);

  return { file, manifest, captures, states, captureId: expectedCaptureId, receipt };
}

function sameImplementationSnapshot(left, right) {
  return left?.algorithm === 'sha256-path-content-v1' && right?.algorithm === 'sha256-path-content-v1'
    && left.sha256 === right.sha256 && left.fileCount === right.fileCount && left.bytes === right.bytes;
}

function validateGodotCaptureManifest(root, manifestPath, screenFlow, contract, failures) {
  const expectedPath = 'screens/review/capture-manifest.json';
  const file = safeProjectFile(root, manifestPath);
  if (!file || file.normalized !== expectedPath) {
    failures.push(`Godot captureManifest must reference ${expectedPath}`);
    return null;
  }
  const manifest = parseJsonFile(file.absolute);
  if (!manifest || manifest.schemaVersion !== 1 || manifest.kind !== 'forge.visual-capture') {
    failures.push('Godot capture manifest is missing or has the wrong schema/kind');
    return null;
  }
  if (manifest.generatedBy !== 'godot-screens-shoot.mjs') failures.push('Godot capture manifest was not generated by godot-screens-shoot.mjs');
  if (manifest.captureMode !== 'forge-godot-runtime-adapter') failures.push('Godot Phase 4 capture must use the native Forge runtime adapter');
  if (manifest.engine?.name !== 'godot' || typeof manifest.engine?.version !== 'string' || !manifest.engine.version.trim()) {
    failures.push('Godot capture must identify the real native engine/version');
  }
  if (manifest.engine?.testHarness !== false) failures.push('Godot Phase 4 cannot accept a test harness capture');
  if (!isIsoDate(manifest.startedAt)) failures.push('Godot capture manifest needs a canonical ISO startedAt timestamp');
  if (!isIsoDate(manifest.capturedAt)) failures.push('Godot capture manifest needs a canonical ISO capturedAt timestamp');
  if (!identityKey(manifest.builder)) failures.push('Godot capture manifest needs a host-derived builder identity');
  if (!Array.isArray(manifest.runtimeErrors) || manifest.runtimeErrors.length !== 0) failures.push('Godot visual capture contains runtime errors');
  if (!Array.isArray(manifest.missingStates) || manifest.missingStates.length !== 0) failures.push('Godot capture could not reach every requested state');
  if (!Array.isArray(manifest.statePixelCollisions) || manifest.statePixelCollisions.length !== 0) failures.push('Godot capture contains identical-state pixel collisions');

  const expectedFlowHash = screenFlow?.file ? sha256File(screenFlow.file) : '';
  if (normalizeVisualPath(manifest.screenFlow?.path) !== SCREEN_FLOW_PATH || manifest.screenFlow?.sha256 !== expectedFlowHash) {
    failures.push('Godot capture is not bound to the approved Phase 2 screen inventory');
  }
  const visualFile = safeProjectFile(root, 'forge.godot.visual.json');
  const expectedVisual = visualFile ? { path: 'forge.godot.visual.json', sha256: sha256File(visualFile.absolute) } : null;
  if (!expectedVisual || canonicalJson(manifest.visualContract || null) !== canonicalJson(expectedVisual)) {
    failures.push('Godot capture is not bound to the current forge.godot.visual.json');
  }
  const adapterFile = safeProjectFile(contract?.implementationRoot || root, contract?.adapter?.script?.rel || '');
  const expectedAdapter = contract && adapterFile ? {
    protocol: contract.adapter.protocol,
    autoloadName: contract.adapter.autoloadName,
    script: contract.adapter.script.resource,
    targetNode: contract.adapter.targetNode,
    sha256: sha256File(adapterFile.absolute),
  } : null;
  if (!expectedAdapter || canonicalJson(manifest.stateAdapter || null) !== canonicalJson(expectedAdapter)) {
    failures.push('Godot capture adapter fields/hash do not match the current native adapter');
  }
  let liveSnapshot = null;
  try { liveSnapshot = contract ? snapshotGodotVisualInputs(contract.implementationRoot) : null; }
  catch (error) { failures.push(`Godot implementation snapshot failed: ${error.message}`); }
  if (!liveSnapshot || !sameImplementationSnapshot(manifest.implementationSnapshot, liveSnapshot)) {
    failures.push('Godot capture implementation snapshot is stale or invalid');
  }
  if (manifest.projectRoot !== '.' || manifest.gameRoot !== contract?.projectPath) failures.push('Godot capture gameRoot does not match forge.godot.json');
  if (canonicalJson(manifest.viewports || null) !== canonicalJson(contract?.capture?.viewports || null)) {
    failures.push('Godot capture viewports do not match forge.godot.visual.json');
  }

  const declaredCaptures = Array.isArray(manifest.captures) ? manifest.captures : [];
  const expectedStates = screenFlow?.ids || [];
  if (declaredCaptures.length !== expectedStates.length * 2) {
    failures.push('Godot Phase 4 requires exactly one mobile and one desktop capture for every approved state');
  }
  const captures = [];
  const keys = new Set();
  let mediaRunRoot = null;
  for (const [index, item] of declaredCaptures.entries()) {
    if (!item || typeof item !== 'object') { failures.push(`Godot capture ${index + 1} is not an object`); continue; }
    const state = String(item.state || '').trim();
    const viewport = String(item.viewport || '').trim();
    const key = `${state}::${viewport}`;
    if (!expectedStates.includes(state) || !['mobile', 'desktop'].includes(viewport)) failures.push(`Godot capture ${index + 1} has an unapproved state/viewport`);
    if (keys.has(key)) failures.push(`Godot capture manifest has duplicate state/viewport: ${key}`);
    keys.add(key);
    const normalizedImage = normalizeVisualPath(item.file);
    const match = /^screens\/review\/godot\/([a-z0-9-]{8,64})\/(?:mobile|desktop)-.+\.png$/u.exec(normalizedImage);
    const screenshot = match ? safeProjectFile(root, normalizedImage) : null;
    if (!screenshot) { failures.push(`Godot capture image is missing or outside its native review run: ${item.file || '(missing path)'}`); continue; }
    const currentRunRoot = `screens/review/godot/${match[1]}`;
    if (mediaRunRoot && mediaRunRoot !== currentRunRoot) failures.push('Godot screenshots from different capture runs cannot be mixed');
    mediaRunRoot ||= currentRunRoot;
    const dimensions = pngDimensions(screenshot.absolute);
    const expectedDimensions = contract?.capture?.viewports?.[viewport];
    if (!dimensions || dimensions.width !== expectedDimensions?.width || dimensions.height !== expectedDimensions?.height
      || item.width !== dimensions?.width || item.height !== dimensions?.height) {
      failures.push(`Godot capture dimensions do not match the contracted ${viewport} viewport: ${item.file}`);
      continue;
    }
    const actualHash = sha256File(screenshot.absolute);
    if (item.sha256 !== actualHash) failures.push(`Godot capture SHA-256 does not match screenshot: ${item.file}`);
    if (!Number.isFinite(Number(item.contentHeightRatio)) || Number(item.contentHeightRatio) > 1.05) failures.push(`Godot capture clips or overflows its viewport: ${item.file}`);
    const expectedAdapterState = screenFlow?.flow?.states?.find(candidate => candidate.id === state)?.capture?.adapterState;
    if (item.stateProof?.mechanism !== 'forge-godot-runtime-adapter'
      || item.stateProof?.protocol !== 'forge-godot-visual-v1' || item.stateProof?.requestedState !== state
      || item.stateProof?.adapterState !== expectedAdapterState || item.stateProof?.reportedState !== expectedAdapterState) {
      failures.push(`Godot capture has no exact native adapter proof for state "${state}": ${item.file}`);
    }
    captures.push({ ...item, state, viewport, file: screenshot.normalized, sha256: actualHash, ...dimensions });
  }
  const states = [...new Set(captures.map(item => item.state))];
  if (!sameSet(states, expectedStates)) failures.push('Godot capture does not cover the complete approved screen flow');
  for (const state of expectedStates) {
    const viewports = captures.filter(item => item.state === state).map(item => item.viewport);
    if (!sameSet(viewports, ['mobile', 'desktop'])) failures.push(`Godot state "${state}" lacks exact mobile/desktop evidence`);
  }
  if (!sameOrderedArray(Array.isArray(manifest.states) ? manifest.states.map(String) : [], expectedStates)) failures.push('Godot capture states must exactly follow the approved screen flow without duplicates');
  if (!sameOrderedArray(Array.isArray(manifest.requestedStates) ? manifest.requestedStates.map(String) : [], expectedStates)) failures.push('Godot capture requestedStates must exactly follow the approved screen flow without duplicates');
  for (const viewport of ['mobile', 'desktop']) {
    const hashes = new Map();
    for (const item of captures.filter(candidate => candidate.viewport === viewport)) {
      const previous = hashes.get(item.sha256);
      if (previous && previous !== item.state) failures.push(`different Godot ${viewport} states produced an identical screenshot: "${previous}" and "${item.state}"`);
      hashes.set(item.sha256, item.state);
    }
  }
  const expectedCaptureId = computeVisualCaptureId({ capturedAt: manifest.capturedAt, captures });
  if (manifest.captureId !== expectedCaptureId) failures.push('Godot captureId does not match captured screenshot facts');
  if (isIsoDate(manifest.startedAt) && isIsoDate(manifest.capturedAt)) {
    const startedAt = Date.parse(manifest.startedAt);
    const capturedAt = Date.parse(manifest.capturedAt);
    if (capturedAt < startedAt) failures.push('Godot capture finished before it started');
    if (capturedAt > Date.now() + CLOCK_SKEW_MS) failures.push('Godot capture timestamp is implausibly in the future');
    for (const item of captures) {
      const screenshot = safeProjectFile(root, item.file);
      const mtime = screenshot ? fs.statSync(screenshot.absolute).mtimeMs : 0;
      if (screenshot && (mtime < startedAt - CLOCK_SKEW_MS || mtime > capturedAt + CLOCK_SKEW_MS)) failures.push(`Godot screenshot timestamp is not bound to this capture run: ${item.file}`);
    }
  }
  const expectedReceiptPayload = captureReceiptPayload({ manifestPath: file.normalized, manifest });
  const receipt = verifyVisualReceipt({ projectRoot: root, kind: 'capture', receiptId: manifest.captureReceiptId, expectedPayload: expectedReceiptPayload });
  if (!receipt.ok) failures.push(`trusted Godot capture receipt rejected: ${receipt.failure || receipt.code}`);
  return { file, manifest, captures, states, captureId: expectedCaptureId, receipt, implementationSnapshot: liveSnapshot, mediaRunRoot };
}

function validateGodotProofBundle(root, nativeProof, proofReview, screenFlow, contract, capture, failures) {
  const expectedManifestPath = 'screens/review/proof-video-manifest.json';
  const manifestFile = validateBoundFile(root, nativeProof?.manifest, expectedManifestPath, 'Godot proof manifest', failures);
  const manifest = manifestFile ? parseJsonFile(manifestFile.absolute) : null;
  if (!manifest || manifest.schemaVersion !== 1 || manifest.kind !== 'forge.godot-proof-video') {
    failures.push('Godot proof manifest is missing or has the wrong schema/kind');
    return null;
  }
  if (manifest.generatedBy !== 'godot-proof-video.mjs' || manifest.verdict !== 'pass') failures.push('Godot proof was not produced and passed by godot-proof-video.mjs');
  if (!Array.isArray(manifest.runtimeErrors) || manifest.runtimeErrors.length !== 0) failures.push('Godot proof contains runtime/mechanical errors');
  if (manifest.engine?.name !== 'godot' || manifest.engine?.testHarness !== false || typeof manifest.engine?.version !== 'string' || !manifest.engine.version.trim()) {
    failures.push('Godot proof must come from a real native engine, never a test harness');
  }
  if (!isIsoDate(manifest.startedAt) || !isIsoDate(manifest.capturedAt)) failures.push('Godot proof needs canonical startedAt/capturedAt timestamps');
  if (!identityKey(manifest.builder) || canonicalJson(manifest.builder || null) !== canonicalJson(capture?.manifest?.builder || null)) {
    failures.push('Godot capture and proof must come from the same builder identity');
  }
  const expectedFlowHash = screenFlow?.file ? sha256File(screenFlow.file) : '';
  if (normalizeVisualPath(manifest.screenFlow?.path) !== SCREEN_FLOW_PATH || manifest.screenFlow?.sha256 !== expectedFlowHash) failures.push('Godot proof is not bound to the approved screen flow');
  const visualFile = safeProjectFile(root, 'forge.godot.visual.json');
  const expectedVisual = visualFile ? { path: 'forge.godot.visual.json', sha256: sha256File(visualFile.absolute) } : null;
  if (!expectedVisual || canonicalJson(manifest.visualContract || null) !== canonicalJson(expectedVisual)) failures.push('Godot proof is not bound to the current visual contract');
  const adapterFile = safeProjectFile(contract?.implementationRoot || root, contract?.adapter?.script?.rel || '');
  const expectedAdapter = contract && adapterFile ? {
    protocol: contract.adapter.protocol, autoloadName: contract.adapter.autoloadName,
    script: contract.adapter.script.resource, targetNode: contract.adapter.targetNode,
    sha256: sha256File(adapterFile.absolute),
  } : null;
  if (!expectedAdapter || canonicalJson(manifest.stateAdapter || null) !== canonicalJson(expectedAdapter)) failures.push('Godot proof adapter fields/hash differ from the current native adapter');
  let liveSnapshot = null;
  try { liveSnapshot = contract ? snapshotGodotVisualInputs(contract.implementationRoot) : null; }
  catch (error) { failures.push(`Godot proof snapshot failed: ${error.message}`); }
  if (!liveSnapshot || !sameImplementationSnapshot(manifest.implementationSnapshot, liveSnapshot)
    || !sameImplementationSnapshot(manifest.implementationSnapshot, capture?.manifest?.implementationSnapshot)) {
    failures.push('Godot capture, proof and current implementation snapshots must be identical');
  }
  if (manifest.gameRoot !== contract?.projectPath || manifest.viewport !== contract?.proofVideo?.viewport) failures.push('Godot proof project/viewport differs from the current contract');
  if (!sameOrderedArray(Array.isArray(manifest.requestedStates) ? manifest.requestedStates.map(String) : [], contract?.proofVideo?.states || [])) failures.push('Godot proof states must exactly follow the current contract without duplicates');

  const dimensions = contract?.capture?.viewports?.[contract?.proofVideo?.viewport];
  const expectedFrames = (contract?.proofVideo?.fps || 0) * (contract?.proofVideo?.durationSeconds || 0);
  const videoPath = normalizeVisualPath(manifest.video?.file);
  const videoMatch = /^screens\/review\/godot\/([a-z0-9-]{8,64})\/proof-video\.avi$/u.exec(videoPath);
  const videoFile = videoMatch ? safeProjectFile(root, videoPath) : null;
  const proofRunRoot = videoMatch ? `screens/review/godot/${videoMatch[1]}` : null;
  if (!videoFile) failures.push('Godot proof video is missing or outside its native review run');
  let inspected = null;
  if (videoFile) {
    inspected = inspectMjpegAvi(videoFile.absolute);
    const actualHash = sha256File(videoFile.absolute);
    if (manifest.video?.sha256 !== actualHash) failures.push('Godot proof video SHA-256 does not match current media');
    if (!inspected) failures.push('Godot proof video is not a structurally valid MJPEG AVI');
    else {
      if (inspected.width !== dimensions?.width || inspected.height !== dimensions?.height || inspected.fps !== contract?.proofVideo?.fps) failures.push('Godot proof video dimensions/FPS differ from the current contract');
      if (Math.abs(inspected.actualFrames - expectedFrames) > 1) failures.push('Godot proof video frame count differs from the current contract by more than ±1');
      if (manifest.video?.actualFrames !== inspected.actualFrames || manifest.video?.width !== inspected.width
        || manifest.video?.height !== inspected.height || manifest.video?.fps !== inspected.fps
        || manifest.video?.uniqueFrames !== inspected.uniqueFrames
        || Number(manifest.video?.uniqueFrameRatio) !== Number(inspected.uniqueFrameRatio.toFixed(6))
        || manifest.video?.indexEntries !== inspected.indexEntries
        || manifest.video?.indexVideoEntries !== inspected.indexVideoEntries
        || manifest.video?.indexValidated !== true || inspected.indexValidated !== true
        || manifest.video?.streamHandler !== 'MJPG' || manifest.video?.compression !== 'MJPG') failures.push('Godot proof manifest video facts differ from the current indexed AVI');
    }
    if (normalizeVisualPath(nativeProof?.video?.path) !== videoPath || nativeProof?.video?.sha256 !== actualHash) failures.push('Godot evidence is not bound to the current proof video');
  }

  const timeline = Array.isArray(manifest.timeline) ? manifest.timeline : [];
  const segmentFrames = Math.max(1, Math.ceil(expectedFrames / Math.max(1, contract?.proofVideo?.states?.length || 0)));
  const expectedTimeline = (contract?.proofVideo?.states || []).map((state, index) => ({ state, frame: index * segmentFrames }));
  if (canonicalJson(timeline) !== canonicalJson(expectedTimeline)) failures.push('Godot proof timeline does not exactly match the deterministic state plan');
  const manifestSamples = Array.isArray(manifest.samples) ? manifest.samples : [];
  const expectedSampleFrames = Array.from({ length: contract?.proofVideo?.durationSeconds || 0 }, (_, index) => index * (contract?.proofVideo?.fps || 0));
  if (manifestSamples.length !== expectedSampleFrames.length) failures.push('Godot proof must contain exactly one lossless sample per second');
  const samples = [];
  for (const [index, sample] of manifestSamples.entries()) {
    const expectedFrame = expectedSampleFrames[index];
    const expectedState = [...expectedTimeline].reverse().find(item => item.frame <= expectedFrame)?.state || '';
    const expectedPath = proofRunRoot ? `${proofRunRoot}/proof-samples/sample-${String(expectedFrame).padStart(6, '0')}.png` : '';
    const sampleFile = sample?.frame === expectedFrame && sample?.state === expectedState
      && normalizeVisualPath(sample?.file) === expectedPath ? safeProjectFile(root, expectedPath) : null;
    if (!sampleFile) { failures.push(`Godot proof sample ${index + 1} is missing, out of order or bound to the wrong state`); continue; }
    const sampleDimensions = pngDimensions(sampleFile.absolute);
    const actualHash = sha256File(sampleFile.absolute);
    if (!sampleDimensions || sampleDimensions.width !== dimensions?.width || sampleDimensions.height !== dimensions?.height
      || sample.width !== sampleDimensions?.width || sample.height !== sampleDimensions?.height) failures.push(`Godot proof sample dimensions are invalid: ${sample.file}`);
    if (sample.sha256 !== actualHash) failures.push(`Godot proof sample SHA-256 does not match: ${sample.file}`);
    samples.push({ frame: expectedFrame, state: expectedState, path: sampleFile.normalized, sha256: actualHash, ...sampleDimensions });
  }
  const minimumUniqueSamples = Math.min(12, expectedSampleFrames.length);
  const minimumUniqueVideoFrames = Math.min(12, expectedFrames);
  const uniqueSamples = new Set(samples.map(item => item.sha256)).size;
  if (uniqueSamples < minimumUniqueSamples || manifest.thresholds?.minimumUniqueSamples !== minimumUniqueSamples
    || manifest.thresholds?.actualUniqueSamples !== uniqueSamples || manifest.thresholds?.sampleIntervalFrames !== contract?.proofVideo?.fps) {
    failures.push('Godot proof lossless samples do not meet the live-motion threshold');
  }
  if (!inspected || inspected.uniqueFrames < minimumUniqueVideoFrames
    || manifest.thresholds?.minimumUniqueVideoFrames !== minimumUniqueVideoFrames
    || manifest.thresholds?.actualUniqueVideoFrames !== inspected?.uniqueFrames) {
    failures.push('Godot proof MJPEG stream does not meet the live-motion threshold');
  }
  for (const state of contract?.proofVideo?.states || []) if (!samples.some(item => item.state === state)) failures.push(`Godot proof samples never show configured state "${state}"`);

  const expectedProofId = computeGodotProofId({ manifest });
  if (manifest.proofId !== expectedProofId || nativeProof?.proofId !== expectedProofId) failures.push('Godot proofId does not match current proof facts');
  if (nativeProof?.proofReceiptId !== manifest.proofReceiptId) failures.push('Godot evidence is bound to a different proof receipt');
  const expectedNativeSamples = samples.map(item => ({ frame: item.frame, state: item.state, path: item.path, sha256: item.sha256 }));
  const declaredNativeSamples = Array.isArray(nativeProof?.samples) ? nativeProof.samples.map(item => ({
    frame: item?.frame, state: item?.state, path: normalizeVisualPath(item?.path), sha256: item?.sha256,
  })) : [];
  if (canonicalJson(declaredNativeSamples) !== canonicalJson(expectedNativeSamples)) failures.push('Godot evidence sample bindings differ from the current proof samples');
  const receipt = verifyVisualReceipt({ projectRoot: root, kind: 'proof', receiptId: manifest.proofReceiptId,
    expectedPayload: proofReceiptPayload({ manifestPath: manifestFile.normalized, manifest }) });
  if (!receipt.ok) failures.push(`trusted Godot proof receipt rejected: ${receipt.failure || receipt.code}`);

  if (isIsoDate(manifest.startedAt) && isIsoDate(manifest.capturedAt)) {
    const startedAt = Date.parse(manifest.startedAt);
    const capturedAt = Date.parse(manifest.capturedAt);
    if (capturedAt < startedAt) failures.push('Godot proof finished before it started');
    if (capturedAt > Date.now() + CLOCK_SKEW_MS) failures.push('Godot proof timestamp is implausibly in the future');
    for (const media of [videoFile, ...samples.map(item => safeProjectFile(root, item.path))].filter(Boolean)) {
      const mtime = fs.statSync(media.absolute).mtimeMs;
      if (mtime < startedAt - CLOCK_SKEW_MS || mtime > capturedAt + CLOCK_SKEW_MS) failures.push(`Godot proof media timestamp is not bound to this run: ${media.normalized}`);
    }
  }

  if (proofReview?.verdict !== 'pass' || proofReview?.videoWatched !== true) failures.push('independent Godot proof review must explicitly watch and pass the video');
  if (!sameUniqueSet(Array.isArray(proofReview?.statesObserved) ? proofReview.statesObserved.map(String) : [], contract?.proofVideo?.states || [])) failures.push('independent Godot proof review must observe every configured proof state exactly once');
  if (!sameOrderedArray(Array.isArray(proofReview?.samplesReviewed) ? proofReview.samplesReviewed.map(String) : [], samples.map(item => item.sha256))) failures.push('independent Godot proof review must bind every current lossless sample in timeline order');
  if (!Number.isInteger(proofReview?.motionScore) || proofReview.motionScore < PHASE4_MIN_SCORE || proofReview.motionScore > 10) failures.push(`Godot proof motionScore must be ${PHASE4_MIN_SCORE}..10`);
  if (typeof proofReview?.critique !== 'string' || proofReview.critique.trim().length < 80) failures.push('Godot proof review needs a concrete motion/camera/feedback critique of at least 80 characters');
  if (!Array.isArray(proofReview?.defects)) failures.push('Godot proof review needs an explicit defects array');
  else if (proofReview.defects.some(defect => ['critical', 'major'].includes(String(defect?.severity || '').toLowerCase()))) failures.push('Godot proof review still contains an open Critical or Major defect');

  return { file: manifestFile, manifest, proofId: expectedProofId, receipt, video: videoFile, samples, inspected, capturedAt: manifest.capturedAt };
}

function validateScreenTargets(root, descriptor, masterTargetHash, screenFlow, failures) {
  const file = validateBoundFile(root, descriptor, PHASE4_SCREEN_TARGETS_PATH, 'screen target manifest', failures);
  if (!file) return { file: null, targets: new Map(), states: [] };
  const manifest = parseJsonFile(file.absolute);
  if (!manifest || manifest.schemaVersion !== 1 || manifest.kind !== 'forge.phase-4-screen-targets') {
    failures.push('screen target manifest has the wrong schema/kind');
    return { file, targets: new Map(), states: [] };
  }
  if (normalizeVisualPath(manifest.masterTarget?.path) !== PHASE4_TARGET_FRAME_PATH || manifest.masterTarget?.sha256 !== masterTargetHash) {
    failures.push('screen target manifest is not bound to the approved master target frame');
  }
  const expectedFlowHash = screenFlow?.file ? sha256File(screenFlow.file) : '';
  if (normalizeVisualPath(manifest.screenFlow?.path) !== SCREEN_FLOW_PATH || manifest.screenFlow?.sha256 !== expectedFlowHash) {
    failures.push('screen target manifest is not bound to the approved Phase 2 screen flow');
  }
  const items = Array.isArray(manifest.states) ? manifest.states : [];
  const stateNames = items.map(item => String(item?.state || '').trim()).filter(Boolean);
  if (!sameSet(stateNames, screenFlow?.ids || [])) failures.push('screen target manifest must map every approved screen-flow state exactly once');
  if (new Set(stateNames).size !== stateNames.length) failures.push('screen target manifest contains duplicate state mappings');
  const itemsByState = new Map(items.map(item => [String(item?.state || '').trim(), item]));
  const targets = new Map();
  for (const [index, item] of items.entries()) {
    const state = String(item?.state || '').trim();
    if (!state) {
      failures.push(`screen target entry ${index + 1} has no state`);
      continue;
    }
    const flowState = screenFlow?.states?.find(candidate => candidate.id === state);
    if (!flowState) failures.push(`screen target "${state}" is absent from the approved screen flow`);
    if (item.archetype !== flowState?.archetype) failures.push(`screen target "${state}" archetype differs from the approved screen flow`);
    if (!['dedicated', 'inherited'].includes(item.mode)) failures.push(`screen target "${state}" mode must be dedicated or inherited`);
    if (item.mode !== flowState?.targetPolicy) failures.push(`screen target "${state}" mode differs from its approved targetPolicy`);
    if ((item.inheritedFrom || null) !== (flowState?.inheritFrom || null)) failures.push(`screen target "${state}" inheritedFrom differs from the approved screen flow`);
    if (typeof item.description !== 'string' || item.description.trim().length < 40) failures.push(`screen target "${state}" needs a concrete screen description`);
    for (const viewport of ['mobile', 'desktop']) {
      const reference = item.references?.[viewport];
      const targetFile = reference ? safeProjectFile(root, reference.path) : null;
      if (!targetFile || !/(?:^|\/)assets\/target\/screens\/.+\.png$/u.test(normalizeVisualPath(reference?.path))) {
        failures.push(`screen target "${state}" lacks a valid ${viewport} PNG reference`);
        continue;
      }
      const dimensions = pngDimensions(targetFile.absolute);
      if (!dimensions || dimensions.width < 512 || dimensions.height < 512) failures.push(`screen target is not a dimensioned PNG of at least 512px: ${reference.path}`);
      else if (viewport === 'mobile' && dimensions.width >= dimensions.height) failures.push(`mobile screen target must be portrait: ${reference.path}`);
      else if (viewport === 'desktop' && dimensions.width <= dimensions.height) failures.push(`desktop screen target must be landscape: ${reference.path}`);
      const actualHash = sha256File(targetFile.absolute);
      if (reference.sha256 !== actualHash) failures.push(`screen target SHA-256 does not match: ${reference.path}`);
      if (item.mode === 'dedicated') {
        const provenance = findImageProvenance({ projectRoot: root, outputPath: targetFile.normalized, outputSha256: actualHash, state, viewport });
        if (!provenance || normalizeVisualPath(reference.provenance?.path) !== provenance.path
          || Number(reference.provenance?.line) !== provenance.line || reference.provenance?.recordSha256 !== provenance.recordSha256) {
          failures.push(`dedicated screen target "${state}" ${viewport} lacks matching GPT Image generation provenance`);
        }
      } else {
        const parent = itemsByState.get(String(item.inheritedFrom || ''));
        const inheritedReference = parent?.mode === 'dedicated' ? parent.references?.[viewport] : null;
        if (!inheritedReference || normalizeVisualPath(reference.path) !== normalizeVisualPath(inheritedReference.path)
          || reference.sha256 !== inheritedReference.sha256
          || canonicalJson(reference.provenance || null) !== canonicalJson(inheritedReference.provenance || null)) {
          failures.push(`inherited screen target "${state}" ${viewport} must reuse its dedicated parent target exactly`);
        }
      }
      targets.set(`${state}::${viewport}`, { path: targetFile.normalized, sha256: actualHash, ...dimensions });
    }
  }
  return { file, manifest, targets, states: stateNames };
}

export function validatePhase4VisualEvidence({ root = process.cwd(), evidencePath = PHASE4_VISUAL_EVIDENCE_PATH } = {}) {
  const projectRoot = path.resolve(root);
  const failures = [];
  let engineProfile = null;
  let godotContract = null;
  try {
    engineProfile = readTrustedProjectEngine(projectRoot);
    const support = enginePhaseSupport(engineProfile, 4);
    if (!support.supported) {
      return { ok: false, failures: [support.message], evidencePath: normalizeVisualPath(evidencePath) };
    }
  } catch (error) {
    return {
      ok: false,
      failures: [`Engine profile rejected (${error.code || 'ENGINE_PROFILE'}): ${error.message}`],
      evidencePath: normalizeVisualPath(evidencePath),
    };
  }
  if (engineProfile?.engine === 'godot') {
    if (typeof readGodotVisualContract !== 'function' || typeof inspectMjpegAvi !== 'function'
      || typeof snapshotGodotVisualInputs !== 'function') {
      failures.push('Trusted Forge engine does not expose the native Godot visual evidence runtime');
    }
    try { if (typeof readGodotVisualContract === 'function') godotContract = readGodotVisualContract(projectRoot); }
    catch (error) { failures.push(`Godot visual contract rejected (${error.code || 'GODOT_VISUAL'}): ${error.message}`); }
  }
  const evidenceFile = safeProjectFile(projectRoot, evidencePath);
  if (!evidenceFile) {
    return { ok: false, failures: [`Phase 4 visual evidence is missing: ${PHASE4_VISUAL_EVIDENCE_PATH}`], evidencePath: normalizeVisualPath(evidencePath) };
  }
  const evidence = parseJsonFile(evidenceFile.absolute);
  if (!evidence || evidence.schemaVersion !== PHASE4_VISUAL_SCHEMA_VERSION || evidence.kind !== 'forge.phase-4-visual-evidence' || evidence.phase !== 4) {
    return { ok: false, failures: ['Phase 4 visual evidence has the wrong schema/kind/phase'], evidencePath: evidenceFile.normalized };
  }

  const screenFlow = validateScreenFlow({ root: projectRoot });
  if (!screenFlow.ok) failures.push(...screenFlow.failures.map(item => `screen flow: ${item}`));
  const nativeRuntimeAvailable = engineProfile?.engine !== 'godot' || (godotContract
    && typeof inspectMjpegAvi === 'function' && typeof snapshotGodotVisualInputs === 'function');
  const capture = engineProfile?.engine === 'godot' && nativeRuntimeAvailable
    ? validateGodotCaptureManifest(projectRoot, evidence.captureManifest, screenFlow, godotContract, failures)
    : engineProfile?.engine === 'godot' ? null : validateCaptureManifest(projectRoot, evidence.captureManifest, screenFlow, failures);
  if (capture && evidence.captureId !== capture.captureId) failures.push('visual review is bound to a different captureId');
  if (capture && evidence.captureReceiptId !== capture.manifest.captureReceiptId) failures.push('visual review is bound to a different trusted capture receipt');
  const proof = engineProfile?.engine === 'godot' && nativeRuntimeAvailable
    ? validateGodotProofBundle(projectRoot, evidence.nativeProof, evidence.proofReview, screenFlow, godotContract, capture, failures)
    : null;

  const target = validateBoundFile(projectRoot, evidence.targetFrame, PHASE4_TARGET_FRAME_PATH, 'target frame', failures);
  if (target && !pngDimensions(target.absolute)) failures.push('target frame must be a valid dimensioned PNG');
  const screenTargets = validateScreenTargets(projectRoot, evidence.screenTargets, evidence.targetFrame?.sha256, screenFlow, failures);
  validateBoundFile(projectRoot, evidence.styleBible, PHASE4_STYLE_BIBLE_PATH, 'style bible', failures);
  validateBoundFile(projectRoot, evidence.report, PHASE4_VISUAL_REPORT_PATH, 'visual review report', failures);

  const builderKey = identityKey(evidence.builder);
  const reviewerKey = identityKey(evidence.reviewer);
  if (!builderKey) failures.push('builder identity requires id and sessionId');
  if (!reviewerKey) failures.push('reviewer identity requires id and sessionId');
  if (builderKey && reviewerKey && builderKey === reviewerKey) failures.push('Phase 4 cannot be accepted by the same builder session that produced it');
  if (builderKey && reviewerKey && String(evidence.builder.sessionId).toLowerCase() === String(evidence.reviewer.sessionId).toLowerCase()) {
    failures.push('Phase 4 independent review must run in a different host session from the builder capture');
  }
  if (capture && canonicalJson(evidence.builder || null) !== canonicalJson(capture.manifest.builder || null)) failures.push('builder identity does not match the trusted capture receipt');
  if (evidence.reviewer?.mode !== 'independent') failures.push('reviewer mode must be independent');
  if (!isIsoDate(evidence.reviewedAt)) failures.push('visual evidence needs a canonical ISO reviewedAt timestamp');
  if (isIsoDate(evidence.reviewedAt) && Date.parse(evidence.reviewedAt) > Date.now() + CLOCK_SKEW_MS) failures.push('visual review timestamp is implausibly in the future');
  if (capture && isIsoDate(evidence.reviewedAt) && Date.parse(evidence.reviewedAt) < Date.parse(capture.manifest.capturedAt)) {
    failures.push('visual review predates its screenshot capture');
  }
  if (proof && isIsoDate(evidence.reviewedAt) && Date.parse(evidence.reviewedAt) < Date.parse(proof.manifest.capturedAt)) {
    failures.push('visual review predates its Godot proof video');
  }

  const expectedStates = Array.isArray(evidence.coverage?.expectedStates) ? evidence.coverage.expectedStates.map(String) : [];
  const capturedStates = Array.isArray(evidence.coverage?.capturedStates) ? evidence.coverage.capturedStates.map(String) : [];
  if (!capture || !sameUniqueSet(expectedStates, screenFlow.ids || []) || !sameUniqueSet(capturedStates, screenFlow.ids || [])) {
    failures.push('review coverage does not exactly match the approved Phase 2 screen inventory');
  }
  if (evidence.coverage?.complete !== true || !Array.isArray(evidence.coverage?.missingStates) || evidence.coverage.missingStates.length) {
    failures.push('review coverage must be complete with zero missing states');
  }

  if (evidence.verdict !== 'pass') failures.push('overall Phase 4 visual verdict must be pass');
  if (Number(evidence.minimumScore) !== PHASE4_MIN_SCORE) failures.push(`minimumScore must be ${PHASE4_MIN_SCORE}`);
  if (typeof evidence.summary !== 'string' || evidence.summary.trim().length < 80) failures.push('visual review summary must contain a concrete critique of at least 80 characters');
  if (engineProfile?.engine === 'godot') {
    if (evidence.verification?.capture?.exitCode !== 0
      || !/godot-screens-shoot\.mjs/u.test(String(evidence.verification?.capture?.command || ''))
      || evidence.verification?.proof?.exitCode !== 0
      || !/godot-proof-video\.mjs/u.test(String(evidence.verification?.proof?.command || ''))) {
      failures.push('Godot visual evidence must record successful native capture and proof commands');
    }
  } else if (!evidence.verification || evidence.verification.exitCode !== 0 || !/screens-shoot\.mjs/u.test(String(evidence.verification.command || ''))) {
    failures.push('visual evidence must record a successful screens-shoot.mjs command');
  }

  const reviews = Array.isArray(evidence.reviews) ? evidence.reviews : [];
  const reviewKeys = new Set();
  for (const [index, review] of reviews.entries()) {
    const key = `${review?.state || ''}::${review?.viewport || ''}`;
    if (reviewKeys.has(key)) failures.push(`duplicate visual review: ${key}`);
    reviewKeys.add(key);
    const matchingCapture = capture?.captures.find(item => item.state === review?.state && item.viewport === review?.viewport);
    if (!matchingCapture || normalizeVisualPath(review?.file) !== matchingCapture.file || review?.sha256 !== matchingCapture.sha256) {
      failures.push(`review ${index + 1} is not bound to its captured screenshot`);
    }
    if (review?.verdict !== 'pass') failures.push(`review ${key} does not have a pass verdict`);
    if (typeof review?.critique !== 'string' || review.critique.trim().length < 80) failures.push(`review ${key} needs a concrete critique of at least 80 characters`);
    if (!review?.scores || SCORE_KEYS.some(score => !Number.isInteger(review.scores[score]) || review.scores[score] < 1 || review.scores[score] > 10)) {
      failures.push(`review ${key} must score all five visual criteria from 1 to 10`);
    } else {
      for (const score of SCORE_KEYS) if (review.scores[score] < PHASE4_MIN_SCORE) failures.push(`review ${key} ${score} is below ${PHASE4_MIN_SCORE}/10`);
    }
    const comparison = review?.targetComparison;
    const expectedTarget = screenTargets.targets.get(key);
    const matches = Array.isArray(comparison?.matches) ? comparison.matches.filter(item => typeof item === 'string' && item.trim().length >= 12) : [];
    const differences = Array.isArray(comparison?.differences) ? comparison.differences.filter(item => typeof item === 'string' && item.trim().length >= 20) : [];
    if (!expectedTarget || !comparison || normalizeVisualPath(comparison.targetPath) !== expectedTarget.path || comparison.targetSha256 !== expectedTarget.sha256) {
      failures.push(`review ${key} is not bound to its approved screen-specific target`);
    }
    if (!Number.isInteger(comparison?.distanceScore) || comparison.distanceScore < 1 || comparison.distanceScore > 10) {
      failures.push(`review ${key} needs a 1..10 target distance score`);
    } else if (comparison.distanceScore < PHASE4_MIN_SCORE) failures.push(`review ${key} target distance is below ${PHASE4_MIN_SCORE}/10`);
    if (new Set(matches).size < 2) failures.push(`review ${key} must name at least two concrete matches with the target frame`);
    if (new Set(differences).size < 3) failures.push(`review ${key} must name at least three concrete differences from the target frame`);
    if (!Array.isArray(review?.defects)) failures.push(`review ${key} needs an explicit defects array`);
    else if (review.defects.some(defect => ['critical', 'major'].includes(String(defect?.severity || '').toLowerCase()))) {
      failures.push(`review ${key} still contains an open Critical or Major defect`);
    }
  }
  if (!capture || reviews.length !== capture.captures.length || reviewKeys.size !== capture.captures.length) {
    failures.push('every captured mobile/desktop frame must have exactly one visual review');
  }

  const reviewReceipt = verifyVisualReceipt({
    projectRoot,
    kind: 'review',
    receiptId: evidence.reviewReceiptId,
    expectedPayload: reviewReceiptPayload({ evidencePath: evidenceFile.normalized, evidence }),
  });
  if (!reviewReceipt.ok) failures.push(`trusted independent review receipt rejected: ${reviewReceipt.failure || reviewReceipt.code}`);

  return {
    ok: failures.length === 0,
    failures: [...new Set(failures)],
    evidencePath: evidenceFile.normalized,
    captureManifest: capture?.file?.normalized || null,
    captureId: capture?.captureId || null,
    states: capture?.states || [],
    frames: capture?.captures?.length || 0,
    screenFlow: screenFlow.ok ? SCREEN_FLOW_PATH : null,
    captureReceiptId: capture?.manifest?.captureReceiptId || null,
    reviewReceiptId: reviewReceipt.ok ? evidence.reviewReceiptId : null,
    proofManifest: proof?.file?.normalized || null,
    proofId: proof?.proofId || null,
    proofReceiptId: proof?.manifest?.proofReceiptId || null,
    proofSamples: proof?.samples?.length || 0,
  };
}
