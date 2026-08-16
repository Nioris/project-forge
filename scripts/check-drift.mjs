#!/usr/bin/env node
/**
 * @file check-drift.mjs
 * @description Self-audit verifier — catches the CLASSES of internal drift that the
 *   per-domain verifiers miss because no single check owns them. Born from v4.11.x audit
 *   findings: a brace-expansion artifact dir, an oversized CLAUDE.md violating its own rule,
 *   a digit-prefixed skill (3d-perf) that two catalog tools disagreed about, stale lib pins.
 *
 *   This is the "turn the rigor inward" tool. Fail-soft on its own internal errors
 *   (tooling bugs ≠ project bugs, Lesson #70) — it reports, it does not crash the release.
 *
 * Checks:
 *   1. Orphan/empty skill dirs (no SKILL.md) — e.g. brace-expansion artifacts
 *   2. CLAUDE.md size vs soft limit (proactive, before it bites)
 *   3. Advisor catalog ↔ filesystem agreement (both enumeration tools must concur)
 *   4. MANIFEST.txt ↔ filesystem skill/command presence (no untracked skills)
 *   5. Skills referenced by other skills that don't exist (broken /skill cross-refs)
 *   6. Version-string consistency across plugin.json / marketplace.json / GUIDE / dashboard
 *
 * Usage:
 *   node scripts/check-drift.mjs          — report (exit 0 clean, 1 drift found)
 *   node scripts/check-drift.mjs --strict — also fail on warnings
 */
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as cpModule from 'node:child_process';

const ROOT = process.cwd();
const SKILLS_DIR = path.join(ROOT, '.claude', 'skills');
const STRICT = process.argv.includes('--strict');

const problems = []; // {sev:'ERROR'|'WARN', msg}
const err  = (m) => problems.push({ sev: 'ERROR', msg: m });
const warn = (m) => problems.push({ sev: 'WARN',  msg: m });
const ok   = [];

function safe(label, fn) {
  try { fn(); }
  catch (e) { warn(`[${label}] check skipped (self-error, fail-soft): ${e.message}`); }
}

// ---- 1. Orphan / empty skill dirs --------------------------------------------------------
safe('orphan-dirs', () => {
  const dirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory());
  const orphans = dirs.filter(d => !fs.existsSync(path.join(SKILLS_DIR, d.name, 'SKILL.md')));
  if (orphans.length) err(`Orphan skill dir(s) with no SKILL.md: ${orphans.map(o => o.name).join(', ')}`);
  else ok.push(`No orphan skill dirs (${dirs.length} dirs all have SKILL.md)`);
});

// ---- 2. CLAUDE.md size -------------------------------------------------------------------
safe('claude-md-size', () => {
  const p = path.join(ROOT, 'CLAUDE.md');
  if (!fs.existsSync(p)) { warn('CLAUDE.md not found'); return; }
  const bytes = fs.statSync(p).size;
  const SOFT = 36 * 1024;
  const kb = (bytes / 1024).toFixed(1);
  if (bytes > SOFT) err(`CLAUDE.md ${kb} KB exceeds 36 KB soft limit — rotate old changelogs (scripts/rotate-changelog.mjs)`);
  else ok.push(`CLAUDE.md ${kb} KB (under 36 KB soft limit)`);
});

// ---- 3. Advisor catalog ↔ filesystem (both tools must agree) -----------------------------
safe('advisor-sync', () => {
  const advisor = fs.readFileSync(path.join(SKILLS_DIR, 'advisor', 'SKILL.md'), 'utf8');
  const fsSkills = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== 'advisor')
    .map(d => d.name)
    .filter(n => fs.existsSync(path.join(SKILLS_DIR, n, 'SKILL.md')));
  // Digit-first-safe enumeration (the bug this whole tool commemorates)
  const mentioned = new Set();
  for (const re of [/\/([a-z0-9][a-z0-9-]+)/gi, /\|\s+\/?([a-z0-9][a-z0-9-]+)\s+\|/gi]) {
    let m; while ((m = re.exec(advisor)) !== null) if (fsSkills.includes(m[1])) mentioned.add(m[1]);
  }
  const missing = fsSkills.filter(s => !mentioned.has(s));
  if (missing.length) err(`Skill(s) missing from advisor catalog: ${missing.join(', ')} — run scripts/update-advisor-catalog.mjs`);
  else ok.push(`Advisor catalog covers all ${fsSkills.length} skills`);
});

// ---- 4. MANIFEST ↔ filesystem skill presence ---------------------------------------------
safe('manifest-sync', () => {
  const mp = path.join(ROOT, 'MANIFEST.txt');
  if (!fs.existsSync(mp)) { warn('MANIFEST.txt not found'); return; }
  const manifest = fs.readFileSync(mp, 'utf8');
  const fsSkills = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory()).map(d => d.name)
    .filter(n => fs.existsSync(path.join(SKILLS_DIR, n, 'SKILL.md')));
  const untracked = fsSkills.filter(n => !manifest.includes(`.claude/skills/${n}/SKILL.md`));
  if (untracked.length) err(`Skill(s) not in MANIFEST.txt: ${untracked.join(', ')} — run scripts/generate-manifest.mjs`);
  else ok.push(`All ${fsSkills.length} skills tracked in MANIFEST`);
});

// ---- 5. Broken /skill cross-references ---------------------------------------------------
safe('broken-xref', () => {
  const fsSkills = new Set(fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory()).map(d => d.name));
  const KNOWN_COMMANDS = new Set(['do', 'game', 'app', 'continue']);
  // Anthropic's own built-in skills that Forge legitimately references but does NOT ship in
  // .claude/skills (they live in the Claude environment, not the Forge repo). Not a typo, not a gap.
  const KNOWN_EXTERNAL_SKILLS = new Set(['frontend-design', 'canvas-design', 'brand-guidelines',
    'algorithmic-art', 'skill-creator', 'mcp-builder', 'theme-factory', 'web-artifacts-builder',
    'docx', 'pdf', 'pptx', 'xlsx', 'file-reading', 'pdf-reading', 'product-self-knowledge']);
  // Only flag refs that look like a Forge skill invocation: backticked `/name` with a hyphen
  // (Forge skills are multi-word hyphenated). This avoids BotFather commands (/newbot),
  // touch events, URL fragments, and prose slashes that aren't skill refs at all.
  const broken = new Map();
  for (const dir of fsSkills) {
    const f = path.join(SKILLS_DIR, dir, 'SKILL.md');
    if (!fs.existsSync(f)) continue;
    const body = fs.readFileSync(f, 'utf8');
    const re = /`\/([a-z0-9]+-[a-z0-9-]+)`/g;   // backticked, hyphenated → looks like a skill
    let m;
    while ((m = re.exec(body)) !== null) {
      const ref = m[1];
      if (fsSkills.has(ref) || KNOWN_COMMANDS.has(ref) || KNOWN_EXTERNAL_SKILLS.has(ref)) continue;
      if (ref.endsWith('-')) continue;           // truncated stems like /release- /fill-
      if (!broken.has(ref)) broken.set(ref, []);
      if (!broken.get(ref).includes(dir)) broken.get(ref).push(dir);
    }
  }
  if (broken.size) {
    for (const [ref, refs] of broken)
      warn(`/${ref} referenced by [${refs.join(', ')}] but no such skill — typo or planned?`);
  } else ok.push('No broken /skill cross-references');
});

// ---- 6. Version-string consistency -------------------------------------------------------
safe('version-consistency', () => {
  const read = (p) => fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  const plugin = read(path.join(ROOT, '.claude-plugin', 'plugin.json'));
  const vm = plugin.match(/"version"\s*:\s*"([^"]+)"/);
  if (!vm) { warn('plugin.json version not found'); return; }
  const V = vm[1];
  const checks = [
    ['marketplace.json', read(path.join(ROOT, '.claude-plugin', 'marketplace.json')), V],
    ['GUIDE.md H1',      read(path.join(ROOT, 'GUIDE.md')),     `Project Forge v${V}`],
    ['dashboard.html',   read(path.join(ROOT, 'dashboard.html')), `v${V}`],
  ];
  const mism = checks.filter(([, content, needle]) => content && !content.includes(needle))
                     .map(([name]) => name);
  if (mism.length) err(`Version display mismatch (plugin.json=${V}): ${mism.join(', ')} — run bump-version.mjs`);
  else ok.push(`Version ${V} consistent across plugin/marketplace/GUIDE/dashboard`);
});

// ---- 7. debugcheck.js must not diverge -----------------------------------------------------
// The two debugcheck copies (platforms/yandex/templates + templates/html5) MUST be byte-identical.
// A stale fork is how genetic-lab shipped with a weak 4.4/lang checker and passed Forge but failed
// Yandex moderation. The canonical copy is platforms/yandex/templates (release skills point there).
safe('debugcheck-sync', () => {
  const canonical = path.join(ROOT, 'platforms', 'yandex', 'templates', 'debugcheck.js');
  const mirror    = path.join(ROOT, 'templates', 'html5', 'debugcheck.js');
  if (!fs.existsSync(canonical) || !fs.existsSync(mirror)) {
    warn('debugcheck.js missing in one of the two template dirs');
    return;
  }
  const a = fs.readFileSync(canonical, 'utf8');
  const b = fs.readFileSync(mirror, 'utf8');
  if (a !== b) {
    err('debugcheck.js DIVERGED between platforms/yandex/templates and templates/html5 — '
      + 'copy the canonical (yandex) over html5. A stale fork silently weakens moderation checks.');
  } else {
    // surface the version so a downgrade is visible
    const m = a.match(/Debug Checker v([\d.]+)/);
    ok.push(`debugcheck.js in sync${m ? ` (v${m[1]})` : ''} across both template dirs`);
    // integrity: the anti-gaming check must stay present (invariant #19)
    if (!/not tuned to pass the checker/.test(a)) {
      err('debugcheck.js lost its anti-gaming integrity check — games could again be tuned to pass '
        + 'the checker instead of meeting the requirement (invariant #19).');
    }
  }
});

// ---- 8. runtime-test 4.4 trap must exist in the release-gate copy ------------------------
// The two runtime-test.mjs are legitimately specialized (one variant/screenshot-rich, one
// REQ-4.4-trap-rich) — NOT byte-identical. But the release gate MUST run the one with Probe A,
// or moderation bugs (ad-without-gesture) slip through (genetic-lab v1.0.21). Warn if the
// canonical yandex copy lost its 4.4 trap.
safe('runtime-test-4.4-trap', () => {
  const rt = path.join(ROOT, 'platforms', 'yandex', 'scripts', 'runtime-test.mjs');
  if (!fs.existsSync(rt)) { warn('platforms/yandex/scripts/runtime-test.mjs missing'); return; }
  const s = fs.readFileSync(rt, 'utf8');
  const hasProbeA = /REQ-4\.4/.test(s) && /gestureDelta/.test(s) && /stateFns/.test(s);
  if (!hasProbeA) {
    err('release-gate runtime-test.mjs lost its REQ-4.4 Probe A (ad-without-gesture trap) — '
      + 'restore it or moderation 4.4 failures will slip through.');
  } else {
    ok.push('runtime-test.mjs has the REQ-4.4 ad-without-gesture trap (Probe A)');
  }
  // Probe E (REQ-1.19.2 un-gameable ready-timing) must stay present.
  if (!/readyLoadingVisible/.test(s) || !/Probe E/.test(s)) {
    err('release-gate runtime-test.mjs lost Probe E (REQ-1.19.2 un-gameable ready-timing) — '
      + 'restore it or games tuned to pass the checker will slip through (invariant #19).');
  } else {
    ok.push('runtime-test.mjs has Probe E (REQ-1.19.2 un-gameable ready-timing)');
  }
  // Probe F (REQ-1.10.1 multi-viewport overflow) must stay present.
  if (!/Probe F/.test(s) || !/TEST_VIEWPORTS/.test(s)) {
    err('release-gate runtime-test.mjs lost Probe F (REQ-1.10.1 multi-viewport overflow) — '
      + 'restore it or window-resize clipping (the recurring 1.10.1 rejection) will slip through.');
  } else {
    ok.push('runtime-test.mjs has Probe F (REQ-1.10.1 multi-viewport overflow)');
  }
  // Probe G (REQ-1.10.3 UI-over-canvas overlap) must stay present.
  if (!/Probe G/.test(s) || !/REQ-1\.10\.3/.test(s)) {
    err('release-gate runtime-test.mjs lost Probe G (REQ-1.10.3 UI overlapping the game board) — '
      + 'restore it or panels covering play cells (the Hexfront rejection) will slip through.');
  } else {
    ok.push('runtime-test.mjs has Probe G (REQ-1.10.3 UI-over-canvas overlap)');
  }
  // The generic scripts/runtime-test.mjs must delegate Yandex builds to the yandex copy, or
  // release skills that call it run the weak test (no Probe A/E) — the genetic-lab/samogonshchik miss.
  const generic = path.join(ROOT, 'scripts', 'runtime-test.mjs');
  if (fs.existsSync(generic)) {
    const g = fs.readFileSync(generic, 'utf8');
    if (!/delegat/i.test(g) || !/yandex.*runtime-test|runtime-test.*yandex/i.test(g)) {
      err('scripts/runtime-test.mjs no longer delegates Yandex builds to the yandex copy — '
        + 'release skills calling it would run the weak test (no Probe A/E). Restore delegation.');
    } else {
      ok.push('scripts/runtime-test.mjs delegates Yandex builds to the Probe A/E copy');
    }
  }
  // Guard against the false-GREEN regression: missing puppeteer must NOT exit 0 ("skip=success").
  for (const rtp of ['scripts/runtime-test.mjs', 'platforms/yandex/scripts/runtime-test.mjs']) {
    const p = path.join(ROOT, rtp);
    if (!fs.existsSync(p)) continue;
    const txt = fs.readFileSync(p, 'utf8');
    if (/returning success/i.test(txt) || /Skipping runtime test/i.test(txt)) {
      err(`${rtp} silently skips when puppeteer missing (false GREEN) — must auto-install or exit 3 (unverified=blocker).`);
    }
  }
});

// ---- 9. i18n-completeness must keep the data-i18n awareness -------------------------------
// REQ-8.2.3 validator flagged data-i18n elements as "hardcoded Russian" (8 false BLOCKERs) because
// its "covered" check ignored the data-i18n attribute that applyStaticLang() actually keys on.
// Guard that the fix stays in (it reverts via sync if the template copy loses it).
safe('i18n-completeness-data-i18n', () => {
  const p = path.join(ROOT, 'platforms', 'yandex', 'validators', 'i18n-completeness.mjs');
  if (!fs.existsSync(p)) { warn('i18n-completeness.mjs not found'); return; }
  const s = fs.readFileSync(p, 'utf8');
  if (!/dataI18n/.test(s) || !/data-i18n/.test(s)) {
    err('i18n-completeness.mjs lost its data-i18n awareness — REQ-8.2.3 will flag translated '
      + '[data-i18n] elements as hardcoded (false BLOCKERs). Restore the dataI18n covered-check.');
  } else {
    ok.push('i18n-completeness.mjs has data-i18n awareness (no false 8.2.3 blockers)');
  }
});

// ---- 10. debugcheck must not false-positive on a clean game --------------------------------
// Runs the REAL static checks against a known-clean fixture. A spec-compliant game must produce
// zero hard FAILs. This is the machine guarantee that replaced "I promise to test new checks
// against a good game" — added after keyboard-1.6.1.2 and anti-gaming both cried wolf on a real build.
safe('debugcheck-no-false-positives', () => {
  const { spawnSync } = cpModule;
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'check-debugcheck-fixtures.mjs')],
    { encoding: 'utf8' });
  if (r.status === 0) {
    ok.push('debugcheck has no false positives on the clean-game fixture');
  } else {
    const tail = (r.stdout || '').split('\n').filter(l => l.includes('FALSE POSITIVE') || l.trim().startsWith('-')).slice(0, 8).join('; ');
    err('debugcheck FALSE-POSITIVES on a clean game: ' + (tail || r.stderr || 'see check-debugcheck-fixtures.mjs'));
  }
});

// ---- 11. emoji-compat range coverage (no gaps) ---------------------------------------------
safe('emoji-compat-coverage', () => {
  const { spawnSync } = cpModule;
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'check-emoji-coverage.mjs')],
    { encoding: 'utf8' });
  if (r.status === 0) {
    ok.push('emoji-compat has no range gaps (curated beyond-spec probes all flagged)');
  } else {
    const tail = (r.stdout || '').split('\n').filter(l => l.trim().startsWith('-')).slice(0, 6).join('; ');
    err('emoji-compat range gap: ' + (tail || r.stderr || 'see check-emoji-coverage.mjs'));
  }
});

// ---- 12. requirements coverage map must exist (single source of truth) ----------------------
safe('requirements-coverage-map', () => {
  const cov = path.join(ROOT, 'wiki', 'requirements-coverage.md');
  if (!fs.existsSync(cov)) {
    err('wiki/requirements-coverage.md is missing — the Yandex requirement→Forge-check map is the '
      + 'single source of truth for what is covered (AUTO) vs manual. Restore it.');
  } else {
    const t = fs.readFileSync(cov, 'utf8');
    if (!/2026-05-05|last-changed/.test(t)) {
      warn('requirements-coverage.md exists but has no baseline date — note the Yandex doc date it maps.');
    }
    ok.push('requirements-coverage.md present (Yandex requirement → Forge-check map)');
  }
});

// ---- 13. AGENTS.md (Codex/cross-tool layer) must exist and be in sync with CLAUDE.md ----
safe('agents-md-sync', () => {
  const p = path.join(ROOT, 'AGENTS.md');
  if (!fs.existsSync(p)) {
    err('AGENTS.md is missing — the Codex/cross-tool layer. Run: node scripts/generate-agents-md.mjs');
    return;
  }
  const claude = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
  const expect = crypto.createHash('sha256').update(claude).digest('hex').slice(0, 16);
  const agents = fs.readFileSync(p, 'utf8');
  const m = agents.match(/claude-hash:([0-9a-f]{16})/);
  if (!m) { err('AGENTS.md has no claude-hash marker — regenerate: node scripts/generate-agents-md.mjs'); return; }
  if (m[1] !== expect) {
    err('AGENTS.md is STALE (CLAUDE.md changed since generation) — run: node scripts/generate-agents-md.mjs');
  } else if (fs.statSync(p).size >= 32768) {
    err(`AGENTS.md is ${fs.statSync(p).size} bytes — exceeds Codex default 32 KiB project-doc budget`);
  } else {
    ok.push('AGENTS.md in sync with CLAUDE.md and below Codex 32 KiB budget');
  }
});

// ---- 14. Native Codex adapter must be internally consistent --------------------------------
safe('codex-adapter', () => {
  const r = cpModule.spawnSync(process.execPath, ['scripts/check-codex-compat.mjs'], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.status === 0) ok.push('native Codex adapter passes compatibility audit');
  else err('Codex adapter compatibility failed — run: node scripts/check-codex-compat.mjs');
});


// ---- 15. Dashboard build metadata + dual-agent command surface -----------------------------
safe('dashboard-meta', () => {
  const r = cpModule.spawnSync(process.execPath, ['scripts/check-dashboard-meta.mjs'], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.status === 0) ok.push('dashboard version/counts/Claude↔Codex command mappings are current');
  else err('dashboard command/version metadata drift — run: node scripts/sync-dashboard-meta.mjs');
});

// ---- 16. Sync command surface must converge on the canonical Node implementation ------------
safe('sync-command-surface', () => {
  const rootBat = fs.readFileSync(path.join(ROOT, 'sync.bat'), 'utf8');
  const compatBat = fs.readFileSync(path.join(ROOT, 'scripts', 'sync.bat'), 'utf8');
  const compatPs = fs.readFileSync(path.join(ROOT, 'scripts', 'sync.ps1'), 'utf8');
  if (!/scripts\\sync\.mjs|scripts\/sync\.mjs/i.test(rootBat)) err('root sync.bat no longer delegates to scripts/sync.mjs');
  if (!/sync\.mjs/i.test(compatBat) || /xcopy|robocopy|rmdir/i.test(compatBat)) err('scripts/sync.bat contains a second sync implementation instead of delegating to sync.mjs');
  if (!/sync\.mjs/i.test(compatPs) || /robocopy|Copy-IfNeeded/i.test(compatPs)) err('scripts/sync.ps1 contains a second sync implementation instead of delegating to sync.mjs');
  if (!fs.existsSync(path.join(ROOT, 'scripts', 'forge-sync-spec.mjs'))) err('scripts/forge-sync-spec.mjs missing');
  else ok.push('all sync entry points converge on scripts/sync.mjs + managed payload spec');
});

safe('sync-managed-payload', () => {
  const r = spawnSync(process.execPath, ['scripts/check-sync-spec.mjs'], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) err('managed sync payload specification is invalid');
  else ok.push('managed sibling payload expands safely (files vs directories, no duplicate destinations)');
});

safe('sync-snapshot-regression', () => {
  const r = spawnSync(process.execPath, ['scripts/check-sync-snapshot.mjs'], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) err('sync payload snapshot regression failed');
  else ok.push('managed sync sources are buffered before sibling propagation');
});

safe('update-surface', () => {
  const r = spawnSync(process.execPath, ['scripts/check-update-surface.mjs'], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) err('update/upgrade command surface is inconsistent');
  else ok.push('external updater + upgrade paths converge on semver-aware managed fleet update');
});

// Guard: dashboard phases panel stays in sync with .claude/skills phase-* dirs.
safe('dashboard-phase-list', () => {
  const dash = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');
  const phaseDirs = fs.readdirSync(path.join(ROOT, '.claude', 'skills')).filter(n => /^phase-\d/.test(n));
  const missing = phaseDirs.filter(p => !dash.includes(p));
  if (missing.length) err(`dashboard.html phases panel is missing: ${missing.join(', ')} — update PH_DATA in dashboard.html`);
  else ok.push(`dashboard lists all ${phaseDirs.length} phase skills`);
});

// Guard: skill description length (Claude Code listing cap 1536).
safe('skill-description-cap', () => {
  try {
    const r = execSync(`node "${path.join(ROOT,'scripts','check-skill-descriptions.mjs')}"`, {encoding:'utf8'});
    if (/✗/.test(r)) err('skill descriptions exceed the 1536-char listing cap — see check-skill-descriptions.mjs');
    else ok.push('skill descriptions fit listing cap');
  } catch (e) { err('skill-description guard: ' + (e.stdout || e.message).toString().split('\n')[0]); }
});

safe('phase-aware-status-model', () => {
  const r = spawnSync(process.execPath, ['scripts/check-status-phase-model.mjs'], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) err('/status 9-phase model regression failed — run scripts/check-status-phase-model.mjs');
  else ok.push('/status uses canonical 9 phases + machine markers; CLAUDE mutable state is non-authoritative');
});

safe('api-terminal-profiles', () => {
  const r = spawnSync(process.execPath, ['scripts/check-api-terminal-profiles.mjs'], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) err('API terminal profile regression failed — run scripts/check-api-terminal-profiles.mjs');
  else ok.push('Claude API + Codex API + GigaChat terminal profiles are internally consistent');
});

// ---- Report ------------------------------------------------------------------------------
const errors = problems.filter(p => p.sev === 'ERROR');
const warns  = problems.filter(p => p.sev === 'WARN');

console.log('\nForge drift self-audit\n' + '─'.repeat(40));
for (const o of ok) console.log(`  ✓ ${o}`);
for (const w of warns)  console.log(`  ⚠ ${w.msg}`);
for (const e of errors) console.log(`  ✗ ${e.msg}`);
console.log('─'.repeat(40));

if (errors.length === 0 && (!STRICT || warns.length === 0)) {
  console.log(`✓ No drift${warns.length ? ` (${warns.length} warning(s))` : ''}.\n`);
  process.exit(0);
}
console.log(`✗ ${errors.length} drift issue(s)${STRICT ? `, ${warns.length} warning(s)` : ''}.\n`);
process.exit(1);
