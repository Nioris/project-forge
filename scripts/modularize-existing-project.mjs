#!/usr/bin/env node
/**
 * Safely externalize a monolithic HTML game's inline CSS/JS while preserving
 * classic-script execution order. Default mode is read-only analysis.
 *
 * Usage:
 *   node scripts/modularize-existing-project.mjs WorkProgress/game/index.html
 *   node scripts/modularize-existing-project.mjs WorkProgress/game/index.html --apply
 *   node scripts/modularize-existing-project.mjs WorkProgress/game/index.html --refresh
 *   node scripts/modularize-existing-project.mjs WorkProgress/game/index.html --check
 */
import {
  existsSync, readFileSync, writeFileSync, mkdirSync, statSync, readdirSync,
} from 'node:fs';
import { resolve, relative, dirname, basename, join, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const CHECK = argv.includes('--check');
const REFRESH = argv.includes('--refresh');
const JSON_OUTPUT = argv.includes('--json');
const positional = argv.filter(value => !value.startsWith('--'));
const PROJECT = resolve(process.cwd());
const requested = resolve(PROJECT, positional[0] || '.');
const TARGET = statSafe(requested)?.isDirectory() ? join(requested, 'index.html') : requested;
const ARCHITECTURE = join(PROJECT, 'wiki', 'architecture');
const MANIFEST_PATH = join(ARCHITECTURE, 'modules.json');
const DOC_PATH = join(ARCHITECTURE, 'modules.md');

function fail(message, code = 2) {
  console.error(`[X] ${message}`);
  process.exit(code);
}
function statSafe(path) { try { return statSync(path); } catch { return null; } }
function posix(path) { return String(path).split(sep).join('/'); }
function rel(path) { return posix(relative(PROJECT, path)); }
function sha256(text) { return createHash('sha256').update(text).digest('hex'); }
function bytes(text) { return Buffer.byteLength(text, 'utf8'); }
function ensureInsideProject(path) {
  const value = relative(PROJECT, path);
  if (value.startsWith('..') || resolve(path) === resolve(PROJECT, '..')) fail(`Path escapes project root: ${path}`);
}
function isoForPath() { return new Date().toISOString().replace(/[:.]/g, '-'); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }

function attrValue(attrs = '', name = '') {
  const match = String(attrs).match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match ? match[2] : '';
}

function localModulePath(reference = '') {
  const clean = String(reference).split(/[?#]/, 1)[0].trim();
  if (!clean || /^(?:[a-z]+:|\/\/|data:|#)/i.test(clean)) return null;
  const targetDir = dirname(TARGET);
  const path = clean.startsWith('/') ? resolve(targetDir, `.${clean}`) : resolve(targetDir, clean);
  const withinTarget = relative(targetDir, path);
  if (withinTarget.startsWith('..') || resolve(path) === resolve(targetDir, '..')) return null;
  const first = posix(withinTarget).split('/')[0]?.toLowerCase();
  return ['js', 'styles'].includes(first) ? path : null;
}

function htmlModuleReferences(raw = '') {
  const refs = [];
  const tagRe = /<link\b([^>]*)>|<script\b([^>]*)>/gi;
  let match;
  while ((match = tagRe.exec(raw))) {
    const isLink = match[1] !== undefined;
    const attrs = isLink ? match[1] : match[2];
    if (isLink && !/\brel\s*=\s*(["'])stylesheet\1/i.test(attrs)) continue;
    const reference = attrValue(attrs, isLink ? 'href' : 'src');
    const path = localModulePath(reference);
    if (!path) continue;
    refs.push({ path, type: isLink ? 'css' : 'js', reference, position: match.index });
  }
  return refs;
}

function inferredRole(path, type) {
  if (type === 'css') return 'visual-style';
  return basename(path, '.js').replace(/^\d{2,3}-/, '') || 'feature-module';
}

function numberedModuleFiles() {
  const files = [];
  for (const folder of ['js', 'styles']) {
    const dir = join(dirname(TARGET), folder);
    if (!existsSync(dir)) continue;
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      if (item.isFile() && /^\d{2,3}-.+\.(?:js|css)$/i.test(item.name)) files.push(join(dir, item.name));
    }
  }
  return files;
}

ensureInsideProject(TARGET);
if (!existsSync(TARGET) || !statSafe(TARGET)?.isFile()) fail(`HTML entrypoint not found: ${TARGET}`);
if ((APPLY || CHECK || REFRESH) && !posix(relative(PROJECT, TARGET)).toLowerCase().startsWith('workprogress/')) {
  fail('Mutation/check target must be inside WorkProgress/. Analyze mode remains available elsewhere.');
}
if ([APPLY, CHECK, REFRESH].filter(Boolean).length > 1) fail('Choose only one mode: --apply, --refresh, or --check.');

function parseHtml(raw) {
  const styles = [];
  const scripts = [];
  const styleRe = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi;
  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = styleRe.exec(raw))) {
    styles.push({ start: match.index, end: styleRe.lastIndex, full: match[0], attrs: match[1] || '', content: match[2] || '' });
  }
  while ((match = scriptRe.exec(raw))) {
    const attrs = match[1] || '';
    scripts.push({
      start: match.index, end: scriptRe.lastIndex, full: match[0], attrs,
      content: match[2] || '', external: /\bsrc\s*=/.test(attrs),
      module: /\btype\s*=\s*['"]module['"]/i.test(attrs),
    });
  }
  return { styles, scripts, inlineScripts: scripts.filter(item => !item.external) };
}

function markerRole(line = '') {
  const value = line.toLowerCase();
  const mappings = [
    [/boss|рацпредлож/, 'boss-responses'], [/карьерн.*лестниц/, 'career-ranks'],
    [/render/, 'ui-render'], [/bubble/, 'feedback-bubbles'], [/produce/, 'production'],
    [/drag/, 'drag-merge'], [/victory|побед/, 'victory'], [/hint|подсказ/, 'hints'],
    [/руководств/, 'management'], [/карьер/, 'career'], [/директор/, 'director-mode'],
    [/reset|сброс/, 'reset'], [/сохран|загруз/, 'persistence'],
    [/отч[её]т|отсутств/, 'idle-report'], [/init|инициал/, 'bootstrap'],
  ];
  return mappings.find(([pattern]) => pattern.test(value))?.[1] || 'section';
}

function splitSemanticSections(content, inlineIndex) {
  const lines = content.match(/[^\n]*\n|[^\n]+$/g) || [];
  const boundaries = [];
  let offset = 0;
  for (const line of lines) {
    if (/^\s*\/\/\s*={8,}[^\n]*={8,}\s*$/.test(line.trimEnd())) boundaries.push({ offset, line });
    offset += line.length;
  }
  if (!boundaries.length) {
    const role = /\bYaGames\b|\bI18N\b/.test(content) ? 'platform-runtime' : `inline-${inlineIndex}`;
    return [{ role, content }];
  }
  const sections = [];
  if (boundaries[0].offset > 0) {
    const foundation = content.slice(0, boundaries[0].offset);
    if (foundation.trim()) sections.push({ role: /\bconst\s+state\b/.test(foundation) ? 'state-foundation' : 'foundation', content: foundation });
  }
  boundaries.forEach((boundary, index) => {
    const end = boundaries[index + 1]?.offset ?? content.length;
    const section = content.slice(boundary.offset, end);
    if (section.trim()) sections.push({ role: markerRole(boundary.line), content: section });
  });
  return sections;
}

function symbolDefinitions(content = '') {
  const values = [];
  const patterns = [
    /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm,
    /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm,
    /^window\.([A-Za-z_$][\w$]*)\s*=/gm,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content))) values.push(match[1]);
  }
  return unique(values);
}

function rewriteCssUrls(content) {
  return content.replace(/url\(\s*(['"]?)([^'"\)]+)\1\s*\)/gi, (full, quote, value) => {
    const trimmed = value.trim();
    if (/^(?:data:|https?:|\/|#)/i.test(trimmed)) return full;
    return `url(${quote}../${trimmed}${quote})`;
  });
}

function analyze(raw) {
  const parsed = parseHtml(raw);
  const lines = raw.split(/\r?\n/).length;
  const inlineBytes = parsed.inlineScripts.map(item => bytes(item.content));
  const styleBytes = parsed.styles.map(item => bytes(item.content));
  return {
    source: rel(TARGET), bytes: bytes(raw), lines,
    style_blocks: parsed.styles.length, style_bytes: styleBytes,
    inline_script_blocks: parsed.inlineScripts.length, inline_script_bytes: inlineBytes,
    external_script_blocks: parsed.scripts.filter(item => item.external).length,
    module_inline_blocks: parsed.inlineScripts.filter(item => item.module).length,
    monolith: bytes(raw) >= 32_000 || lines >= 800 || inlineBytes.some(size => size >= 24_000),
  };
}

function moduleMarkdown(manifest) {
  const rows = manifest.modules.map(module =>
    `| ${module.order} | \`${module.path}\` | ${module.role} | ${module.bytes} | ${module.symbols.slice(0, 8).map(x => `\`${x}\``).join(', ') || '—'} |`
  );
  return [
    '# Module Map', '',
    `Generated from \`${manifest.source}\` by Project Forge.`,
    `Source before split: ${manifest.source_bytes} bytes / ${manifest.source_lines} lines.`,
    `Entrypoint after split: ${manifest.output_bytes} bytes. Backup: \`${manifest.backup}\`.`, '',
    '## Load-order contract', '',
    'These are ordered classic browser scripts. Their order is part of the runtime contract because they share the global lexical environment. Do not convert one file to `type="module"`, reorder scripts, or rename a public symbol without updating this map and rerunning the regression checks.', '',
    '| Order | File | Responsibility | Bytes | Main symbols |',
    '|---:|---|---|---:|---|', ...rows, '',
    '## State and persistence', '',
    `- State owner: ${manifest.state_owner ? `\`${manifest.state_owner}\`` : 'not detected'}.`,
    `- Persistence owner: ${manifest.persistence_owner ? `\`${manifest.persistence_owner}\`` : 'not detected'}.`,
    `- localStorage keys/constants: ${manifest.storage_keys.length ? manifest.storage_keys.map(x => `\`${x}\``).join(', ') : 'none detected'}.`,
    `- DOM IDs are recorded in \`modules.json\` (${manifest.dom_ids.length} IDs).`, '',
    '## Maintenance rule', '',
    'Feature work should load `modules.json`, this map, and only the owning/dependent source files. After changing module boundaries, run `modularize-existing-project.mjs <entrypoint> --check`, the canonical playtest/local-stage checks, and visual QA before continuing product work.', '',
  ].join('\n');
}

function applyModularization(raw) {
  const parsed = parseHtml(raw);
  if (existsSync(MANIFEST_PATH)) {
    let existing;
    try { existing = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')); } catch (error) { fail(`Existing modules.json is invalid: ${error.message}`); }
    if (existing.source && existing.source !== rel(TARGET)) {
      fail(`Project module contract already belongs to ${existing.source}; refusing to replace it with ${rel(TARGET)}. Target the active entrypoint named by the user or archive the old contract explicitly.`);
    }
  }
  if (!parsed.styles.length && !parsed.inlineScripts.length) fail('No inline CSS/JS blocks found. If already modularized, run --check.');
  if (parsed.inlineScripts.some(item => item.module)) fail('Inline type="module" scripts require an explicit semantic migration; automatic classic-script extraction is intentionally blocked.');

  const htmlDir = dirname(TARGET);
  const cssDir = join(htmlDir, 'styles');
  const jsDir = join(htmlDir, 'js');
  const planned = [];
  const edits = [];
  let order = 0;

  parsed.styles.forEach((block, index) => {
    const name = parsed.styles.length === 1 ? 'game.css' : `inline-${String(index + 1).padStart(2, '0')}.css`;
    const path = join(cssDir, name);
    const content = rewriteCssUrls(block.content.replace(/^\s*\n/, '').replace(/\s*$/, '') + '\n');
    planned.push({ path, type: 'css', role: 'visual-style', order: order++, content, symbols: [] });
    edits.push({ start: block.start, end: block.end, replacement: `<link rel="stylesheet" href="${posix(relative(htmlDir, path))}">` });
  });

  parsed.inlineScripts.forEach((block, inlineIndex) => {
    const sections = splitSemanticSections(block.content.replace(/^\s*\n/, ''), inlineIndex + 1);
    const tags = [];
    sections.forEach((section, sectionIndex) => {
      const prefix = String(order).padStart(2, '0');
      const suffix = sections.length === 1 && section.role === `inline-${inlineIndex + 1}` ? `inline-${inlineIndex + 1}` : section.role;
      const path = join(jsDir, `${prefix}-${suffix}.js`);
      const content = section.content.replace(/\s*$/, '') + '\n';
      planned.push({ path, type: 'js', role: section.role, order: order++, content, symbols: symbolDefinitions(content) });
      tags.push(`<script src="${posix(relative(htmlDir, path))}"></script>`);
    });
    edits.push({ start: block.start, end: block.end, replacement: tags.join('\n') });
  });

  const collisions = planned.filter(item => existsSync(item.path));
  if (collisions.length) fail(`Refusing to overwrite existing module files: ${collisions.map(item => rel(item.path)).join(', ')}`);

  let output = raw;
  edits.sort((a, b) => b.start - a.start).forEach(edit => {
    output = output.slice(0, edit.start) + edit.replacement + output.slice(edit.end);
  });

  const projectName = basename(dirname(TARGET));
  const backupDir = join(PROJECT, 'wiki', 'runtime', 'modularize-backups', `${projectName}-${isoForPath()}`);
  const backupPath = join(backupDir, basename(TARGET));
  mkdirSync(backupDir, { recursive: true });
  writeFileSync(backupPath, raw, 'utf8');
  mkdirSync(cssDir, { recursive: true });
  mkdirSync(jsDir, { recursive: true });
  planned.forEach(item => writeFileSync(item.path, item.content, 'utf8'));
  writeFileSync(TARGET, output, 'utf8');

  const allSource = planned.filter(item => item.type === 'js').map(item => item.content).join('\n');
  const stateOwner = planned.find(item => /\bconst\s+state\b|\blet\s+state\b/.test(item.content))?.path;
  const persistenceOwner = planned.find(item => /\blocalStorage\b/.test(item.content))?.path;
  const storageKeys = unique([
    ...[...allSource.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(\s*['"]([^'"]+)['"]/g)].map(match => match[1]),
    ...[...allSource.matchAll(/(?:const|let|var)\s+([A-Z][A-Z0-9_]*KEY)\s*=/g)].map(match => match[1]),
  ]);
  const domIds = unique([...output.matchAll(/\bid\s*=\s*['"]([^'"]+)['"]/gi)].map(match => match[1])).sort();
  const sourceInfo = analyze(raw);
  const manifest = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source: rel(TARGET),
    source_sha256: sha256(raw),
    source_bytes: bytes(raw),
    source_lines: sourceInfo.lines,
    backup: rel(backupPath),
    output_sha256: sha256(output),
    output_bytes: bytes(output),
    state_owner: stateOwner ? rel(stateOwner) : null,
    persistence_owner: persistenceOwner ? rel(persistenceOwner) : null,
    storage_keys: storageKeys,
    dom_ids: domIds,
    modules: planned.map(item => ({
      order: item.order, path: rel(item.path), type: item.type, role: item.role,
      bytes: bytes(item.content), sha256: sha256(item.content), symbols: item.symbols,
    })),
    required_checks: [
      `node ../project-forge/scripts/modularize-existing-project.mjs ${rel(TARGET)} --check`,
      `node ../project-forge/scripts/playtest.mjs ${rel(TARGET)}`,
      `node ../project-forge/scripts/local-stage.mjs ${rel(TARGET)} --ai --play`,
    ],
  };
  mkdirSync(ARCHITECTURE, { recursive: true });
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  writeFileSync(DOC_PATH, moduleMarkdown(manifest), 'utf8');
  return manifest;
}

function checkModularization() {
  if (!existsSync(MANIFEST_PATH)) fail(`Module manifest missing: ${rel(MANIFEST_PATH)}`);
  let manifest;
  try { manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')); } catch (error) { fail(`Invalid modules.json: ${error.message}`); }
  if (manifest.source !== rel(TARGET)) fail(`Manifest source is ${manifest.source}, requested ${rel(TARGET)}.`);
  const errors = [];
  const raw = readFileSync(TARGET, 'utf8');
  if (sha256(raw) !== manifest.output_sha256) errors.push('entrypoint hash differs from modules.json');
  const parsed = parseHtml(raw);
  if (parsed.styles.length) errors.push(`${parsed.styles.length} inline style block(s) remain`);
  if (parsed.inlineScripts.length) errors.push(`${parsed.inlineScripts.length} inline script block(s) remain`);
  const approvedPaths = new Set((manifest.modules || []).map(module => resolve(PROJECT, module.path)));
  const liveReferences = htmlModuleReferences(raw);
  for (const reference of liveReferences) {
    if (!existsSync(reference.path)) errors.push(`referenced module is missing: ${rel(reference.path)}`);
    if (!approvedPaths.has(reference.path)) errors.push(`referenced module is absent from modules.json: ${rel(reference.path)}; run --refresh after intentionally adding it`);
  }
  const referencedPaths = new Set(liveReferences.map(reference => reference.path));
  for (const path of numberedModuleFiles()) {
    if (!referencedPaths.has(path)) errors.push(`orphan numbered module is not loaded by entrypoint: ${rel(path)}`);
  }
  for (const module of manifest.modules || []) {
    const path = resolve(PROJECT, module.path);
    if (!existsSync(path)) { errors.push(`missing module ${module.path}`); continue; }
    const content = readFileSync(path, 'utf8');
    if (sha256(content) !== module.sha256) errors.push(`stale hash for ${module.path}`);
    const fromHtml = posix(relative(dirname(TARGET), path));
    if (!raw.includes(`"${fromHtml}"`) && !raw.includes(`'${fromHtml}'`)) errors.push(`entrypoint does not reference ${module.path}`);
    if (module.type === 'js') {
      const syntax = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8', timeout: 30_000 });
      if (syntax.status !== 0) errors.push(`JavaScript syntax failed for ${module.path}: ${(syntax.stderr || syntax.stdout || '').trim()}`);
    }
  }
  if (errors.length) {
    errors.forEach(error => console.error(`[X] ${error}`));
    process.exit(1);
  }
  const largest = Math.max(0, ...(manifest.modules || []).map(module => Number(module.bytes) || 0));
  console.log(`[OK] modular structure verified: ${manifest.modules.length} files, entrypoint ${bytes(raw)} bytes, largest module ${largest} bytes`);
  console.log(`[OK] contracts: ${rel(MANIFEST_PATH)}, ${rel(DOC_PATH)}`);
  return manifest;
}

function refreshModularization() {
  if (!existsSync(MANIFEST_PATH)) fail(`Module manifest missing: ${rel(MANIFEST_PATH)}`);
  let manifest;
  try { manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')); } catch (error) { fail(`Invalid modules.json: ${error.message}`); }
  if (manifest.source !== rel(TARGET)) fail(`Manifest source is ${manifest.source}, requested ${rel(TARGET)}.`);
  const raw = readFileSync(TARGET, 'utf8');
  const parsed = parseHtml(raw);
  if (parsed.styles.length || parsed.inlineScripts.length) fail('Entrypoint contains new inline CSS/JS. Refresh cannot authorize boundary changes; modularize those changes explicitly first.');

  const references = htmlModuleReferences(raw);
  const referencedPaths = new Set(references.map(reference => reference.path));
  for (const path of numberedModuleFiles()) {
    if (!referencedPaths.has(path)) fail(`Cannot refresh while numbered module is orphaned: ${rel(path)}. Load it from the entrypoint or remove the abandoned module.`);
  }

  const existingByPath = new Map((manifest.modules || []).map(module => [resolve(PROJECT, module.path), module]));
  const approvedSequence = (manifest.modules || []).map(module => resolve(PROJECT, module.path));
  const liveSequence = references.map(reference => reference.path);
  let previous = -1;
  for (const path of approvedSequence) {
    const index = liveSequence.indexOf(path);
    if (index < 0) fail(`Entrypoint no longer references approved module: ${rel(path)}`);
    if (index <= previous) fail(`Approved module load order changed near ${rel(path)}. Restore the prior relative order before refreshing.`);
    previous = index;
  }

  const liveModules = [];
  for (const [order, reference] of references.entries()) {
    const { path, type } = reference;
    if (!existsSync(path)) fail(`Cannot refresh missing referenced module: ${rel(path)}`);
    const content = readFileSync(path, 'utf8');
    if (type === 'js') {
      const syntax = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8', timeout: 30_000 });
      if (syntax.status !== 0) fail(`JavaScript syntax failed for ${rel(path)}: ${(syntax.stderr || syntax.stdout || '').trim()}`);
    }
    const existing = existingByPath.get(path);
    liveModules.push({
      ...(existing || {}),
      order,
      path: rel(path),
      type,
      role: existing?.role || inferredRole(path, type),
      bytes: bytes(content),
      sha256: sha256(content),
      symbols: type === 'js' ? symbolDefinitions(content) : [],
      _content: content,
    });
  }

  const allSource = liveModules.filter(item => item.type === 'js').map(item => item._content).join('\n');
  const stateOwner = liveModules.find(item => /\bconst\s+state\b|\blet\s+state\b/.test(item._content));
  const persistenceOwner = liveModules.find(item => /\blocalStorage\b/.test(item._content));
  const storageKeys = unique([
    ...[...allSource.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(\s*['"]([^'"]+)['"]/g)].map(match => match[1]),
    ...[...allSource.matchAll(/(?:const|let|var)\s+([A-Z][A-Z0-9_]*KEY)\s*=/g)].map(match => match[1]),
  ]);
  const refreshed = {
    ...manifest,
    generated_at: new Date().toISOString(),
    output_sha256: sha256(raw),
    output_bytes: bytes(raw),
    state_owner: stateOwner?.path || null,
    persistence_owner: persistenceOwner?.path || null,
    storage_keys: storageKeys,
    dom_ids: unique([...raw.matchAll(/\bid\s*=\s*['"]([^'"]+)['"]/gi)].map(match => match[1])).sort(),
    modules: liveModules.map(({ _content, ...module }) => module),
  };
  writeFileSync(MANIFEST_PATH, JSON.stringify(refreshed, null, 2) + '\n', 'utf8');
  writeFileSync(DOC_PATH, moduleMarkdown(refreshed), 'utf8');
  const adopted = refreshed.modules.length - (manifest.modules || []).length;
  console.log(`[OK] refreshed module contracts for ${refreshed.modules.length} files; adopted ${Math.max(0, adopted)} newly referenced module(s), preserved approved relative order`);
  return checkModularization();
}

const raw = readFileSync(TARGET, 'utf8');
if (CHECK) {
  checkModularization();
} else if (REFRESH) {
  refreshModularization();
} else if (APPLY) {
  const before = analyze(raw);
  if (!before.monolith) fail(`Entrypoint is not a detected monolith (${before.bytes} bytes, ${before.lines} lines).`);
  const manifest = applyModularization(raw);
  checkModularization();
  console.log(`[OK] modularized ${manifest.source}: ${manifest.source_bytes} -> ${manifest.output_bytes} bytes`);
  console.log(`[OK] backup preserved: ${manifest.backup}`);
} else {
  const result = analyze(raw);
  if (JSON_OUTPUT) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Project Forge modularization analysis: ${result.source}`);
    console.log(`  size: ${result.bytes} bytes / ${result.lines} lines`);
    console.log(`  inline CSS: ${result.style_blocks} block(s), ${result.style_bytes.join(', ') || 0} bytes`);
    console.log(`  inline JS: ${result.inline_script_blocks} block(s), ${result.inline_script_bytes.join(', ') || 0} bytes`);
    console.log(`  external JS: ${result.external_script_blocks} block(s)`);
    console.log(`  monolith: ${result.monolith ? 'YES' : 'no'}`);
    console.log(result.monolith
      ? `NEXT: rerun with --apply, then --check and the canonical game regression checks.`
      : 'No structural split is required by the current deterministic thresholds.');
  }
}
