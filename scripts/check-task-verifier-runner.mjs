#!/usr/bin/env node
/** Offline regression for registry-backed Task verifier execution and repair routing. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  makeRunResult, makeTask, readTaskRun, recordTaskResult, startTaskRun, taskRunPath,
} from '../.claude/skills/status/references/execution-contract.mjs';
import {
  deriveVerifierPlanFromOperations, loadTaskVerifierRegistry, normalizeVerifierExecution, runTaskVerifiers,
} from '../.claude/skills/status/references/verifier-runner.mjs';
import { runWorkflowCli } from '../.claude/skills/status/references/workflow-state.mjs';

const failures = [];
const check = (condition, message) => {
  console.log(`  ${condition ? '✓' : '✗'} ${message}`);
  if (!condition) failures.push(message);
};
const throws = fn => { try { fn(); return false; } catch { return true; } };

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

function registryEntry(id, overrides = {}) {
  return {
    id,
    script: `scripts/check-${id}.mjs`,
    public: true,
    scope: 'project',
    mutates: false,
    timeoutMs: 3000,
    phases: [3, 5, 7, 8],
    category: 'fixture',
    taskRunner: { cwd: 'engine-root', target: 'verification-target', json: true },
    ...overrides,
  };
}

function implementationComplete(run) {
  return recordTaskResult({
    projectRoot: run.projectRoot,
    taskId: run.task.id,
    result: makeRunResult({
      taskId: run.task.id, node: run.state.currentNode, status: 'completed', code: 'FIXTURE_IMPLEMENTED',
      message: 'Fixture implementation complete', host: 'fixture', phase: run.task.phase,
    }),
  });
}

function repairComplete(projectRoot, run) {
  return recordTaskResult({
    projectRoot,
    taskId: run.task.id,
    result: makeRunResult({
      taskId: run.task.id, node: run.state.currentNode, status: 'completed', code: 'FIXTURE_REPAIRED',
      message: 'Fixture repair complete', host: 'fixture', phase: run.task.phase,
    }),
  });
}

function createVerifyTask(projectRoot, id, verifiers, phase = 3, verificationTarget = '.') {
  const task = makeTask({
    id, mode: 'change', phase, goal: `Verify ${id}`,
    scope: { read: ['**'], write: ['src/**'] },
    acceptance: [{ id: 'AC-1', text: 'Registered verification passes', status: 'pending' }],
    verifiers, verificationTarget,
  });
  const started = startTaskRun({ projectRoot, task });
  started.projectRoot = projectRoot;
  return implementationComplete(started);
}

console.log('Project Forge durable Task verifier runner audit');
console.log('───────────────────────────────────────────────');

const realRegistry = loadTaskVerifierRegistry({ projectRoot: process.cwd() });
const taskRunnable = realRegistry.entries.filter(entry => entry.taskRunner);
const expectedTaskRunnable = ['appmetrica', 'external-cdn', 'gacha-integration', 'godot-project', 'inline-strings',
  'no-float-money', 'phase4-visual-evidence', 'setup-guide', 'store-listing', 'workspace-discipline'];
check(taskRunnable.length === expectedTaskRunnable.length
  && expectedTaskRunnable.every(id => taskRunnable.some(entry => entry.id === id))
  && taskRunnable.every(entry => entry.public && entry.scope === 'project' && entry.mutates === false),
  'canonical registry explicitly allows ten read-only project verifiers for Task execution');
check(taskRunnable.find(entry => entry.id === 'gacha-integration')?.phases?.includes(8) === true,
  'direct gacha repairs can be re-verified during release-phase stabilization');
const gachaEntry = taskRunnable.find(entry => entry.id === 'gacha-integration');
const gachaSource = gachaEntry ? fs.readFileSync(gachaEntry.filepath, 'utf8') : '';
check(Number(gachaEntry?.timeoutMs) > 100_000 && /watchdogFired/.test(gachaSource)
  && /browser\.process\(\)\?\.kill/.test(gachaSource),
  'browser verifier owns an internal watchdog and child cleanup before the outer Task timeout');
const derivedGacha = deriveVerifierPlanFromOperations({
  projectRoot: process.cwd(), phase: 8, allowedVerifiers: ['gacha-integration'],
  operations: [{ tool: 'forge_script', script: 'scripts/check-gacha-integration.mjs', args: ['WorkProgress/demo'], exitCode: 0 }],
});
const proseGacha = deriveVerifierPlanFromOperations({
  projectRoot: process.cwd(), phase: 8, allowedVerifiers: ['gacha-integration'],
  operations: [{ command: 'forge_script scripts/check-gacha-integration.mjs WorkProgress/demo', status: 0 }],
});
check(derivedGacha?.verifiers?.[0] === 'gacha-integration' && derivedGacha.verificationTarget === 'WorkProgress/demo' && proseGacha === null,
  'verifier plans derive from structured host operations, never model-authored command prose');
check(throws(() => deriveVerifierPlanFromOperations({
  projectRoot: process.cwd(), phase: 8, allowedVerifiers: ['gacha-integration', 'inline-strings'],
  operations: [
    { tool: 'forge_script', script: 'scripts/check-gacha-integration.mjs', args: ['WorkProgress/demo-a'], exitCode: 0 },
    { tool: 'forge_script', script: 'scripts/check-inline-strings.mjs', args: ['WorkProgress/demo-b'], exitCode: 0 },
  ],
})), 'conflicting verifier targets are rejected instead of silently dropping earlier checks');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-task-verifier-'));
const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-task-verifier-outside-'));
try {
  fs.mkdirSync(path.join(tmp, '.git', 'info'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
  const scripts = path.join(tmp, 'scripts');
  const registryPath = path.join(tmp, 'mcp-server', 'verifiers.json');
  fs.mkdirSync(scripts, { recursive: true });

  write(tmp, 'scripts/check-fixture-pass.mjs', "console.log(JSON.stringify({ok:true,issues:[]}));\n");
  write(tmp, 'scripts/check-fixture-flaky.mjs', `
import fs from 'node:fs'; import path from 'node:path';
const target=process.argv.find((value,index)=>index>1&&!value.startsWith('--'))||'.';
if(fs.existsSync(path.join(target,'pass.flag'))) console.log(JSON.stringify({ok:true,issues:[]}));
else { console.log(JSON.stringify({ok:false,violations:[{file:'src/demo.js',line:7,rule:'FIXTURE_RULE',message:'fixture failure'}]})); process.exit(1); }
`);
  write(tmp, 'scripts/check-fixture-fail.mjs', "console.log(JSON.stringify({ok:false,issues:[{file:'src/retry.js',line:9,rule:'ALWAYS_FAIL',message:'still broken'}]})); process.exit(1);\n");
  write(tmp, 'scripts/check-fixture-env.mjs', "console.log(JSON.stringify({ok:false,error:'fixture dependency missing'})); process.exit(2);\n");
  write(tmp, 'scripts/check-fixture-timeout.mjs', "setTimeout(()=>{},5000);\n");
  for (const id of ['fixture-wrong-phase', 'fixture-engine', 'fixture-disabled']) {
    write(tmp, `scripts/check-${id}.mjs`, `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(path.join(tmp, `${id}.executed`))},'bad');\n`);
  }
  const registry = {
    schemaVersion: 1,
    verifiers: [
      registryEntry('fixture-pass'),
      registryEntry('fixture-flaky'),
      registryEntry('fixture-fail'),
      registryEntry('fixture-env'),
      registryEntry('fixture-timeout', { timeoutMs: 1000 }),
      registryEntry('fixture-wrong-phase', { phases: [8] }),
      registryEntry('fixture-engine', { scope: 'engine' }),
      registryEntry('fixture-disabled', { taskRunner: undefined }),
    ],
  };
  write(tmp, 'mcp-server/verifiers.json', JSON.stringify(registry, null, 2));

  const canonicalTask = createVerifyTask(tmp, 'task-verifier-canonical', ['inline-strings'], 5);
  const canonicalOutcome = runTaskVerifiers({ projectRoot: tmp, taskId: canonicalTask.task.id, registryPath: realRegistry.file });
  check(canonicalOutcome.exitCode === 0 && canonicalOutcome.result.checks.includes('inline-strings:passed'),
    'canonical engine verifier runs against an external Task project target');

  check(throws(() => loadTaskVerifierRegistry({ projectRoot: tmp, registryPath })),
    'an untrusted project-local registry is never executable by default');
  const loaded = loadTaskVerifierRegistry({ projectRoot: tmp, registryPath, allowUntrustedRegistry: true });
  check(loaded.byId.size === 8 && loaded.byId.get('fixture-pass')?.taskRunner?.json === true,
    'registry loader exposes only validated metadata and executable paths');

  const pass = createVerifyTask(tmp, 'task-verifier-pass', ['fixture-pass']);
  const passed = runTaskVerifiers({ projectRoot: tmp, taskId: pass.task.id, registryPath, allowUntrustedRegistry: true });
  check(passed.exitCode === 0 && passed.run.state.currentNode === 'done' && passed.run.task.status === 'completed'
    && passed.result.verification?.status === 'passed' && passed.result.checks.includes('fixture-pass:passed'),
  'registered verifier PASS completes the durable change graph');

  let flaky = createVerifyTask(tmp, 'task-verifier-flaky', ['fixture-flaky']);
  const failed = runTaskVerifiers({ projectRoot: tmp, taskId: flaky.task.id, registryPath, allowUntrustedRegistry: true });
  flaky = readTaskRun(tmp, flaky.task.id);
  check(failed.exitCode === 1 && flaky.state.currentNode === 'repair'
    && flaky.lastResult.failure?.type === 'VERIFIER_FAILURE'
    && flaky.lastResult.verification?.items?.[0]?.issues?.[0]?.file === 'src/demo.js'
    && flaky.lastResult.verification?.items?.[0]?.issues?.[0]?.line === 7,
  'verifier FAIL is normalized and routed to durable repair');
  flaky = repairComplete(tmp, flaky);
  fs.writeFileSync(path.join(tmp, 'pass.flag'), 'ok');
  const repaired = runTaskVerifiers({ projectRoot: tmp, taskId: flaky.task.id, registryPath, allowUntrustedRegistry: true });
  check(repaired.exitCode === 0 && repaired.run.state.currentNode === 'done'
    && repaired.run.state.attempts.repair === 1,
  'successful repair returns to verification and then completes');

  const envTask = createVerifyTask(tmp, 'task-verifier-environment', ['fixture-env']);
  const environment = runTaskVerifiers({ projectRoot: tmp, taskId: envTask.task.id, registryPath, allowUntrustedRegistry: true });
  check(environment.exitCode === 2 && environment.run.state.currentNode === 'blocked'
    && environment.result.status === 'environment_failure'
    && environment.result.stop?.owner === 'infrastructure',
  'exit code 2 becomes an explicit infrastructure blocker instead of agent repair');

  const timeoutTask = createVerifyTask(tmp, 'task-verifier-timeout', ['fixture-timeout']);
  const timeout = runTaskVerifiers({ projectRoot: tmp, taskId: timeoutTask.task.id, registryPath, allowUntrustedRegistry: true });
  check(timeout.exitCode === 2 && timeout.result.verification?.items?.[0]?.timedOut === true,
    'verifier timeout is bounded and classified as environment failure');

  fs.mkdirSync(path.join(outside, 'src'), { recursive: true });
  fs.symlinkSync(outside, path.join(tmp, 'escape-target'), process.platform === 'win32' ? 'junction' : 'dir');
  const escapedTargetTask = createVerifyTask(tmp, 'task-verifier-symlink-target', ['fixture-pass'], 3, 'escape-target');
  const escapedTarget = runTaskVerifiers({
    projectRoot: tmp, taskId: escapedTargetTask.task.id, registryPath, allowUntrustedRegistry: true,
  });
  check(escapedTarget.exitCode === 2 && escapedTarget.run.state.currentNode === 'blocked'
    && /symbolic link/.test(escapedTarget.result.message),
  'verification target cannot escape the project through a symlink or junction');

  for (const fixture of [
    ['task-verifier-unknown', ['fixture-unknown'], 'VERIFIER_PLAN_INVALID', null],
    ['task-verifier-wrong-phase', ['fixture-wrong-phase'], 'VERIFIER_PHASE_MISMATCH', 'fixture-wrong-phase.executed'],
    ['task-verifier-engine', ['fixture-engine'], 'VERIFIER_PLAN_INVALID', 'fixture-engine.executed'],
    ['task-verifier-disabled', ['fixture-disabled'], 'VERIFIER_PLAN_INVALID', 'fixture-disabled.executed'],
    ['task-verifier-empty', [], 'VERIFIER_PLAN_EMPTY', null],
  ]) {
    const [id, verifiers, code, sentinel] = fixture;
    const task = createVerifyTask(tmp, id, verifiers);
    const outcome = runTaskVerifiers({ projectRoot: tmp, taskId: task.task.id, registryPath, allowUntrustedRegistry: true });
    check(outcome.exitCode === 2 && outcome.result.code === code && outcome.run.state.currentNode === 'blocked'
      && (!sentinel || !fs.existsSync(path.join(tmp, sentinel))),
    `${id.replace('task-verifier-', '')} verifier plan is rejected before execution`);
  }

  const conflictTask = createVerifyTask(tmp, 'task-verifier-conflict', ['fixture-pass']);
  const verifyLock = `${taskRunPath(tmp, conflictTask.task.id)}.verify.lock`;
  fs.writeFileSync(verifyLock, 'held');
  let conflictCode = null;
  try { runTaskVerifiers({ projectRoot: tmp, taskId: conflictTask.task.id, registryPath, allowUntrustedRegistry: true }); }
  catch (error) { conflictCode = error.code; }
  fs.unlinkSync(verifyLock);
  check(conflictCode === 'TASK_VERIFY_CONFLICT' && readTaskRun(tmp, conflictTask.task.id).state.currentNode === 'verify',
    'concurrent verifier execution is rejected without changing Task state');

  const staleTask = createVerifyTask(tmp, 'task-verifier-stale-lock', ['fixture-pass']);
  const staleLock = `${taskRunPath(tmp, staleTask.task.id)}.verify.lock`;
  fs.writeFileSync(staleLock, JSON.stringify({ token: 'abandoned', pid: 1 }));
  const staleDate = new Date(Date.now() - 3 * 60 * 60 * 1000);
  fs.utimesSync(staleLock, staleDate, staleDate);
  let staleCode = null;
  try { runTaskVerifiers({ projectRoot: tmp, taskId: staleTask.task.id, registryPath, allowUntrustedRegistry: true }); }
  catch (error) { staleCode = error.code; }
  check(staleCode === 'TASK_VERIFY_STALE_LOCK' && fs.existsSync(staleLock)
    && readTaskRun(tmp, staleTask.task.id).state.currentNode === 'verify',
  'a stale lock blocks safely instead of risking a non-atomic takeover');
  fs.unlinkSync(staleLock);

  const ownershipTask = createVerifyTask(tmp, 'task-verifier-lock-ownership', ['fixture-pass']);
  const ownershipLock = `${taskRunPath(tmp, ownershipTask.task.id)}.verify.lock`;
  const ownership = runTaskVerifiers({
    projectRoot: tmp, taskId: ownershipTask.task.id, registryPath, allowUntrustedRegistry: true,
    spawn: () => {
      fs.writeFileSync(ownershipLock, JSON.stringify({ token: 'replacement-owner', pid: 2 }));
      return { status: 0, stdout: JSON.stringify({ ok: true, issues: [] }), stderr: '', error: null };
    },
  });
  check(ownership.exitCode === 0 && fs.existsSync(ownershipLock)
    && JSON.parse(fs.readFileSync(ownershipLock, 'utf8')).token === 'replacement-owner',
  'verifier release never removes a lock it no longer owns');
  fs.unlinkSync(ownershipLock);

  let exhausted = createVerifyTask(tmp, 'task-verifier-exhausted', ['fixture-fail']);
  for (let attempt = 0; attempt < 4 && exhausted.state.currentNode !== 'blocked'; attempt++) {
    const outcome = runTaskVerifiers({ projectRoot: tmp, taskId: exhausted.task.id, registryPath, allowUntrustedRegistry: true });
    exhausted = outcome.run;
    if (exhausted.state.currentNode === 'repair') exhausted = repairComplete(tmp, exhausted);
  }
  exhausted = readTaskRun(tmp, exhausted.task.id);
  check(exhausted.state.currentNode === 'blocked' && exhausted.state.attempts.repair === 4
    && exhausted.events.at(-1)?.event === 'attempt_budget_exhausted',
  'repeated verifier failures exhaust the shared three-attempt repair budget');

  const cliTask = createVerifyTask(tmp, 'task-verifier-cli', ['fixture-pass']);
  const cliOutput = [];
  let cliExit = null;
  const cli = runWorkflowCli([
    'verify', '--project', tmp, '--task', cliTask.task.id, '--registry', registryPath,
  ], {
    cwd: tmp, stdout: value => cliOutput.push(String(value)), setExitCode: code => { cliExit = code; },
    allowUntrustedRegistry: true,
  });
  check(cliExit === 0 && cli.run.state.currentNode === 'done' && /verification passed/.test(cliOutput.join('\n')),
    'forge-workflow verify drives the same registry-backed runtime');

  const autoTask = makeTask({
    id: 'task-verifier-auto-dispatch', mode: 'change', phase: 3, goal: 'Auto-dispatch fixture verification',
    scope: { read: ['**'], write: ['src/**'] },
    acceptance: [{ id: 'AC-1', text: 'Automatic registered verification passes', status: 'pending' }],
    verifiers: ['fixture-pass'], verificationTarget: '.',
  });
  startTaskRun({ projectRoot: tmp, task: autoTask });
  const autoOutput = [];
  let autoExit = null;
  const autoRun = runWorkflowCli([
    'result', '--project', tmp, '--task', autoTask.id,
    '--status', 'completed', '--code', 'FIXTURE_IMPLEMENTED', '--message', 'Implementation complete',
    '--registry', registryPath,
  ], {
    cwd: tmp, stdout: value => autoOutput.push(String(value)), setExitCode: code => { autoExit = code; },
    allowUntrustedRegistry: true,
  });
  check(autoExit === 0 && autoRun.state.currentNode === 'done' && autoRun.lastResult?.code === 'VERIFIERS_PASSED'
    && autoRun.events.some(event => event.code === 'FIXTURE_IMPLEMENTED'),
  'workflow result automatically dispatches the verifier node without a second operator command');

  const manualReleaseTask = makeTask({
    id: 'task-verifier-empty-release-plan', mode: 'release', phase: 8, goal: 'Prepare manual release verification',
    scope: { read: ['**'], write: ['Release/**'] }, acceptance: [], verifiers: [],
  });
  startTaskRun({ projectRoot: tmp, task: manualReleaseTask });
  let manualReleaseExit = null;
  const manualReleaseRun = runWorkflowCli([
    'result', '--project', tmp, '--task', manualReleaseTask.id,
    '--status', 'completed', '--code', 'RELEASE_PREPARED', '--message', 'Release preparation complete',
  ], { cwd: tmp, stdout: () => {}, setExitCode: code => { manualReleaseExit = code; } });
  check(manualReleaseExit === null && manualReleaseRun.state.currentNode === 'verify'
    && manualReleaseRun.task.status === 'running',
  'an empty legacy release verifier plan remains at host-owned verify instead of becoming blocked');

  const unsafeRegistry = {
    schemaVersion: 1,
    verifiers: [registryEntry('fixture-pass', { mutates: true })],
  };
  const unsafePath = write(tmp, 'mcp-server/unsafe-verifiers.json', JSON.stringify(unsafeRegistry));
  check(throws(() => loadTaskVerifierRegistry({ projectRoot: tmp, registryPath: unsafePath, allowUntrustedRegistry: true })),
    'mutating verifier metadata is rejected by the runner registry contract');

  const nestedReport = normalizeVerifierExecution({
    entry: registryEntry('fixture-pass'), durationMs: 4, projectRoot: tmp,
    result: { status: 1, stdout: 'progress banner\n' + JSON.stringify({ reports: [{ checks: [{ issues: [{ file: 'src/nested.js', line: 12, message: 'nested failure' }] }] }] }) + '\ndone' },
  });
  check(nestedReport.issues[0]?.file === 'src/nested.js' && nestedReport.issues[0]?.line === 12,
    'nested reports and mixed stdout JSON produce structured repair evidence');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\nFAIL: ${failures.length} Task verifier regression(s)`);
  process.exit(1);
}
console.log('\nPASS: registered deterministic verifiers drive durable verify/repair transitions');
