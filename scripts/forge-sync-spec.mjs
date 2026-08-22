#!/usr/bin/env node
/**
 * Shared sync specification for Project Forge sibling projects.
 * Keep the runtime payload in one place so sync + verification cannot drift.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export const MANAGED_MANIFEST = '.forge-managed.json';

export const PAYLOAD = [
  ['.claude/skills', '.claude/skills'],
  ['.claude/agents', '.claude/agents'],
  ['.claude/hooks', '.claude/hooks'],
  ['.claude/settings.json', '.claude/settings.json'],
  ['.claude/commands', '.claude/commands'],
  ['.agents/skills', '.agents/skills'],
  ['.agents/README.md', '.agents/README.md'],
  ['.codex/agents', '.codex/agents'],
  ['.codex/hooks', '.codex/hooks'],
  ['.codex/hooks.json', '.codex/hooks.json'],
  ['.codex/config.project.toml', '.codex/config.toml'],
  ['AGENTS.project.md', 'AGENTS.md'],
  ['FORGE.project.md', 'FORGE.md'],
  ['GEMINI.md', 'GEMINI.md'],
  ['QWEN.md', 'QWEN.md'],
  ['.gitverse/pr_rules', '.gitverse/pr_rules'],
  ['adapters/opencode/tools', '.opencode/tools'],
  ['СПРАВОЧНИК-КОМАНД.md', 'СПРАВОЧНИК-КОМАНД.md'],
  ['platforms/yandex/templates/debugcheck.js', 'debugcheck.js'],
];

export function walkFiles(rootDir, current = rootDir, out = []) {
  if (!existsSync(current)) return out;
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const full = join(current, entry.name);
    if (entry.isDirectory()) walkFiles(rootDir, full, out);
    else if (entry.isFile()) out.push(relative(rootDir, full).replace(/\\/g, '/'));
  }
  return out.sort();
}

/** Build [{sourceAbs, destRel}] for every file controlled by Forge sync. */
export function expandPayload(root) {
  const out = [];
  for (const [srcRel, dstRel] of PAYLOAD) {
    const src = join(root, srcRel);
    if (!existsSync(src)) continue;
    if (statSync(src).isFile()) {
      out.push({ sourceAbs: src, destRel: dstRel.replace(/\\/g, '/') });
      continue;
    }
    const nested = walkFiles(src);
    for (const rel of nested) {
      out.push({ sourceAbs: join(src, rel), destRel: join(dstRel, rel).replace(/\\/g, '/') });
    }
  }
  return out.sort((a, b) => a.destRel.localeCompare(b.destRel));
}
/** Snapshot every managed source file into memory before fleet propagation.
 * This prevents a long sibling sync from failing halfway if an external scanner,
 * indexer or antivirus quarantines/removes a generated adapter file mid-run.
 */
export function snapshotPayload(root) {
  const expanded = expandPayload(root);
  return expanded.map(item => ({ ...item, content: readFileSync(item.sourceAbs) }));
}
