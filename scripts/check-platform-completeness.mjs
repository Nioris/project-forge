#!/usr/bin/env node
/**
 * @file check-platform-completeness.mjs
 * @description Audits the installed storefront registry separately from old
 *              OK/MAX/Web compatibility adapters.
 *
 * A storefront is complete only to the level declared by its registry profile:
 * planned and partial adapters are reported honestly, not converted into a
 * false pass. Use --strict when an implemented adapter is required.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listPlatformProfiles, loadPlatformRegistry, PlatformProfileError } from './platform-profile.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const LEGACY_ADAPTERS = ['ok', 'max', 'web'];

function exists(relative) { return fs.existsSync(path.join(ROOT, relative)); }
function hasFiles(relative) {
  const full = path.join(ROOT, relative);
  return exists(relative) && fs.readdirSync(full, { withFileTypes: true }).some(entry => !entry.name.startsWith('.'));
}
function contains(relative, needle) {
  try { return fs.readFileSync(path.join(ROOT, relative), 'utf8').includes(needle); }
  catch { return false; }
}
function schemaTargets() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas', 'forge-targets.schema.json'), 'utf8')).properties.targets.items.enum; }
  catch { return null; }
}

function targetChecks(profile, targetIds) {
  const id = profile.id;
  const hasReleaseVerifier = exists('scripts/platform-release-verify.mjs');
  return [
    { id: 'registry-profile', status: 'passed', message: `${profile.displayName}: ${profile.artifactFamily}/${profile.artifactFormat}` },
    { id: 'target-schema-enum', status: schemaTargets()?.includes(id) ? 'passed' : 'failed', message: 'forge-targets schema must include the registered id' },
    { id: 'dashboard-target-option', status: contains('dashboard.html', `id:'${id}'`) ? 'passed' : 'failed', message: 'dashboard must expose the registered target' },
    { id: 'dashboard-target-selection', status: contains('dashboard.html', 'FORGE_TARGET_PLATFORMS') && contains('dashboard.html', `'${id}'`) ? 'passed' : 'failed', message: 'dashboard must preserve target selection into forge.targets.json' },
    { id: 'release-contract-verifier', status: hasReleaseVerifier ? 'passed' : 'failed', message: 'all target profiles use the same receipt verifier' },
    {
      id: 'adapter-maturity',
      status: profile.adapterStatus === 'implemented' ? 'passed' : profile.adapterStatus,
      message: profile.adapterStatus === 'implemented'
        ? 'adapter declared implemented'
        : `adapter intentionally declared ${profile.adapterStatus}; local/submit evidence remains required`,
    },
    { id: 'registry-order', status: targetIds.includes(id) ? 'passed' : 'failed', message: 'profile must be enumerated by the authoritative registry' },
  ];
}

const LEGACY_CHECKS = [
  { id: 'platform README', fn: p => exists(`platforms/${p}/README.md`) },
  { id: 'historical pre-submit gate', fn: p => exists(`platforms/${p}/scripts/pre-submit.mjs`) },
  { id: 'validators', fn: p => hasFiles(`platforms/${p}/validators`) },
  { id: 'release skill', fn: p => exists(`.claude/skills/release-${p}/SKILL.md`) },
];
const LEGACY_EXEMPTIONS = {
  // The generic Web adapter is intentionally a light compatibility surface;
  // it has no standalone pre-submit/validator pair. A storefront Web export
  // is now checked through its selected target profile instead.
  web: new Set(['historical pre-submit gate', 'validators']),
};

function legacyChecks(id) {
  return LEGACY_CHECKS.map(check => ({
    id: check.id,
    status: check.fn(id) ? 'passed' : LEGACY_EXEMPTIONS[id]?.has(check.id) ? 'exempt' : 'failed',
    message: LEGACY_EXEMPTIONS[id]?.has(check.id)
      ? 'accepted legacy gap; selected Web storefronts use the target release contract'
      : 'legacy compatibility surface; not a selectable storefront target',
  }));
}

function parseArgs(argv) {
  const options = { json: false, strict: false, targets: [] };
  for (const arg of argv) {
    if (arg === '--json') options.json = true;
    else if (arg === '--strict') options.strict = true;
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else options.targets.push(arg);
  }
  return options;
}

function audit(options) {
  const registry = loadPlatformRegistry();
  const profiles = listPlatformProfiles({ registry }).profiles;
  const supported = new Set([...profiles.map(profile => profile.id), ...LEGACY_ADAPTERS]);
  const selected = options.targets.length ? options.targets : [...profiles.map(profile => profile.id), ...LEGACY_ADAPTERS];
  const unknown = selected.filter(id => !supported.has(id));
  if (unknown.length) throw new Error(`Unknown platform: ${unknown.join(', ')}. Storefront targets: ${profiles.map(p => p.id).join(', ')}. Legacy adapters: ${LEGACY_ADAPTERS.join(', ')}.`);
  const targetIds = profiles.map(profile => profile.id);
  const entries = selected.map(id => {
    const profile = profiles.find(item => item.id === id);
    return profile
      ? { id, kind: 'storefront-target', tier: profile.tier, adapterStatus: profile.adapterStatus, checks: targetChecks(profile, targetIds) }
      : { id, kind: 'legacy-adapter', adapterStatus: 'legacy', checks: legacyChecks(id) };
  });
  const failures = entries.flatMap(entry => entry.checks
    .filter(check => check.status === 'failed' || (options.strict && ['partial', 'planned'].includes(check.status)))
    .map(check => ({ platform: entry.id, check: check.id, status: check.status, message: check.message })));
  return { ok: failures.length === 0, strict: options.strict, entries, failures, registryTargets: targetIds, legacyAdapters: LEGACY_ADAPTERS };
}

function print(result) {
  console.log('Storefront registry audit');
  for (const entry of result.entries) {
    const label = entry.kind === 'legacy-adapter' ? 'legacy adapter' : `${entry.tier} storefront`;
    console.log(`\n${entry.id} (${label}; ${entry.adapterStatus})`);
    for (const check of entry.checks) console.log(`  [${check.status.toUpperCase()}] ${check.id} — ${check.message}`);
  }
  console.log(`\n${result.ok ? 'PASS' : 'DRIFT'}: ${result.failures.length} blocking issue(s). ${result.strict ? 'Strict mode treats planned/partial adapters as blockers.' : 'Planned/partial adapters are reported, not passed.'}`);
}

function main() {
  let options;
  try { options = parseArgs(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 2; return; }
  try {
    const result = audit(options);
    if (options.json) console.log(JSON.stringify(result, null, 2)); else print(result);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    const code = error instanceof PlatformProfileError ? error.code : 'PLATFORM_COMPLETENESS_USAGE';
    if (options.json) console.log(JSON.stringify({ ok: false, code, message: error.message }, null, 2));
    else console.error(`[${code}] ${error.message}`);
    process.exitCode = 2;
  }
}

main();
