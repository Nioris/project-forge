#!/usr/bin/env node
/**
 * @file check-pipeline-state.mjs
 * @description Pipeline state verifier — reads wiki/_current.md + filesystem,
 *              tells you where you are in the 7-step pipeline and what's needed
 *              for the next step.
 *
 *   Background (Lesson #28, Invariant #10):
 *
 *   The 7-step pipeline (Analyze → Metrics → Design → Build → Test →
 *   Release-ready → Release) reduces invisible cognitive load. But after a
 *   long break or pause, user forgets where they were. Manually inspecting
 *   wiki/_current.md + design/* + plan/* takes minutes.
 *
 *   This script does it in seconds:
 *     1. Reads wiki/_current.md for explicit pipeline status block (if present)
 *     2. Falls back to filesystem detection if status block is stale or missing
 *     3. Reports: current step, completed steps, prerequisites for next step,
 *        suggested command to invoke
 *
 *  Usage:
 *    node scripts/check-pipeline-state.mjs              # current dir
 *    node scripts/check-pipeline-state.mjs <path>       # specific project
 *    node scripts/check-pipeline-state.mjs --json       # machine-readable
 *
 *  Exit:
 *    0 — pipeline state successfully detected (any state)
 *    1 — pipeline not started OR critical prerequisites missing for next step
 *    2 — invocation error (no wiki/, etc)
 */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const positional = args.filter(a => !a.startsWith('-'));
const JSON_MODE = args.includes('--json');

const ROOT = path.resolve(positional[0] || process.cwd());
const WIKI = path.join(ROOT, 'wiki');

// Pipeline definition — kept в sync с .claude/skills/pipeline/SKILL.md
const STEPS = [
  {
    n: 0,
    name: 'Discover',
    invoke: '/pipeline {path}  (только если есть готовые docs / MVP в указанной папке)',
    // v4.10: Step 0 done iff _pipeline-state.md exists с classification
    detectComplete: () => fs.existsSync(path.join(WIKI, '_pipeline-state.md')),
    requires: ['wiki/_pipeline-state.md с classification documents'],
    optional: true,  // Step 0 не обязателен — green-field projects skip
  },
  {
    n: 1,
    name: 'Analyze',
    invoke: '/analyze-game (для игр) или /analyze-project (для apps) или /start (для нового проекта)',
    detectComplete: () => fs.existsSync(path.join(WIKI, '_map.md')),
    requires: ['wiki/_map.md (создаётся в Step 1)'],
  },
  {
    n: 2,
    name: 'Metrics',
    invoke: '/product-metrics',
    detectComplete: () => fs.existsSync(path.join(WIKI, 'architecture', 'metrics.md')),
    requires: ['wiki/architecture/metrics.md', 'approved D1/D7 retention targets', 'monetization narrative'],
  },
  {
    n: 3,
    name: 'Design',
    invoke: '/design-pipeline',
    detectComplete: () => {
      const designDir = path.join(WIKI, 'design');
      const planDir = path.join(WIKI, 'plan');
      if (!fs.existsSync(designDir)) return false;
      // At least 2 design documents + master plan
      const designDocs = fs.readdirSync(designDir).filter(f => f.endsWith('.md') && !f.startsWith('_'));
      const planExists = fs.existsSync(planDir) &&
        fs.readdirSync(planDir).some(f => f.includes('development-plan') || f.includes('02-'));
      return designDocs.length >= 2 && planExists;
    },
    requires: ['wiki/design/*.md (≥2 documents)', 'wiki/plan/02-development-plan.md'],
  },
  {
    n: 4,
    name: 'Build',
    invoke: '/autopilot (autonomous) или manual via /continue + skills',
    detectComplete: () => {
      // Build complete if smoke test scenarios exist + at least some sprint completed
      // Heuristic: wiki/testing.md exists с smoke tests
      const testing = path.join(WIKI, 'testing.md');
      if (!fs.existsSync(testing)) return false;
      const content = fs.readFileSync(testing, 'utf8');
      return /smoke test.*pass/i.test(content) || /sprint.*complete/i.test(content);
    },
    requires: ['working product', 'smoke tests passing per sprint', 'wiki/testing.md updated'],
  },
  {
    n: 5,
    name: 'Test',
    invoke: 'manual user testing + /improve, /polish-app, /deepen-game для итераций',
    detectComplete: () => {
      // Heuristic: testing.md mentions "ready for release" или "alpha test passed"
      const testing = path.join(WIKI, 'testing.md');
      if (!fs.existsSync(testing)) return false;
      const content = fs.readFileSync(testing, 'utf8');
      return /ready for release|alpha test passed|approved for release/i.test(content);
    },
    requires: ['user testing feedback addressed', 'floor metrics achievable in playthrough', 'no critical bugs'],
  },
  {
    n: 6,
    name: 'Release ready',
    invoke: '/release-ready {platform} + /credentials-check',
    detectComplete: () => {
      // Heuristic: deploy-log.md exists с pre-release entries OR credentials.md filled
      const deployLog = path.join(WIKI, 'deploy-log.md');
      if (!fs.existsSync(deployLog)) return false;
      const content = fs.readFileSync(deployLog, 'utf8');
      return /release-ready.*passed|credentials.*provided|pre-release.*done/i.test(content);
    },
    requires: ['validators passing per platform', 'localization complete (если applicable)', 'credentials provided (keystore, API keys, store IDs)'],
  },
  {
    n: 7,
    name: 'Release',
    invoke: '/release-{platform} или /release-all',
    detectComplete: () => {
      // Heuristic: Release/{Project}/{platform}/ exists с artifacts
      const releaseDir = path.join(ROOT, '..', 'Release');
      if (!fs.existsSync(releaseDir)) return false;
      // Check if any subfolder has files (very loose check)
      try {
        const projects = fs.readdirSync(releaseDir, { withFileTypes: true });
        for (const p of projects) {
          if (p.isDirectory()) {
            const platforms = fs.readdirSync(path.join(releaseDir, p.name), { withFileTypes: true });
            for (const plat of platforms) {
              if (plat.isDirectory()) {
                const files = fs.readdirSync(path.join(releaseDir, p.name, plat.name));
                if (files.length > 0) return true;
              }
            }
          }
        }
      } catch { return false; }
      return false;
    },
    requires: ['final builds в Release/{Project}/{platform}/', 'uploaded to store'],
  },
];

// Validate paths
if (!fs.existsSync(WIKI)) {
  if (JSON_MODE) {
    console.log(JSON.stringify({ ok: false, error: `wiki/ not found at ${WIKI}` }));
  } else {
    console.error(`✗ wiki/ not found at ${WIKI}`);
    console.error(`  Run /start или /analyze-game/project to initialize.`);
  }
  process.exit(2);
}

// Try parsing pipeline status block from wiki/_current.md
function parseExplicitStatus() {
  const currentMd = path.join(WIKI, '_current.md');
  if (!fs.existsSync(currentMd)) return null;
  const content = fs.readFileSync(currentMd, 'utf8');

  // Look for "Pipeline status" or similar section
  const statusBlock = content.match(/## (?:Pipeline status|Pipeline progress|Status pipeline)([\s\S]*?)(?=^##|\Z)/m);
  if (!statusBlock) return null;

  const lines = statusBlock[1].split('\n');
  const stepStates = [];
  for (const line of lines) {
    // Match: "- [x] Step 1 — Analyze" or "- [ ] Step 4 — Build ← здесь сейчас"
    const m = line.match(/^\s*-\s+\[([ x])\]\s+Step\s+(\d+)/);
    if (m) {
      const isCurrent = /←|здесь сейчас|in progress|here/.test(line);
      stepStates.push({
        n: parseInt(m[2]),
        complete: m[1] === 'x',
        isCurrent,
      });
    }
  }
  return stepStates.length > 0 ? stepStates : null;
}

// Detect state from filesystem
function detectFilesystemState() {
  return STEPS.map(step => ({
    n: step.n,
    complete: step.detectComplete(),
    optional: step.optional || false,
  }));
}

// Determine current step from explicit status or filesystem
function determineCurrentStep(explicitStates, fsStates) {
  // Prefer explicit if available
  if (explicitStates) {
    const marked = explicitStates.find(s => s.isCurrent);
    if (marked) return marked.n;
    const firstIncomplete = explicitStates.find(s => !s.complete);
    if (firstIncomplete) return firstIncomplete.n;
    return 7; // all done
  }
  // Fallback: first incomplete from FS
  // v4.10: skip optional steps (e.g. Step 0 — Discover) when determining "current"
  const firstIncomplete = fsStates.find(s => !s.complete && !s.optional);
  if (firstIncomplete) return firstIncomplete.n;
  return 7;
}

const explicitStates = parseExplicitStatus();
const fsStates = detectFilesystemState();
const currentStepNum = determineCurrentStep(explicitStates, fsStates);
const currentStep = STEPS.find(s => s.n === currentStepNum);

// Build report
const report = {
  ok: true,
  source: explicitStates ? 'explicit_status_block' : 'filesystem_detection',
  current_step: currentStepNum,
  current_name: currentStep?.name,
  steps: STEPS.map(s => {
    const state = explicitStates?.find(es => es.n === s.n) || fsStates.find(fs => fs.n === s.n);
    return {
      n: s.n,
      name: s.name,
      complete: state?.complete ?? false,
      is_current: s.n === currentStepNum,
    };
  }),
  next_step_invoke: currentStep?.invoke ?? null,
  next_step_requires: currentStep?.requires ?? [],
};

if (JSON_MODE) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

// Human output
console.log(`Pipeline state — ${path.relative(process.cwd(), ROOT) || '.'}`);
console.log(`(detected via: ${report.source.replace('_', ' ')})`);
console.log('');

for (const step of report.steps) {
  let mark;
  if (step.complete) mark = '✓';
  else if (step.is_current) mark = '→';
  else mark = ' ';
  const label = step.is_current ? ' ← здесь сейчас' : '';
  console.log(`  [${mark}] Step ${step.n} — ${step.name}${label}`);
}
console.log('');

if (currentStepNum === 7 && fsStates[6].complete) {
  console.log('🎉 Pipeline complete — все 7 steps done.');
  process.exit(0);
}

console.log(`Следующий: Step ${currentStepNum} — ${currentStep.name}`);
console.log(`Вызов:    ${currentStep.invoke}`);
console.log('');
console.log(`Требуется (acceptance for next step to be considered done):`);
for (const req of currentStep.requires) {
  console.log(`  - ${req}`);
}
console.log('');

// Hint about explicit status block if missing
if (!explicitStates) {
  console.log('Tip: добавь "## Pipeline status" блок в wiki/_current.md');
  console.log('     для явного tracking — это надёжнее filesystem detection.');
  console.log('');
}

process.exit(0);
