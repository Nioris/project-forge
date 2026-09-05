#!/usr/bin/env node
/** Capture every approved Godot screen-flow state at native mobile and desktop resolutions. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readGodotVisualContract } from './godot-visual-contract.mjs';
import {
  combinedOutput,
  configureIsolatedGodotViewport,
  createVisualRunId,
  detectGodotVisualTool,
  godotErrorLines,
  isolatedGodotUserEnv,
  isVisualEnvironmentFailure,
  makeIsolatedGodotCopy,
  normalizePath,
  parseMarkerLines,
  runBounded,
  snapshotGodotVisualInputs,
  slug,
} from './godot-visual-runtime.mjs';
import {
  captureReceiptPayload,
  computeVisualCaptureId,
  currentVisualRuntimeIdentity,
  pngDimensions,
  sha256File,
} from '../.claude/skills/status/references/phase-4-visual-evidence.mjs';
import { FORGE_GODOT_VISUAL_PROTOCOL, SCREEN_FLOW_PATH } from '../.claude/skills/status/references/screen-flow-contract.mjs';
import { recordVisualReceipt } from '../.claude/skills/status/references/visual-receipts.mjs';

const argv = process.argv.slice(2);
const jsonMode = argv.includes('--json');
const diagnostic = argv.includes('--diagnostic');
const projectRoot = path.resolve(argv.find(value => !value.startsWith('--')) || '.');
const result = {
  schemaVersion: 1,
  kind: 'forge.godot-visual-capture-run',
  status: 'failed',
  projectRoot,
  manifest: null,
  engine: null,
  captures: [],
  issues: [],
};
let environmentFailure = false;
let isolated = null;

function issue(code, message, details = {}, environment = false) {
  result.issues.push({ code, message: String(message).slice(0, 1000), details });
  if (environment) environmentFailure = true;
}

function relativeToProject(file) {
  return normalizePath(path.relative(projectRoot, file));
}

function commandText(command, args) {
  const quote = value => /\s/u.test(String(value)) ? JSON.stringify(String(value)) : String(value);
  return [command, ...args].map(quote).join(' ');
}

try {
  const contract = readGodotVisualContract(projectRoot);
  const builder = currentVisualRuntimeIdentity();
  if (!builder && !diagnostic) {
    issue('GODOT_VISUAL_IDENTITY', 'Native Phase 4 capture requires a Forge/Codex/Claude host session identity', {}, true);
  }

  const godot = detectGodotVisualTool();
  result.engine = { name: 'godot', command: godot.command, version: godot.version, testHarness: godot.testHarness === true };
  if (!godot.ok) {
    issue('GODOT_VISUAL_TOOLCHAIN', `Godot executable is unavailable${godot.run?.error?.message ? `: ${godot.run.error.message}` : ''}`, {}, true);
  }

  if (!result.issues.length) {
    const implementationSnapshot = snapshotGodotVisualInputs(contract.implementationRoot);
    isolated = makeIsolatedGodotCopy(contract.implementationRoot);
    const godotUserEnv = isolatedGodotUserEnv(isolated.tempRoot);
    const startedAt = new Date().toISOString();
    const runId = createVisualRunId(new Date(startedAt));
    const reviewRoot = diagnostic
      ? path.join(projectRoot, 'screens', 'qa', 'phase-7-visual')
      : path.join(projectRoot, 'screens', 'review');
    const mediaRoot = path.join(reviewRoot, 'godot', runId);
    fs.mkdirSync(mediaRoot, { recursive: true });
    const captures = [];
    const runtimeErrors = [];
    const missingStates = [];
    const commands = [];

    outer: for (const [viewport, dimensions] of Object.entries(contract.capture.viewports)) {
      configureIsolatedGodotViewport(isolated.isolatedProject, dimensions);
      let index = 1;
      for (const state of contract.screenFlow.states) {
        const output = path.join(mediaRoot, `${viewport}-${String(index).padStart(2, '0')}-${slug(state.id)}.png`);
        const args = [
          ...godot.prefix,
          '--path', isolated.isolatedProject,
          '--resolution', `${dimensions.width}x${dimensions.height}`,
          '--fixed-fps', '30',
          '--quit-after', String(contract.capture.settleFrames + 120),
          '--',
          '--forge-visual-mode=capture',
          `--forge-visual-target=${contract.adapter.targetNode}`,
          `--forge-visual-state=${state.capture.adapterState}`,
          `--forge-visual-output=${output}`,
          `--forge-visual-width=${dimensions.width}`,
          `--forge-visual-height=${dimensions.height}`,
          `--forge-visual-settle-frames=${contract.capture.settleFrames}`,
        ];
        let run = null;
        let outputText = '';
        let protocol = [];
        let reported = [];
        let written = [];
        let errors = [];
        let environment = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          commands.push(commandText(godot.command, args));
          run = runBounded(godot.command, args, {
            cwd: isolated.isolatedProject,
            timeoutMs: contract.capture.timeoutSeconds * 1000,
            env: godotUserEnv,
          });
          outputText = combinedOutput(run);
          protocol = parseMarkerLines(outputText, 'FORGE_VISUAL_PROTOCOL:');
          reported = parseMarkerLines(outputText, 'FORGE_VISUAL_STATE:');
          written = parseMarkerLines(outputText, 'FORGE_VISUAL_CAPTURED:');
          const trustedProtocolSuccess = run.status === 0 && !run.timedOut && !run.error
            && protocol.at(-1) === FORGE_GODOT_VISUAL_PROTOCOL
            && reported.at(-1) === state.capture.adapterState
            && normalizePath(written.at(-1)) === normalizePath(output);
          errors = godotErrorLines(outputText, { ignoreRootCertificateWarning: trustedProtocolSuccess });
          environment = isVisualEnvironmentFailure(run, outputText);
          if (trustedProtocolSuccess && errors.length === 0) break;
          if (environment) break;
        }
        if (run.status !== 0 || errors.length || protocol.at(-1) !== FORGE_GODOT_VISUAL_PROTOCOL
          || reported.at(-1) !== state.capture.adapterState || normalizePath(written.at(-1)) !== normalizePath(output)) {
          const message = run.timedOut
            ? `${state.id}/${viewport} capture timed out`
            : errors[0] || `${state.id}/${viewport} did not complete the native visual protocol`;
          runtimeErrors.push({ state: state.id, viewport, message, exitCode: run.status, timedOut: run.timedOut, environment });
          missingStates.push({ state: state.id, viewport });
          issue(environment ? 'GODOT_VISUAL_ENVIRONMENT' : 'GODOT_VISUAL_RUNTIME', message, { state: state.id, viewport }, environment);
          if (environment) break outer;
          index++;
          continue;
        }
        const actual = pngDimensions(output);
        if (!actual || actual.width !== dimensions.width || actual.height !== dimensions.height) {
          const message = `${state.id}/${viewport} did not produce a valid ${dimensions.width}x${dimensions.height} PNG`;
          runtimeErrors.push({ state: state.id, viewport, message, exitCode: run.status, timedOut: false, environment: false });
          missingStates.push({ state: state.id, viewport });
          issue('GODOT_VISUAL_PNG', message, { state: state.id, viewport });
          index++;
          continue;
        }
        captures.push({
          state: state.id,
          viewport,
          file: relativeToProject(output),
          width: actual.width,
          height: actual.height,
          contentHeightRatio: 1,
          sha256: sha256File(output),
          stateProof: {
            mechanism: 'forge-godot-runtime-adapter',
            protocol: FORGE_GODOT_VISUAL_PROTOCOL,
            requestedState: state.id,
            adapterState: state.capture.adapterState,
            reportedState: reported.at(-1),
          },
        });
        index++;
      }
    }

    const statePixelCollisions = [];
    for (const viewport of Object.keys(contract.capture.viewports)) {
      const seen = new Map();
      for (const capture of captures.filter(item => item.viewport === viewport)) {
        const prior = seen.get(capture.sha256);
        if (prior && prior !== capture.state) {
          statePixelCollisions.push({ viewport, states: [prior, capture.state], sha256: capture.sha256 });
        } else {
          seen.set(capture.sha256, capture.state);
        }
      }
    }
    if (statePixelCollisions.length) {
      const message = `Distinct approved states rendered identical pixels in ${statePixelCollisions.length} viewport pair(s)`;
      runtimeErrors.push({ message, code: 'GODOT_VISUAL_IDENTICAL_STATES', collisions: statePixelCollisions, environment: false });
      issue('GODOT_VISUAL_IDENTICAL_STATES', message, { collisions: statePixelCollisions });
    }
    const finalImplementationSnapshot = snapshotGodotVisualInputs(contract.implementationRoot);
    if (finalImplementationSnapshot.sha256 !== implementationSnapshot.sha256
      || finalImplementationSnapshot.fileCount !== implementationSnapshot.fileCount
      || finalImplementationSnapshot.bytes !== implementationSnapshot.bytes) {
      const message = 'Godot implementation changed while native screenshots were being captured';
      runtimeErrors.push({ message, code: 'GODOT_VISUAL_SOURCE_CHANGED', environment: false });
      issue('GODOT_VISUAL_SOURCE_CHANGED', message, { before: implementationSnapshot, after: finalImplementationSnapshot });
    }

    const capturedAt = new Date().toISOString();
    const captureId = computeVisualCaptureId({ capturedAt, captures });
    const manifestRel = diagnostic
      ? 'screens/qa/phase-7-visual/capture-manifest.json'
      : 'screens/review/capture-manifest.json';
    const manifest = {
      schemaVersion: 1,
      kind: 'forge.visual-capture',
      generatedBy: 'godot-screens-shoot.mjs',
      captureMode: diagnostic ? 'forge-godot-runtime-adapter-diagnostic' : 'forge-godot-runtime-adapter',
      startedAt,
      capturedAt,
      captureId,
      captureReceiptId: null,
      builder: builder || null,
      engine: result.engine,
      screenFlow: { path: SCREEN_FLOW_PATH, sha256: sha256File(contract.screenFlow.file) },
      stateAdapter: {
        protocol: FORGE_GODOT_VISUAL_PROTOCOL,
        autoloadName: contract.adapter.autoloadName,
        script: contract.adapter.script.resource,
        targetNode: contract.adapter.targetNode,
        sha256: sha256File(path.join(contract.implementationRoot, contract.adapter.script.rel)),
      },
      visualContract: { path: 'forge.godot.visual.json', sha256: sha256File(path.join(projectRoot, 'forge.godot.visual.json')) },
      implementationSnapshot,
      projectRoot: '.',
      gameRoot: contract.projectPath,
      command: commands.join(os.EOL),
      requestedStates: contract.screenFlow.ids,
      states: [...new Set(captures.map(item => item.state))],
      viewports: contract.capture.viewports,
      missingStates,
      runtimeErrors,
      statePixelCollisions,
      captures,
    };
    if (!diagnostic && !missingStates.length && !runtimeErrors.length && captures.length === contract.screenFlow.ids.length * 2) {
      try {
        const receipt = recordVisualReceipt({
          projectRoot,
          kind: 'capture',
          payload: captureReceiptPayload({ manifestPath: manifestRel, manifest }),
        });
        manifest.captureReceiptId = receipt.receipt.receiptId;
      } catch (error) {
        issue('GODOT_VISUAL_RECEIPT', `Unable to record trusted native capture receipt: ${error.message}`, {}, true);
      }
    }
    fs.writeFileSync(path.join(reviewRoot, 'capture-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    result.manifest = manifestRel;
    result.captures = captures;
  }
} catch (error) {
  issue(error.code || 'GODOT_VISUAL_INTERNAL', error.message, error.details || {}, error.code?.includes('ENGINE') || false);
} finally {
  if (isolated?.tempRoot) fs.rmSync(isolated.tempRoot, { recursive: true, force: true });
}

result.status = environmentFailure ? 'environment_failure' : result.issues.length ? 'failed' : 'passed';
result.summary = result.status === 'passed'
  ? `Captured ${result.captures.length} native Godot state/viewport frames`
  : `${result.issues.length} issue(s); ${result.captures.length} valid frame(s)`;

if (jsonMode) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`[${result.status.toUpperCase()}] ${result.summary}`);
  for (const item of result.issues) console.log(`  ${item.code}: ${item.message}`);
  if (result.manifest) console.log(`  Manifest: ${result.manifest}`);
}
process.exitCode = result.status === 'passed' ? 0 : result.status === 'failed' ? 1 : 2;
