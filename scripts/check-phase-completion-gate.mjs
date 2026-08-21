#!/usr/bin/env node
/** Offline regression for evidence-bound phase completion. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { validatePhaseCompletion } from '../.claude/skills/status/references/phase-completion-gate.mjs';

const ROOT = process.cwd();
const phaseState = path.join(ROOT, '.claude', 'skills', 'status', 'references', 'phase-state.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-phase-gate-'));
const failures = [];
const check = (condition, message) => {
  console.log(`  ${condition ? '✓' : '✗'} ${message}`);
  if (!condition) failures.push(message);
};
const write = (root, rel, content) => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
};
const validBrief = `# Бриф проекта

## Аудитория
**Возраст:** 12+
**Кто это:** игроки коротких браузерных сессий
**Следствия:** быстрый темп, минимум текста

## Амбиция
**Масштаб:** MVP за две недели
**Следствия для скоупа:** только исходный GDD

## Обещание игры
**Что игрок должен почувствовать:** ещё один рискованный поворот ради рекорда

## Отличие
**Чем не такая, как похожие в каталоге:** точное сенсорное управление

## История
**Что уже пробовал, что не сработало:** исходного прототипа нет
`;
const validMetrics = `# Метрики

D1/D7/D30 и ARPDAU: TBD, проверенные внешние источники не получены.

## Контент-бюджет
| Горизонт | Есть | Дефицит |
|---|---|---|
| MVP | GDD | Реализация и проверка |

- [ ] Игра открывается и играбельна.
`;

try {
  console.log('Project Forge phase completion gate audit');
  console.log('─────────────────────────────────────────');

  const missing = validatePhaseCompletion({ root: tmp, phase: 1, evidence: ['wiki/architecture/metrics.md'] });
  check(!missing.ok && missing.failures.some(item => /brief\.md/.test(item)), 'Phase 1 rejects missing canonical evidence');

  const placeholder = path.join(tmp, 'placeholder');
  write(placeholder, 'wiki/design/brief.md', '# Brief\nДата: <дата>\nЗаполняется в фазе 1\n');
  write(placeholder, 'wiki/architecture/metrics.md', validMetrics);
  let result = validatePhaseCompletion({ root: placeholder, phase: 1, evidence: ['wiki/architecture/metrics.md', 'wiki/design/brief.md'] });
  check(!result.ok && result.failures.some(item => /template/.test(item)), 'untouched Phase 1 brief cannot become durable completion evidence');

  const invented = path.join(tmp, 'invented-kpi');
  write(invented, 'wiki/design/brief.md', validBrief);
  write(invented, 'wiki/architecture/metrics.md', validMetrics.replace('D1/D7/D30 и ARPDAU: TBD, проверенные внешние источники не получены.', 'D7 retention: 15% (industry benchmark).'));
  result = validatePhaseCompletion({ root: invented, phase: 1, evidence: ['wiki/architecture/metrics.md', 'wiki/design/brief.md'] });
  check(!result.ok && result.failures.some(item => /KPI claim/.test(item)), 'numeric KPI facts require a URL citation or hypothesis label');

  const falseAcceptance = path.join(tmp, 'false-acceptance');
  write(falseAcceptance, 'wiki/design/brief.md', validBrief);
  write(falseAcceptance, 'wiki/architecture/metrics.md', validMetrics.replace('- [ ] Игра открывается', '- [x] Игра открывается'));
  result = validatePhaseCompletion({ root: falseAcceptance, phase: 1, evidence: ['wiki/architecture/metrics.md', 'wiki/design/brief.md'] });
  check(!result.ok && result.failures.some(item => /no implementation source/.test(item)), 'unbuilt runtime acceptance cannot be marked complete');

  const laundered = path.join(tmp, 'laundered-research');
  write(laundered, 'wiki/design/brief.md', validBrief);
  write(laundered, 'wiki/architecture/metrics.md', validMetrics);
  write(laundered, 'wiki/research/references.md', '# Research\n\nNo verified external sources found.\n\n### Historical reference: Nokia Snake (1998)\n- Slither.io is a modern multiplayer variant.\n');
  result = validatePhaseCompletion({ root: laundered, phase: 1, evidence: ['wiki/architecture/metrics.md', 'wiki/design/brief.md'] });
  check(!result.ok && result.failures.some(item => /external factual line/.test(item)),
    'a document-level no-source disclaimer cannot launder uncited external facts below it');

  const rejected = spawnSync(process.execPath, [phaseState, 'complete', '1', 'wiki/architecture/metrics.md', 'wiki/design/brief.md'], { cwd: invented, encoding: 'utf8' });
  const rejectedMarker = JSON.parse(fs.readFileSync(path.join(invented, 'wiki', 'phases', 'phase-1.json'), 'utf8'));
  check(rejected.status !== 0 && rejectedMarker.state === 'blocked' && !fs.existsSync(path.join(invented, '.git')),
    'a rejected completion writes blocked state and performs no Git checkpoint');

  const valid = path.join(tmp, 'valid');
  write(valid, 'wiki/design/brief.md', validBrief);
  write(valid, 'wiki/architecture/metrics.md', validMetrics);
  write(valid, '.forge/agent.json', JSON.stringify({ agent: 'openrouter', model: 'openrouter/qwen/qwen3-coder-next', locked: true }));
  write(valid, '.forge-git.json', JSON.stringify({ github: { enabled: true, owner: 'Nioris', visibility: 'private', autoCreate: true, autoPush: true } }));
  const accepted = spawnSync(process.execPath, [phaseState, 'complete', '1', 'wiki/architecture/metrics.md', 'wiki/design/brief.md'], { cwd: valid, encoding: 'utf8' });
  const acceptedMarker = JSON.parse(fs.readFileSync(path.join(valid, 'wiki', 'phases', 'phase-1.json'), 'utf8'));
  check(accepted.status === 0 && acceptedMarker.state === 'complete' && acceptedMarker.completionGate?.status === 'passed',
    'valid evidence passes and records the mechanical gate result');
  check(/private remote deferred until Phase 8/.test(accepted.stdout) && fs.existsSync(path.join(valid, '.git')),
    'experimental whole-project host keeps early checkpoints local until Phase 8');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) process.exit(1);
console.log('\nPASS: phase completion is evidence-bound and early experimental checkpoints stay local');
