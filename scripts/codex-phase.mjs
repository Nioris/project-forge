#!/usr/bin/env node
/**
 * Launch one Project Forge phase in a fresh Codex task using the canonical quality-first model policy.
 * This is intentionally a launcher: prose inside an existing task cannot enforce a primary-model switch.
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCodexLauncher } from './codex-pipeline.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '..');
const POLICY_PATH = join(ROOT, '.claude', 'skills', 'status', 'references', 'model-policy.json');

function usage(code = 2) {
  console.error('Usage: node scripts/codex-phase.mjs <1..9> [--route <id>] [--cwd <project>] [--dry-run]');
  process.exit(code);
}

function option(name) {
  const eq = process.argv.find(x => x.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : null;
}

const phase = Number(process.argv[2]);
if (!Number.isInteger(phase) || phase < 1 || phase > 9) usage();
const policy = JSON.parse(readFileSync(POLICY_PATH, 'utf8'));
const phasePolicy = policy.phases?.[String(phase)];
if (!phasePolicy) throw new Error(`Phase ${phase} is missing from ${POLICY_PATH}`);

const routeId = option('route');
const route = routeId ? phasePolicy.routes?.[routeId] : null;
if (routeId && !route) {
  const known = Object.keys(phasePolicy.routes || {});
  throw new Error(`Unknown Phase ${phase} route "${routeId}". Available: ${known.join(', ') || 'none'}`);
}

const selected = route || phasePolicy.base;
const cwdArg = option('cwd') || process.cwd();
const cwd = isAbsolute(cwdArg) ? resolve(cwdArg) : resolve(process.cwd(), cwdArg);
if (!existsSync(cwd)) throw new Error(`Project directory does not exist: ${cwd}`);

const invocation = `$${phasePolicy.skill}${phase === 1 ? ' .' : ''}`;
const codexArgs = [
  '-C', cwd,
  '-m', selected.model,
  '-c', `model_reasoning_effort=${JSON.stringify(selected.reasoning)}`,
  '-c', `service_tier=${JSON.stringify(policy.serviceTier)}`,
  invocation,
];
const env = {
  ...process.env,
  FORGE_AI_HOST: 'codex',
  FORGE_MODEL: selected.model,
  FORGE_REASONING_EFFORT: selected.reasoning,
  FORGE_SERVICE_TIER: policy.serviceTier,
  FORGE_MODEL_ROUTE: routeId || 'base',
  FORGE_MODEL_ENFORCED: '1',
  FORGE_MAX_PHASE_SUBAGENTS: String(Math.min(policy.limits.maxPhaseSubagents, phasePolicy.maxSubagents)),
};

console.log(`[Forge] Phase ${phase} -> ${phasePolicy.skill}`);
console.log(`[Forge] Codex ${selected.model} / ${selected.reasoning}; tier=${policy.serviceTier}; route=${routeId || 'base'}; maxSubagents=${env.FORGE_MAX_PHASE_SUBAGENTS}`);
console.log(`[Forge] cwd=${cwd}`);
if (process.argv.includes('--dry-run')) {
  console.log(`codex ${codexArgs.map(x => JSON.stringify(x)).join(' ')}`);
  process.exit(0);
}

const launcher = resolveCodexLauncher();
const result = spawnSync(launcher.command, [...launcher.prefixArgs, ...codexArgs], { cwd, env, stdio: 'inherit', shell: false });
if (result.error) {
  console.error(`[X] Could not launch Codex: ${result.error.message}`);
  console.error('    Set CODEX_CLI_PATH to the absolute codex.exe path, or run with --dry-run and copy the command.');
  process.exit(1);
}
process.exit(result.status ?? 1);
