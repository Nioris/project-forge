#!/usr/bin/env node
/**
 * @file check-codex-compat.mjs
 * @description Verifies Project Forge's native Codex adapter without changing files.
 * @dependencies Node.js built-ins and scripts/sync-codex-adapter.mjs.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const errors = [];
const warnings = [];
const ok = [];
const fail = m => errors.push(m);
const warn = m => warnings.push(m);

function requireFile(rel) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) fail(`${rel} missing`);
  return p;
}

const pluginPath = requireFile('.claude-plugin/plugin.json');
const claudePath = requireFile('CLAUDE.md');
const agentsPath = requireFile('AGENTS.md');
const projectAgentsPath = requireFile('AGENTS.project.md');
requireFile('.codex/config.toml');
requireFile('.codex/config.project.toml');
const hooksPath = requireFile('.codex/hooks.json');
requireFile('.agents/README.md');

if (pluginPath && claudePath) {
  const version = JSON.parse(readFileSync(pluginPath, 'utf8')).version;
  const first = readFileSync(claudePath, 'utf8').split(/\r?\n/, 1)[0];
  if (!first.includes(`v${version}`)) fail(`CLAUDE.md top version does not match plugin version ${version}`);
  else ok.push(`CLAUDE.md top version matches ${version}`);
}

if (agentsPath && claudePath) {
  const expected = createHash('sha256').update(readFileSync(claudePath, 'utf8')).digest('hex').slice(0, 16);
  for (const [label, p] of [['AGENTS.md', agentsPath], ['AGENTS.project.md', projectAgentsPath]]) {
    if (!p) continue;
    const bytes = statSync(p).size;
    if (bytes >= 32768) fail(`${label} is ${bytes} bytes; keep it below Codex default 32768-byte project-doc budget`);
    else ok.push(`${label} ${bytes} bytes (< 32768)`);
    const marker = readFileSync(p, 'utf8').match(/claude-hash:([0-9a-f]{16})/);
    if (!marker || marker[1] !== expected) fail(`${label} stale vs CLAUDE.md; run node scripts/generate-agents-md.mjs`);
    else ok.push(`${label} hash matches CLAUDE.md`);
  }
}

if (hooksPath) {
  try {
    const hooks = JSON.parse(readFileSync(hooksPath, 'utf8'));
    const events = hooks.hooks || {};
    for (const required of ['SessionStart', 'PreToolUse', 'PostToolUse', 'Stop']) {
      if (!events[required]) fail(`.codex/hooks.json missing ${required}`);
    }
    const commandHooks = Object.values(events).flatMap(groups => groups || []).flatMap(group => group.hooks || []);
    for (const hook of commandHooks) {
      if (hook.type !== 'command') continue;
      if (!hook.commandWindows) {
        fail(`Codex hook missing commandWindows override: ${hook.command || '<unnamed>'}`);
        continue;
      }
      if (/(?:node|python\d*)\s+\.?\.?[\/]/.test(hook.command || '')) {
        fail(`Codex hook uses cwd-relative POSIX command instead of repo-root resolution: ${hook.command}`);
      }
      // Windows Codex already invokes commandWindows through its Windows shell runner.
      // Nesting `powershell -Command "$root=..."` here is unsafe: the outer PowerShell
      // expands $root/$null before the inner process starts, producing exit code 1.
      if (/\b(?:powershell|pwsh)\b/i.test(hook.commandWindows)) {
        fail(`Codex Windows hook nests PowerShell; use a direct node launcher: ${hook.commandWindows}`);
      }
      const win = hook.commandWindows.match(/^node\s+["'](\.\\(?:\.claude|\.codex)\\hooks\\[^"']+\.mjs)["']$/i);
      if (!win) {
        fail(`Codex Windows hook is not a direct workspace-root node launcher: ${hook.commandWindows}`);
      } else {
        const rel = win[1].replace(/^\.\\/, '').replace(/\\/g, '/');
        if (!existsSync(join(ROOT, rel))) fail(`Codex Windows hook target missing: ${rel}`);
      }
    }
    ok.push(`.codex/hooks.json parses; ${commandHooks.length} command hooks use direct Windows node launchers`);
  } catch (e) { fail(`.codex/hooks.json invalid JSON: ${e.message}`); }
}

const sync = spawnSync(process.execPath, ['scripts/sync-codex-adapter.mjs', '--check', '--quiet'], {
  cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
});
if (sync.status !== 0) fail((sync.stderr || sync.stdout || 'Codex adapter drift').trim());
else ok.push('.agents/skills and .codex/agents match canonical Claude sources');

const claudeAgents = existsSync(join(ROOT, '.claude/agents'))
  ? readdirSync(join(ROOT, '.claude/agents')).filter(f => f.endsWith('.md')).length : 0;
const codexAgents = existsSync(join(ROOT, '.codex/agents'))
  ? readdirSync(join(ROOT, '.codex/agents')).filter(f => f.endsWith('.toml')).length : 0;
if (claudeAgents !== codexAgents) fail(`custom-agent count mismatch: Claude ${claudeAgents}, Codex ${codexAgents}`);
else ok.push(`${codexAgents} native Codex custom agents generated`);

const policyPath = requireFile('.claude/skills/status/references/model-policy.json');
if (policyPath) {
  try {
    const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
    const expectedModel = policy.defaultSubagent?.model;
    const unpinned = readdirSync(join(ROOT, '.codex/agents')).filter(f => f.endsWith('.toml')).filter(f => {
      const text = readFileSync(join(ROOT, '.codex/agents', f), 'utf8');
      return !text.split(/\r?\n/).includes(`model = ${JSON.stringify(expectedModel)}`);
    });
    if (!expectedModel) fail('model policy does not define defaultSubagent.model');
    else if (unpinned.length) fail(`Codex custom agents are not pinned to ${expectedModel}: ${unpinned.join(', ')}`);
    else ok.push(`all Codex custom agents pinned to economy model ${expectedModel}`);
  } catch (e) { fail(`model policy invalid: ${e.message}`); }
}

const claudeSkillNames = existsSync(join(ROOT, '.claude/skills'))
  ? new Set(readdirSync(join(ROOT, '.claude/skills'), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)) : new Set();
const codexSkillNames = existsSync(join(ROOT, '.agents/skills'))
  ? new Set(readdirSync(join(ROOT, '.agents/skills'), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)) : new Set();
const commandNames = existsSync(join(ROOT, '.claude/commands'))
  ? readdirSync(join(ROOT, '.claude/commands')).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/i, '')) : [];
const expectedRouters = commandNames.filter(name => !claudeSkillNames.has(name)).sort();
for (const name of claudeSkillNames) if (!codexSkillNames.has(name)) fail(`Codex skill mirror missing canonical skill: ${name}`);
for (const name of expectedRouters) if (!codexSkillNames.has(name)) fail(`Codex generated router skill missing: ${name}`);
const unexpected = [...codexSkillNames].filter(name => !claudeSkillNames.has(name) && !expectedRouters.includes(name));
if (unexpected.length) fail(`unexpected generated Codex skills: ${unexpected.join(', ')}`);
else ok.push(`${claudeSkillNames.size} canonical skills + ${expectedRouters.length} command routers = ${codexSkillNames.size} Codex-discoverable skills`);


// Keep generated discovery descriptions lean: Codex loads skill metadata into a bounded context slice.
let longDescriptions = [];
let descriptionChars = 0;
for (const dir of codexSkillNames) {
  const p = join(ROOT, '.agents/skills', dir, 'SKILL.md');
  if (!existsSync(p)) continue;
  const t = readFileSync(p, 'utf8');
  const m = t.match(/^description:\s*['"]?(.+?)['"]?\s*$/m);
  if (!m) continue;
  const d = m[1].replace(/\\"/g,'"');
  descriptionChars += d.length;
  if (d.length > 220) longDescriptions.push(`${dir}:${d.length}`);
}
if (longDescriptions.length) fail(`generated Codex skill descriptions over 220 chars: ${longDescriptions.slice(0,8).join(', ')}`);
else ok.push(`Codex skill discovery descriptions compact (${descriptionChars} total chars, <=220 each)`);


// Generated Codex skills must not retain known Forge /skill syntax. Paths and Codex built-ins are allowed.
let codexKnownSlashRefs = 0;
const knownSkillPattern = /(^|[^A-Za-z0-9._/\\-])\/([a-z0-9][a-z0-9-]*)(?=$|[^A-Za-z0-9_/\\-])/gim;
for (const dir of codexSkillNames) {
  const p = join(ROOT, '.agents/skills', dir, 'SKILL.md');
  if (!existsSync(p)) continue;
  const t = readFileSync(p, 'utf8');
  let m;
  while ((m = knownSkillPattern.exec(t))) if (codexSkillNames.has(m[2])) codexKnownSlashRefs++;
}
if (codexKnownSlashRefs) fail(`${codexKnownSlashRefs} generated Codex references still use Claude /skill syntax`);
else ok.push('generated Codex skills use native $skill syntax for known Forge workflows');

for (const collision of ['status','plan','review']) {
  if (!codexSkillNames.has(collision)) fail(`Codex Forge skill missing: $${collision}`);
}

// Canonical sources can contain Claude syntax; the generated mirror must normalize key cases.
let slashRefs = 0, argsRefs = 0, claudeOnlyUi = 0;
for (const dir of readdirSync(join(ROOT, '.claude/skills'), { withFileTypes: true }).filter(e => e.isDirectory())) {
  const p = join(ROOT, '.claude/skills', dir.name, 'SKILL.md');
  if (!existsSync(p)) continue;
  const t = readFileSync(p, 'utf8');
  if (/`\/[a-z0-9][a-z0-9-]+`/i.test(t)) slashRefs++;
  if (/\$ARGUMENTS\b/.test(t)) argsRefs++;
  if (/\bask_user_input\b/.test(t)) claudeOnlyUi++;
}
let codexArgsRefs = 0;
for (const dir of codexSkillNames) {
  const p = join(ROOT, '.agents/skills', dir, 'SKILL.md');
  if (existsSync(p) && /\$ARGUMENTS\b/.test(readFileSync(p, 'utf8'))) codexArgsRefs++;
}
if (codexArgsRefs) fail(`${codexArgsRefs} generated Codex skills still contain Claude $ARGUMENTS placeholders`);
else ok.push(`Claude $ARGUMENTS syntax normalized in Codex mirror (${argsRefs} canonical skill(s) adapted)`);
if (slashRefs || claudeOnlyUi) {
  warn(`some Claude-oriented syntax remains in canonical skills (backticked slash refs in ${slashRefs} skill(s), ask_user_input in ${claudeOnlyUi}); generated Codex skills translate known skill references and AGENTS.md defines fallback semantics`);
}

console.log('\nForge Codex compatibility audit\n' + '─'.repeat(44));
for (const line of ok) console.log(`  ✓ ${line}`);
for (const line of warnings) console.log(`  ⚠ ${line}`);
for (const line of errors) console.log(`  ✗ ${line}`);
console.log(`\n${errors.length ? `FAILED: ${errors.length} error(s)` : 'PASS: native Codex adapter is consistent'}${warnings.length ? `, ${warnings.length} warning(s)` : ''}`);
process.exit(errors.length ? 1 : 0);
