#!/usr/bin/env node
/**
 * @file sync-codex-adapter.mjs
 * @description Generates the native Codex adapter from the canonical Claude/Forge layer.
 *              Claude files remain the source of truth; generated Codex files must never
 *              be edited by hand. Supports --check for CI/drift validation.
 * @dependencies Node.js built-ins only.
 */
import {
  cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '..');
const CHECK = process.argv.includes('--check');
const QUIET = process.argv.includes('--quiet');
const CLAUDE_SKILLS = join(ROOT, '.claude', 'skills');
const CLAUDE_COMMANDS = join(ROOT, '.claude', 'commands');
const CODEX_SKILLS = join(ROOT, '.agents', 'skills');
const CLAUDE_AGENTS = join(ROOT, '.claude', 'agents');
const CODEX_AGENTS = join(ROOT, '.codex', 'agents');
const MODEL_POLICY_PATH = join(CLAUDE_SKILLS, 'status', 'references', 'model-policy.json');
const MODEL_POLICY = JSON.parse(readFileSync(MODEL_POLICY_PATH, 'utf8'));
const DEFAULT_SUBAGENT_MODEL = MODEL_POLICY.defaultSubagent.model;

/** Return all regular files below a directory in stable relative-path order. */
function walkFiles(rootDir, current = rootDir, out = []) {
  if (!existsSync(current)) return out;
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const full = join(current, entry.name);
    if (entry.isDirectory()) walkFiles(rootDir, full, out);
    else if (entry.isFile()) out.push(relative(rootDir, full).replace(/\\/g, '/'));
  }
  return out.sort();
}

/** Parse the small YAML-like frontmatter used by Forge markdown files. */
function parseFrontmatter(md) {
  const match = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: md.trim() };
  const meta = {};
  const lines = match[1].split(/\r?\n/);
  let listKey = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (kv) {
      listKey = null;
      const [, key, value] = kv;
      if (value === '') {
        meta[key] = [];
        listKey = key;
      } else {
        meta[key] = value.replace(/^['"]|['"]$/g, '');
      }
      continue;
    }
    const item = line.match(/^\s*-\s*(.+)$/);
    if (item && listKey) meta[listKey].push(item[1].trim());
  }
  return { meta, body: match[2].trim() };
}


/** Compact only generated Codex skill descriptions to reduce the skills context budget.
 * Canonical Claude descriptions remain untouched and retain their rich trigger text.
 */
function compactCodexSkillDescription(md, max = 180) {
  return String(md).replace(/^description:\s*(.+)$/m, (line, raw) => {
    let text = String(raw).trim().replace(/^['"]|['"]$/g, '');
    text = text.replace(/\s+Triggers? on:[\s\S]*$/i, '').replace(/\s+/g, ' ').trim();
    if (text.length > max) {
      const cut = text.slice(0, max - 1);
      const boundary = cut.lastIndexOf(' ');
      text = (boundary > 80 ? cut.slice(0, boundary) : cut).replace(/[,:;\-\s]+$/,'') + '…';
    }
    return `description: ${JSON.stringify(text)}`;
  });
}

function canonicalSkillNames() {
  return new Set(readdirSync(CLAUDE_SKILLS, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name));
}

function routerCommandNames() {
  if (!existsSync(CLAUDE_COMMANDS)) return [];
  const canonical = canonicalSkillNames();
  return readdirSync(CLAUDE_COMMANDS).filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/i, ''))
    .filter(name => !canonical.has(name))
    .sort();
}

/** Translate only syntax that is host-specific while preserving Forge workflow semantics. */
function transformSkillMarkdown(md, availableNames) {
  const source = String(md);
  const hadArgumentsPlaceholder = /\$ARGUMENTS\b/.test(source);
  let out = source
    .replace(/`\$ARGUMENTS`/g, '`[INVOCATION_INPUT]`')
    .replace(/\$ARGUMENTS\b/g, '[INVOCATION_INPUT]')
    .replace(/If `?\[INVOCATION_INPUT\]`? provided/g, 'If `[INVOCATION_INPUT]` is provided');

  // Claude slash-skill references become explicit Codex $skill mentions when the target
  // exists in the generated Codex catalog. Unknown slash commands are left intact so Codex
  // built-ins such as /goal, /plan, /review and /status keep their native meaning.
  out = out.replace(/`\/([a-z0-9][a-z0-9-]*)([^`]*)`/gi, (full, name, rest) => {
    return availableNames.has(name) ? `\`$${name}${rest}\`` : full;
  });
  for (const name of [...availableNames].sort((a, b) => b.length - a.length)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^A-Za-z0-9._/\\-])/${escaped}(?=$|[^A-Za-z0-9_/\\-])`, 'gm');
    out = out.replace(re, (full, prefix) => `${prefix}$${name}`);
  }
  if (hadArgumentsPlaceholder) {
    const note = '> Codex adapter: `[INVOCATION_INPUT]` means the actual user text/arguments supplied with this skill invocation; substitute that value wherever the placeholder appears.';
    const fm = out.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
    out = fm ? out.slice(0, fm[0].length) + `\n${note}\n` + out.slice(fm[0].length) : `${note}\n\n${out}`;
  }
  return out;
}

/** Generate a Codex skill wrapper for a Claude smart-router command lacking a canonical skill. */
function renderRouterSkill(name, availableNames) {
  const source = readFileSync(join(CLAUDE_COMMANDS, `${name}.md`), 'utf8');
  const { meta, body } = parseFrontmatter(source);
  let description = String(meta.description || `Project Forge ${name} smart router`).trim();
  description = description.replace(/\s+Triggers? on:[\s\S]*$/i, '').replace(/\s+/g, ' ').trim();
  if (description.length > 180) description = description.slice(0, 179).replace(/[,:;\-\s]+$/,'') + '…';
  const adapted = transformSkillMarkdown(body, availableNames);
  return `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\n` +
    `> Codex adapter: generated from \`.claude/commands/${name}.md\`. ` +
    `Use the current user request as invocation arguments. Do not edit this generated skill directly.\n\n${adapted}\n`;
}

/** Return every expected file in .agents/skills, including adapted SKILL.md files and routers. */
function expectedCodexSkillFiles() {
  const files = new Map();
  const names = canonicalSkillNames();
  const routers = routerCommandNames();
  for (const r of routers) names.add(r);

  for (const rel of walkFiles(CLAUDE_SKILLS)) {
    const source = readFileSync(join(CLAUDE_SKILLS, rel));
    files.set(rel, rel.endsWith('/SKILL.md') || rel === 'SKILL.md'
      ? Buffer.from(compactCodexSkillDescription(transformSkillMarkdown(source.toString('utf8'), names)), 'utf8')
      : source);
  }
  for (const name of routers) files.set(`${name}/SKILL.md`, Buffer.from(renderRouterSkill(name, names), 'utf8'));
  return files;
}

/** Convert Claude tool metadata to the closest safe Codex sandbox default. */
function chooseSandbox(meta) {
  const tools = Array.isArray(meta.tools) ? meta.tools.join(',') : String(meta.tools || '');
  return /\b(Write|Edit|MultiEdit)\b/i.test(tools) ? 'workspace-write' : 'read-only';
}

/** Give review/security roles more reasoning while the quality policy pins the model family. */
function chooseEffort(name, description) {
  const text = `${name} ${description}`.toLowerCase();
  return /(security|review|audit|qa|tester|architecture)/.test(text) ? 'high' : 'medium';
}

/** Render one native Codex custom-agent TOML file. */
function renderCodexAgent(fileName) {
  const source = readFileSync(join(CLAUDE_AGENTS, fileName), 'utf8');
  const { meta, body } = parseFrontmatter(source);
  const fallbackName = fileName.replace(/\.md$/i, '');
  const name = String(meta.name || fallbackName).trim();
  const description = String(meta.description || `Forge role generated from .claude/agents/${fileName}`).trim();
  const sandbox = chooseSandbox(meta);
  const effort = chooseEffort(name, description);
  const sourceHash = createHash('sha256').update(source).digest('hex').slice(0, 16);
  const prefix = [
    'This file is generated from Project Forge Claude agent instructions.',
    `Canonical source: .claude/agents/${fileName}.`,
    'Do not edit this TOML directly; run node scripts/sync-codex-adapter.mjs in the Forge engine.',
    'Treat references to CLAUDE.md or .claude/skills as Forge source-of-truth references; Codex-native skills are available under .agents/skills.',
    'Translate Claude-only orchestration syntax instead of assuming those tools exist: `/skill` means invoke the matching Forge skill (Codex form: `$skill`); TaskCreate/TaskUpdate/team-message instructions mean use Codex native subagents, task tracking, or report the result to the parent agent.',
    `Ignore Claude model aliases such as sonnet/opus/haiku when choosing a Codex model. This generated agent is pinned by Forge quality policy to ${DEFAULT_SUBAGENT_MODEL}; only an explicit documented phase route may change reasoning effort.`,
    '',
  ].join('\n');

  return [
    '# GENERATED FILE — Project Forge Codex adapter',
    `# source-hash: ${sourceHash}`,
    `name = ${JSON.stringify(name)}`,
    `description = ${JSON.stringify(description)}`,
    `model = ${JSON.stringify(DEFAULT_SUBAGENT_MODEL)}`,
    `model_reasoning_effort = ${JSON.stringify(effort)}`,
    `sandbox_mode = ${JSON.stringify(sandbox)}`,
    `developer_instructions = ${JSON.stringify(prefix + body)}`,
    '',
  ].join('\n');
}

/** Return the generated custom-agent map without touching disk. */
function generatedAgents() {
  const result = new Map();
  if (!existsSync(CLAUDE_AGENTS)) return result;
  for (const file of readdirSync(CLAUDE_AGENTS).filter(f => f.endsWith('.md')).sort()) {
    result.set(file.replace(/\.md$/i, '.toml'), renderCodexAgent(file));
  }
  return result;
}

function compareExpectedTree(dir, expected, label) {
  const problems = [];
  if (!existsSync(dir)) return [`${label} is missing`];
  const actual = new Set(walkFiles(dir));
  for (const [rel, content] of expected) {
    actual.delete(rel);
    const p = join(dir, rel);
    if (!existsSync(p) || !readFileSync(p).equals(content)) problems.push(`${label}/${rel} is stale`);
  }
  for (const extra of actual) problems.push(`${label}/${extra} has no canonical/generated source`);
  return problems;
}

/** Verify generated skills and agents without mutating the repository. */
function check() {
  const problems = compareExpectedTree(CODEX_SKILLS, expectedCodexSkillFiles(), '.agents/skills');
  const expectedAgents = generatedAgents();
  if (!existsSync(CODEX_AGENTS)) problems.push('.codex/agents is missing');
  else {
    const actual = new Set(readdirSync(CODEX_AGENTS).filter(f => f.endsWith('.toml')));
    for (const [file, content] of expectedAgents) {
      actual.delete(file);
      const p = join(CODEX_AGENTS, file);
      if (!existsSync(p) || readFileSync(p, 'utf8') !== content) problems.push(`.codex/agents/${file} is stale`);
    }
    for (const extra of actual) problems.push(`.codex/agents/${extra} has no Claude source`);
  }

  if (problems.length) {
    console.error('[X] Codex adapter drift:');
    for (const p of problems.slice(0, 40)) console.error(`  - ${p}`);
    if (problems.length > 40) console.error(`  - ...and ${problems.length - 40} more`);
    console.error('Fix: node scripts/sync-codex-adapter.mjs');
    process.exit(1);
  }
  if (!QUIET) console.log('[OK] Codex adapter is in sync with canonical Claude sources.');
}

/** Regenerate the Codex skill mirror/router layer and custom-agent files. */
function sync() {
  if (!existsSync(CLAUDE_SKILLS)) throw new Error('.claude/skills is missing');
  mkdirSync(join(ROOT, '.agents'), { recursive: true });
  rmSync(CODEX_SKILLS, { recursive: true, force: true });
  mkdirSync(CODEX_SKILLS, { recursive: true });
  const skills = expectedCodexSkillFiles();
  for (const [rel, content] of skills) {
    const dest = join(CODEX_SKILLS, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, content);
  }

  mkdirSync(join(ROOT, '.codex'), { recursive: true });
  rmSync(CODEX_AGENTS, { recursive: true, force: true });
  mkdirSync(CODEX_AGENTS, { recursive: true });
  const agents = generatedAgents();
  for (const [file, content] of agents) writeFileSync(join(CODEX_AGENTS, file), content, 'utf8');

  if (!QUIET) {
    const skillDirs = readdirSync(CODEX_SKILLS, { withFileTypes: true }).filter(e => e.isDirectory()).length;
    console.log(`[OK] Codex adapter synced: ${skillDirs} discoverable skills (${routerCommandNames().length} generated routers), ${agents.size} custom agents.`);
  }
}

if (CHECK) check(); else sync();
