#!/usr/bin/env node
/** Record and mechanically inspect a deterministic 15–20 second native Godot proof video. */
import fs from 'node:fs';
import path from 'node:path';
import { readGodotVisualContract } from './godot-visual-contract.mjs';
import {
  combinedOutput,
  configureIsolatedGodotViewport,
  createVisualRunId,
  detectGodotVisualTool,
  godotErrorLines,
  isolatedGodotUserEnv,
  inspectMjpegAvi,
  isVisualEnvironmentFailure,
  makeIsolatedGodotCopy,
  normalizePath,
  parseMarkerLines,
  runBounded,
  snapshotGodotVisualInputs,
} from './godot-visual-runtime.mjs';
import {
  computeGodotProofId,
  currentVisualRuntimeIdentity,
  pngDimensions,
  proofReceiptPayload,
  sha256File,
} from '../.claude/skills/status/references/phase-4-visual-evidence.mjs';
import { FORGE_GODOT_VISUAL_PROTOCOL, SCREEN_FLOW_PATH } from '../.claude/skills/status/references/screen-flow-contract.mjs';
import { recordVisualReceipt } from '../.claude/skills/status/references/visual-receipts.mjs';

const MIN_UNIQUE_SAMPLES = 12;
const argv = process.argv.slice(2);
const jsonMode = argv.includes('--json');
const projectRoot = path.resolve(argv.find(value => !value.startsWith('--')) || '.');
const result = {
  schemaVersion: 1,
  kind: 'forge.godot-proof-video-run',
  status: 'failed',
  projectRoot,
  manifest: null,
  proofId: null,
  proofReceiptId: null,
  engine: null,
  video: null,
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
  if (!builder) issue('GODOT_VISUAL_IDENTITY', 'Native proof video requires a Forge/Codex/Claude host session identity', {}, true);
  const godot = detectGodotVisualTool();
  result.engine = { name: 'godot', command: godot.command, version: godot.version, testHarness: godot.testHarness === true };
  if (!godot.ok) issue('GODOT_VISUAL_TOOLCHAIN', `Godot executable is unavailable${godot.run?.error?.message ? `: ${godot.run.error.message}` : ''}`, {}, true);

  if (!result.issues.length) {
    const implementationSnapshot = snapshotGodotVisualInputs(contract.implementationRoot);
    isolated = makeIsolatedGodotCopy(contract.implementationRoot);
    const godotUserEnv = isolatedGodotUserEnv(isolated.tempRoot);
    const startedAt = new Date().toISOString();
    const runId = createVisualRunId(new Date(startedAt));
    const reviewRoot = path.join(projectRoot, 'screens', 'review');
    const mediaRoot = path.join(reviewRoot, 'godot', runId);
    fs.mkdirSync(mediaRoot, { recursive: true });
    const videoFile = path.join(mediaRoot, 'proof-video.avi');
    const samplesRoot = path.join(mediaRoot, 'proof-samples');
    const dimensions = contract.capture.viewports[contract.proofVideo.viewport];
    const expectedFrames = contract.proofVideo.fps * contract.proofVideo.durationSeconds;
    const minimumUniqueVideoFrames = Math.min(MIN_UNIQUE_SAMPLES, expectedFrames);
    configureIsolatedGodotViewport(isolated.isolatedProject, dimensions);
    const args = [
      ...godot.prefix,
      '--path', isolated.isolatedProject,
      '--resolution', `${dimensions.width}x${dimensions.height}`,
      '--write-movie', videoFile,
      '--fixed-fps', String(contract.proofVideo.fps),
      '--quit-after', String(expectedFrames + 120),
      '--',
      '--forge-visual-mode=proof',
      `--forge-visual-target=${contract.adapter.targetNode}`,
      `--forge-proof-states=${contract.proofVideo.states.join(',')}`,
      `--forge-proof-total-frames=${expectedFrames}`,
      `--forge-proof-fps=${contract.proofVideo.fps}`,
      `--forge-proof-samples-dir=${samplesRoot}`,
      `--forge-visual-width=${dimensions.width}`,
      `--forge-visual-height=${dimensions.height}`,
    ];
    const timeoutMs = Math.max(120_000, contract.proofVideo.durationSeconds * 12_000);
    const run = runBounded(godot.command, args, { cwd: isolated.isolatedProject, timeoutMs, env: godotUserEnv });
    const output = combinedOutput(run);
    const protocol = parseMarkerLines(output, 'FORGE_VISUAL_PROTOCOL:').at(-1);
    const ready = parseMarkerLines(output, 'FORGE_VISUAL_PROOF_READY:').at(-1) || '';
    const complete = Number(parseMarkerLines(output, 'FORGE_VISUAL_PROOF_COMPLETE:').at(-1));
    const timeline = parseMarkerLines(output, 'FORGE_VISUAL_PROOF_STATE:').map(value => {
      const separator = value.lastIndexOf(':');
      return { state: separator >= 0 ? value.slice(0, separator) : value, frame: separator >= 0 ? Number(value.slice(separator + 1)) : NaN };
    });
    const sampleMarkers = parseMarkerLines(output, 'FORGE_VISUAL_PROOF_SAMPLE:').map(value => {
      const match = /^(\d+):(.*)$/su.exec(value);
      return match ? { frame: Number(match[1]), absolute: path.resolve(match[2]) } : { frame: NaN, absolute: '' };
    });
    const trustedProtocolSuccess = run.status === 0 && !run.timedOut && !run.error
      && protocol === FORGE_GODOT_VISUAL_PROTOCOL
      && ready === `${expectedFrames}:${contract.proofVideo.fps}`
      && complete === expectedFrames;
    const errors = godotErrorLines(output, { ignoreRootCertificateWarning: trustedProtocolSuccess });
    const environment = isVisualEnvironmentFailure(run, output);
    if (run.status !== 0 || errors.length || protocol !== FORGE_GODOT_VISUAL_PROTOCOL
      || ready !== `${expectedFrames}:${contract.proofVideo.fps}` || complete !== expectedFrames) {
      const message = run.timedOut ? 'Godot proof video timed out' : errors[0] || 'Godot proof driver did not complete its native protocol';
      issue(environment ? 'GODOT_PROOF_ENVIRONMENT' : 'GODOT_PROOF_RUNTIME', message, { exitCode: run.status, timedOut: run.timedOut }, environment);
    }
    const timelineStates = timeline.map(item => item.state);
    if (JSON.stringify(timelineStates) !== JSON.stringify(contract.proofVideo.states)
      || timeline.some(item => !Number.isInteger(item.frame) || item.frame < 0 || item.frame >= expectedFrames)) {
      issue('GODOT_PROOF_TIMELINE', 'Proof driver did not report the approved state timeline exactly', { expected: contract.proofVideo.states, actual: timeline });
    }

    const expectedSampleFrames = Array.from({ length: contract.proofVideo.durationSeconds }, (_, index) => index * contract.proofVideo.fps);
    const samples = [];
    for (let index = 0; index < expectedSampleFrames.length; index++) {
      const expectedFrame = expectedSampleFrames[index];
      const marker = sampleMarkers[index];
      const expectedFile = path.join(samplesRoot, `sample-${String(expectedFrame).padStart(6, '0')}.png`);
      if (!marker || marker.frame !== expectedFrame || normalizePath(marker.absolute) !== normalizePath(expectedFile)) {
        issue('GODOT_PROOF_SAMPLES', 'Proof driver did not report the exact one-sample-per-second timeline', {
          expectedFrames: expectedSampleFrames,
          actual: sampleMarkers.map(item => ({ frame: item.frame, file: item.absolute })),
        });
        break;
      }
      const actual = pngDimensions(expectedFile);
      if (!actual || actual.width !== dimensions.width || actual.height !== dimensions.height) {
        issue('GODOT_PROOF_SAMPLE_PNG', `Proof sample ${expectedFrame} is not a valid ${dimensions.width}x${dimensions.height} PNG`);
        continue;
      }
      samples.push({
        frame: expectedFrame,
        state: [...timeline].reverse().find(item => item.frame <= expectedFrame)?.state || '',
        file: relativeToProject(expectedFile),
        sha256: sha256File(expectedFile),
        width: actual.width,
        height: actual.height,
      });
    }
    if (sampleMarkers.length !== expectedSampleFrames.length) {
      issue('GODOT_PROOF_SAMPLES', `Proof produced ${sampleMarkers.length}/${expectedSampleFrames.length} required sample markers`);
    }
    const uniqueSamples = new Set(samples.map(item => item.sha256)).size;
    const minimumUniqueSamples = Math.min(MIN_UNIQUE_SAMPLES, expectedSampleFrames.length);
    if (samples.length !== expectedSampleFrames.length || uniqueSamples < minimumUniqueSamples) {
      issue('GODOT_PROOF_FROZEN', `Proof samples show insufficient visual change: ${uniqueSamples}/${samples.length} unique lossless frames; need ${minimumUniqueSamples}`);
    }

    const inspected = inspectMjpegAvi(videoFile);
    if (!inspected) {
      issue('GODOT_PROOF_CODEC', 'Godot did not produce a structurally valid MJPEG AVI proof video');
    } else {
      result.video = {
        file: relativeToProject(videoFile),
        sha256: sha256File(videoFile),
        codec: 'MJPEG AVI',
        width: inspected.width,
        height: inspected.height,
        fps: inspected.fps,
        expectedFrames,
        actualFrames: inspected.actualFrames,
        uniqueFrames: inspected.uniqueFrames,
        uniqueFrameRatio: Number(inspected.uniqueFrameRatio.toFixed(6)),
        durationSeconds: inspected.fps > 0 ? Number((inspected.actualFrames / inspected.fps).toFixed(3)) : 0,
        streamHandler: inspected.streamHandler,
        compression: inspected.compression,
        riffDeclaredSizeDelta: inspected.declaredSizeDelta,
        indexEntries: inspected.indexEntries,
        indexVideoEntries: inspected.indexVideoEntries,
        indexValidated: inspected.indexValidated,
      };
      if (inspected.width !== dimensions.width || inspected.height !== dimensions.height || inspected.fps !== contract.proofVideo.fps) {
        issue('GODOT_PROOF_FORMAT', `Proof video is ${inspected.width}x${inspected.height}@${inspected.fps}, expected ${dimensions.width}x${dimensions.height}@${contract.proofVideo.fps}`);
      }
      if (Math.abs(inspected.actualFrames - expectedFrames) > 1) {
        issue('GODOT_PROOF_FRAMES', `Proof video contains ${inspected.actualFrames} frames, expected ${expectedFrames} ±1`);
      }
      if (inspected.uniqueFrames < minimumUniqueVideoFrames) {
        issue('GODOT_PROOF_VIDEO_FROZEN', `MJPEG proof contains only ${inspected.uniqueFrames}/${inspected.actualFrames} unique encoded frames; need ${minimumUniqueVideoFrames}`);
      }
    }

    const finalImplementationSnapshot = snapshotGodotVisualInputs(contract.implementationRoot);
    if (finalImplementationSnapshot.sha256 !== implementationSnapshot.sha256
      || finalImplementationSnapshot.fileCount !== implementationSnapshot.fileCount
      || finalImplementationSnapshot.bytes !== implementationSnapshot.bytes) {
      issue('GODOT_PROOF_SOURCE_CHANGED', 'Godot implementation changed while the proof video was being recorded', {
        before: implementationSnapshot,
        after: finalImplementationSnapshot,
      });
    }

    const capturedAt = new Date().toISOString();
    const manifestRel = 'screens/review/proof-video-manifest.json';
    const manifest = {
      schemaVersion: 1,
      kind: 'forge.godot-proof-video',
      generatedBy: 'godot-proof-video.mjs',
      proofId: null,
      proofReceiptId: null,
      startedAt,
      capturedAt,
      builder,
      engine: result.engine,
      screenFlow: { path: SCREEN_FLOW_PATH, sha256: sha256File(contract.screenFlow.file) },
      visualContract: { path: 'forge.godot.visual.json', sha256: sha256File(path.join(projectRoot, 'forge.godot.visual.json')) },
      stateAdapter: {
        protocol: FORGE_GODOT_VISUAL_PROTOCOL,
        autoloadName: contract.adapter.autoloadName,
        script: contract.adapter.script.resource,
        targetNode: contract.adapter.targetNode,
        sha256: sha256File(path.join(contract.implementationRoot, contract.adapter.script.rel)),
      },
      implementationSnapshot,
      gameRoot: contract.projectPath,
      command: commandText(godot.command, args),
      viewport: contract.proofVideo.viewport,
      requestedStates: contract.proofVideo.states,
      timeline,
      samples,
      video: result.video,
      thresholds: {
        minimumUniqueSamples,
        actualUniqueSamples: uniqueSamples,
        sampleIntervalFrames: contract.proofVideo.fps,
        minimumUniqueVideoFrames,
        actualUniqueVideoFrames: result.video?.uniqueFrames || 0,
      },
      runtimeErrors: result.issues.map(item => ({ code: item.code, message: item.message })),
      verdict: result.issues.length ? 'fail' : 'pass',
    };
    manifest.proofId = computeGodotProofId({ manifest });
    result.proofId = manifest.proofId;
    if (!result.issues.length) {
      try {
        const receipt = recordVisualReceipt({
          projectRoot,
          kind: 'proof',
          payload: proofReceiptPayload({ manifestPath: manifestRel, manifest }),
        });
        manifest.proofReceiptId = receipt.receipt.receiptId;
        result.proofReceiptId = manifest.proofReceiptId;
      } catch (error) {
        issue('GODOT_PROOF_RECEIPT', `Unable to record trusted native proof receipt: ${error.message}`, {}, true);
        manifest.verdict = 'fail';
        manifest.runtimeErrors = result.issues.map(item => ({ code: item.code, message: item.message }));
      }
    }
    fs.writeFileSync(path.join(reviewRoot, 'proof-video-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    result.manifest = manifestRel;
  }
} catch (error) {
  issue(error.code || 'GODOT_PROOF_INTERNAL', error.message, error.details || {}, error.code?.includes('ENGINE') || false);
} finally {
  if (isolated?.tempRoot) fs.rmSync(isolated.tempRoot, { recursive: true, force: true });
}

result.status = environmentFailure ? 'environment_failure' : result.issues.length ? 'failed' : 'passed';
result.summary = result.status === 'passed'
  ? `Recorded ${result.video?.durationSeconds || 0}s proof video with verified lossless motion samples`
  : `${result.issues.length} issue(s); proof video not accepted`;

if (jsonMode) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`[${result.status.toUpperCase()}] ${result.summary}`);
  for (const item of result.issues) console.log(`  ${item.code}: ${item.message}`);
  if (result.manifest) console.log(`  Manifest: ${result.manifest}`);
}
process.exitCode = result.status === 'passed' ? 0 : result.status === 'failed' ? 1 : 2;
