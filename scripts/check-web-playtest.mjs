#!/usr/bin/env node
/** Real browser smoke for the contract runner: passing flow and a dead-input rejection. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runWebPlaytest } from './web-playtest-runner.mjs';
import { verifyVisualReceipt } from '../.claude/skills/status/references/visual-receipts.mjs';
import { webPlaytestReceiptPayload } from './web-playtest-contract.mjs';
import { snapshotWebGameSource } from './web-playtest-contract.mjs';

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(scriptRoot, 'fixtures', 'web-playtest');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-web-playtest-'));
const failures = [];
const check = (condition, message) => { console.log(`  ${condition ? '✓' : '✗'} ${message}`); if (!condition) failures.push(message); };
try {
  const syncedRoot = path.join(temp, 'synced-project');
  fs.cpSync(path.join(scriptRoot, '..', '.claude'), path.join(syncedRoot, '.claude'), { recursive: true });
  const copiedImport = spawnSync(process.execPath, ['--input-type=module', '-e',
    'await import("./.claude/skills/status/references/phase-completion-gate.mjs");'],
    { cwd: syncedRoot, encoding: 'utf8', timeout: 30_000 });
  check(copiedImport.status === 0 && !fs.existsSync(path.join(syncedRoot, 'scripts')),
    `synced phase runtime loads without a project-local engine scripts directory${copiedImport.status === 0 ? '' : `: ${copiedImport.stderr}`}`);
  for (const name of ['pass', 'broken']) fs.cpSync(path.join(fixtureRoot, name), path.join(temp, name), { recursive: true });
  const unsupported = spawnSync(process.execPath, [path.join(scriptRoot, 'web-playtest-runner.mjs'), '--project-root', path.join(temp, 'pass'), '--unsupported'], { encoding: 'utf8' });
  check(unsupported.status === 2 && !fs.existsSync(path.join(temp, 'pass', 'game', 'playtest-out')),
    'unsupported contract-runner CLI options fail before creating project output');
  const pass = await runWebPlaytest(path.join(temp, 'pass'));
  check(pass.ok, 'real browser contract accepts two state-changing player actions and a negative action');
  check(pass.report.steps.length === 3 && pass.report.steps[2].changed === false, 'report records the required negative no-change action');
  const receipt = pass.report.receiptId ? verifyVisualReceipt({ projectRoot: path.join(temp, 'pass'), kind: 'web-playtest', receiptId: pass.report.receiptId,
    expectedPayload: webPlaytestReceiptPayload({ reportPath: 'game/playtest-out/report.json', report: pass.report }) }) : { ok: false };
  check(receipt.ok, 'passing report is bound to an engine-owned proof outside the project');
  check(pass.report.persistence.checked === true && pass.report.persistence.state === 'result',
    'persistence-required flow reloads and observes the saved production state');
  check(Object.values(pass.report.runtime.facts).every(value => value === true),
    'runtime facts survive the persistence reload and pointer input is runner-observed');
  const beforeQaInput = snapshotWebGameSource(path.join(temp, 'pass', 'game'));
  fs.mkdirSync(path.join(temp, 'pass', 'game', 'qa'), { recursive: true });
  fs.writeFileSync(path.join(temp, 'pass', 'game', 'qa', 'adapter.js'), 'export const visualAdapter = 1;\n');
  check(snapshotWebGameSource(path.join(temp, 'pass', 'game')) !== beforeQaInput,
    'a QA runtime adapter input invalidates the browser source snapshot');
  const beforeDistInput = snapshotWebGameSource(path.join(temp, 'pass', 'game'));
  fs.mkdirSync(path.join(temp, 'pass', 'game', 'dist'), { recursive: true });
  fs.writeFileSync(path.join(temp, 'pass', 'game', 'dist', 'app.js'), 'export const shippedBuild = 1;\n');
  check(snapshotWebGameSource(path.join(temp, 'pass', 'game')) !== beforeDistInput,
    'a served dist/app.js input invalidates the browser source snapshot');
  const broken = await runWebPlaytest(path.join(temp, 'broken'));
  check(!broken.ok && !broken.report.receiptId, 'dead input cannot mint a passing receipt');
} catch (error) {
  check(false, `runner smoke threw: ${error.message}`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
if (failures.length) { console.error(`FAIL: ${failures.join('; ')}`); process.exitCode = 1; }
