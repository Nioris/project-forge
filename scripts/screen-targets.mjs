#!/usr/bin/env node
/** Create/update the Phase 4 state -> mobile/desktop visual blueprint manifest. */
import fs from 'node:fs';
import path from 'node:path';
import { pngDimensions, sha256File } from '../.claude/skills/status/references/phase-4-visual-evidence.mjs';
import { findImageProvenance } from '../.claude/skills/status/references/image-provenance.mjs';
import { SCREEN_FLOW_PATH, validateScreenFlow, webCaptureViewport } from '../.claude/skills/status/references/screen-flow-contract.mjs';

const args = process.argv.slice(2);
const projectRoot = path.resolve(args[0] && !args[0].startsWith('--') ? args[0] : '.');
const option = (name, fallback = '') => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : fallback;
};
const state = option('state').trim();
let description = option('description').trim();
const inheritFrom = option('inherit-from').trim();
const requestedMode = option('mode', inheritFrom ? 'inherited' : 'dedicated');

if (!state || !['dedicated', 'inherited'].includes(requestedMode)) {
  console.error('Usage: screen-targets.mjs <project> --state <name> --description <40+ chars> (--mobile <png> --desktop <png> | --inherit-from <state>) [--mode dedicated|inherited]');
  process.exit(2);
}

function safeFile(rel) {
  const normalized = String(rel || '').replaceAll('\\', '/').replace(/^\.\//u, '');
  if (!normalized || path.isAbsolute(normalized) || normalized.split('/').includes('..')) throw new Error(`Unsafe project-relative path: ${rel}`);
  const realRoot = fs.realpathSync(projectRoot);
  const lexical = path.resolve(realRoot, normalized);
  const absolute = fs.realpathSync(lexical);
  const inside = path.relative(realRoot, absolute);
  if ((inside.startsWith('..') || path.isAbsolute(inside)) || !fs.statSync(absolute).isFile()) throw new Error(`File not found inside project: ${normalized}`);
  return { path: normalized, absolute };
}

function imageBinding(rel, viewport, expectedViewport) {
  const file = safeFile(rel);
  if (!/(?:^|\/)assets\/target\/screens\/.+\.png$/u.test(file.path)) throw new Error(`${viewport} target must be a PNG under assets/target/screens/: ${file.path}`);
  const dimensions = pngDimensions(file.absolute);
  if (!dimensions || dimensions.width < 512 || dimensions.height < 512) throw new Error(`${viewport} target must be a dimensioned PNG of at least 512px`);
  const expectedLandscape = expectedViewport.width > expectedViewport.height;
  const actualLandscape = dimensions.width > dimensions.height;
  if (actualLandscape !== expectedLandscape || dimensions.width === dimensions.height) {
    throw new Error(`${viewport} target orientation must match approved ${expectedViewport.width}x${expectedViewport.height} viewport`);
  }
  const sha256 = sha256File(file.absolute);
  const provenance = findImageProvenance({ projectRoot, outputPath: file.path, outputSha256: sha256, state, viewport });
  if (!provenance) throw new Error(`${viewport} target lacks hash-bound GPT Image/GigaChat provenance for state "${state}"`);
  return { path: file.path, sha256, provenance: { path: provenance.path, line: provenance.line, recordSha256: provenance.recordSha256 } };
}

try {
  const screenFlow = validateScreenFlow({ root: projectRoot });
  if (!screenFlow.ok) throw new Error(`Invalid ${SCREEN_FLOW_PATH}: ${screenFlow.failures.join('; ')}`);
  const flowState = screenFlow.states.find(item => item.id === state);
  if (!flowState) throw new Error(`State is not present in the approved screen flow: ${state}`);
  description ||= flowState.visualDescription;
  if (description.length < 40) throw new Error('Screen description must contain at least 40 characters');
  if (flowState.targetPolicy !== requestedMode && !(flowState.targetPolicy === 'inherited' && inheritFrom)) {
    throw new Error(`State "${state}" requires targetPolicy=${flowState.targetPolicy}`);
  }
  if ((flowState.inheritFrom || '') !== inheritFrom) throw new Error(`State "${state}" must inherit from "${flowState.inheritFrom || '(none)'}"`);
  const master = safeFile('assets/target/target-frame.png');
  const outPath = path.join(projectRoot, 'assets', 'target', 'screens', 'manifest.json');
  let manifest = { schemaVersion: 1, kind: 'forge.phase-4-screen-targets', masterTarget: null, screenFlow: null, states: [] };
  try { manifest = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch {}
  if (manifest.schemaVersion !== 1 || manifest.kind !== 'forge.phase-4-screen-targets' || !Array.isArray(manifest.states)) throw new Error('Existing screen target manifest has the wrong schema');
  manifest.masterTarget = { path: master.path, sha256: sha256File(master.absolute) };
  manifest.screenFlow = { path: SCREEN_FLOW_PATH, sha256: sha256File(screenFlow.file) };

  let references;
  let mode = requestedMode;
  if (inheritFrom) {
    const inherited = manifest.states.find(item => item?.state === inheritFrom);
    if (!inherited?.references?.mobile || !inherited?.references?.desktop) throw new Error(`Cannot inherit missing screen target state: ${inheritFrom}`);
    references = inherited.references;
    mode = 'inherited';
  } else {
    references = {
      mobile: imageBinding(option('mobile'), 'mobile', webCaptureViewport(flowState, 'mobile')),
      desktop: imageBinding(option('desktop'), 'desktop', webCaptureViewport(flowState, 'desktop')),
    };
    mode = 'dedicated';
  }

  const next = { state, archetype: flowState.archetype, mode, inheritedFrom: inheritFrom || null, description, references };
  manifest.states = [...manifest.states.filter(item => item?.state !== state), next]
    .sort((left, right) => String(left.state).localeCompare(String(right.state)));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const temp = `${outPath}.tmp-${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.renameSync(temp, outPath);
  console.log(`[OK] Screen target mapped: ${state} (${mode})`);
  console.log(`     ${path.relative(projectRoot, outPath).replaceAll('\\', '/')}`);
} catch (error) {
  console.error(`[X] ${error.message}`);
  process.exit(1);
}
