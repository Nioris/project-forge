#!/usr/bin/env node
/** Offline regression for evidence-bound phase completion. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadPhaseContract, validatePhaseCompletion } from '../.claude/skills/status/references/phase-completion-gate.mjs';

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
const writeBuffer = (root, rel, content) => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};
const prose = (heading, body) => `# ${heading}\n\n${(`${body} `).repeat(30)}\n`;
const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]);
const mp4 = () => { const data = Buffer.alloc(80); data.writeUInt32BE(24, 0); data.write('ftyp', 4, 'ascii'); return data; };
const zip = () => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(160)]);
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

  const russianInvented = path.join(tmp, 'russian-invented-kpi');
  write(russianInvented, 'wiki/design/brief.md', validBrief);
  write(russianInvented, 'wiki/architecture/metrics.md', validMetrics.replace('D1/D7/D30 и ARPDAU: TBD, проверенные внешние источники не получены.', 'Удержание: 15% — отраслевой ориентир.'));
  result = validatePhaseCompletion({ root: russianInvented, phase: 1, evidence: ['wiki/architecture/metrics.md', 'wiki/design/brief.md'] });
  check(!result.ok && result.failures.some(item => /KPI claim/.test(item)),
    'numeric KPI facts written in Cyrillic cannot bypass source validation');

  for (const [slug, label] of [
    ['russian-hypothesis', 'гипотеза'],
    ['russian-hypotheses', 'гипотезы'],
    ['russian-assumption', 'предположение'],
    ['english-hypothesis', 'hypothesis'],
  ]) {
    const hypothesis = path.join(tmp, slug);
    write(hypothesis, 'wiki/design/brief.md', validBrief);
    write(hypothesis, 'wiki/architecture/metrics.md', validMetrics.replace('D1/D7/D30 и ARPDAU: TBD, проверенные внешние источники не получены.', `Удержание: 15% — ${label}.`));
    result = validatePhaseCompletion({ root: hypothesis, phase: 1, evidence: ['wiki/architecture/metrics.md', 'wiki/design/brief.md'] });
    check(result.ok, `explicit ${label} label permits a numeric KPI hypothesis`);
  }

  const embeddedHypothesis = path.join(tmp, 'embedded-hypothesis');
  write(embeddedHypothesis, 'wiki/design/brief.md', validBrief);
  write(embeddedHypothesis, 'wiki/architecture/metrics.md', validMetrics.replace('D1/D7/D30 и ARPDAU: TBD, проверенные внешние источники не получены.', 'D7 retention: 15% — антигипотеза.'));
  result = validatePhaseCompletion({ root: embeddedHypothesis, phase: 1, evidence: ['wiki/architecture/metrics.md', 'wiki/design/brief.md'] });
  check(!result.ok && result.failures.some(item => /KPI claim/.test(item)),
    'a hypothesis substring inside a larger Cyrillic word is not accepted as a label');

  const russianExternalFact = path.join(tmp, 'russian-external-fact');
  write(russianExternalFact, 'wiki/design/brief.md', validBrief);
  write(russianExternalFact, 'wiki/architecture/metrics.md', validMetrics);
  write(russianExternalFact, 'wiki/research/references.md', '# Исследование\n\nРынок требует монетизацию.\n');
  result = validatePhaseCompletion({ root: russianExternalFact, phase: 1, evidence: ['wiki/architecture/metrics.md', 'wiki/design/brief.md'] });
  check(!result.ok && result.failures.some(item => /external factual line/.test(item)),
    'an uncited external-market fact written in Cyrillic is rejected');

  for (const [slug, claim] of [
    ['russian-competitors', 'Конкуренты требуют мета-прогрессию.'],
    ['russian-competitive-adjective', 'Конкурентные игры требуют мета-прогрессию.'],
    ['russian-platform-requirements', 'Требования платформы включают локализацию.'],
  ]) {
    const externalInflection = path.join(tmp, slug);
    write(externalInflection, 'wiki/design/brief.md', validBrief);
    write(externalInflection, 'wiki/architecture/metrics.md', validMetrics);
    write(externalInflection, 'wiki/research/references.md', `# Исследование\n\n${claim}\n`);
    result = validatePhaseCompletion({ root: externalInflection, phase: 1, evidence: ['wiki/architecture/metrics.md', 'wiki/design/brief.md'] });
    check(!result.ok && result.failures.some(item => /external factual line/.test(item)),
      `an uncited inflected Cyrillic external claim is rejected: ${claim}`);
  }

  const russianNegation = path.join(tmp, 'russian-external-negation');
  write(russianNegation, 'wiki/design/brief.md', validBrief);
  write(russianNegation, 'wiki/architecture/metrics.md', validMetrics);
  write(russianNegation, 'wiki/research/references.md', '# Исследование\n\n## Конкурентное поле\n\nНет проверенных внешних источников: рынок не исследован.\n');
  result = validatePhaseCompletion({ root: russianNegation, phase: 1, evidence: ['wiki/architecture/metrics.md', 'wiki/design/brief.md'] });
  check(result.ok, 'an explicit Cyrillic no-evidence statement remains valid');

  const internalRetentionHeading = path.join(tmp, 'internal-retention-heading');
  write(internalRetentionHeading, 'wiki/design/brief.md', validBrief);
  write(internalRetentionHeading, 'wiki/architecture/metrics.md', validMetrics);
  write(internalRetentionHeading, 'wiki/research/references.md', '# Research\n\nSource: https://example.com/benchmark\n\n### Retention hooks proposed\n\n- Internal mission ladder proposal.\n');
  result = validatePhaseCompletion({ root: internalRetentionHeading, phase: 1, evidence: ['wiki/architecture/metrics.md', 'wiki/design/brief.md'] });
  check(result.ok, 'an internal retention section heading is not misclassified as an external factual line');

  const uncitedRetentionFact = path.join(tmp, 'uncited-retention-fact');
  write(uncitedRetentionFact, 'wiki/design/brief.md', validBrief);
  write(uncitedRetentionFact, 'wiki/architecture/metrics.md', validMetrics);
  write(uncitedRetentionFact, 'wiki/research/references.md', '# Research\n\nUnrelated source: https://example.com/catalog\n\nRetention is 15%.\n');
  result = validatePhaseCompletion({ root: uncitedRetentionFact, phase: 1, evidence: ['wiki/architecture/metrics.md', 'wiki/design/brief.md'] });
  check(!result.ok && result.failures.some(item => /external factual line/.test(item)),
    'an unrelated document URL cannot launder an uncited retention fact on another line');

  const russianMixedClaim = path.join(tmp, 'russian-mixed-claim');
  write(russianMixedClaim, 'wiki/design/brief.md', validBrief);
  write(russianMixedClaim, 'wiki/architecture/metrics.md', validMetrics);
  write(russianMixedClaim, 'wiki/research/references.md', '# Исследование\n\nРынок: гипотеза, но требование подтверждено.\n');
  result = validatePhaseCompletion({ root: russianMixedClaim, phase: 1, evidence: ['wiki/architecture/metrics.md', 'wiki/design/brief.md'] });
  check(!result.ok && result.failures.some(item => /external factual line/.test(item)),
    'a Cyrillic hypothesis label cannot mask a positive confirmed assertion on the same line');

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

  const mixedTbd = path.join(tmp, 'mixed-tbd-claim');
  write(mixedTbd, 'wiki/design/brief.md', validBrief);
  write(mixedTbd, 'wiki/architecture/metrics.md', validMetrics);
  write(mixedTbd, 'wiki/research/references.md', '# Research\n\nLocalization: TBD (verified only for Yandex Games as a future platform).\n');
  result = validatePhaseCompletion({ root: mixedTbd, phase: 1, evidence: ['wiki/architecture/metrics.md', 'wiki/design/brief.md'] });
  check(!result.ok && result.failures.some(item => /external factual line/.test(item)),
    'TBD cannot mask an uncited positive verified/requires assertion on the same line');

  const contradictory = path.join(tmp, 'contradictory-status');
  write(contradictory, 'wiki/design/brief.md', validBrief);
  write(contradictory, 'wiki/architecture/metrics.md', `---\nstatus: qa_blocked\n---\n${validMetrics}`);
  result = validatePhaseCompletion({ root: contradictory, phase: 1, evidence: ['wiki/architecture/metrics.md', 'wiki/design/brief.md'] });
  check(!result.ok && result.failures.some(item => /blocked or draft status/.test(item)),
    'a blocked evidence document cannot coexist with a complete phase marker');

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

  const contracts = Array.from({ length: 9 }, (_, index) => loadPhaseContract(index + 1));
  check(contracts.length === 9 && contracts.every((contract, index) => contract.phase === index + 1),
    'all nine executable phase contracts load with canonical identity');
  const phaseSkills = [
    'phase-1-analyze', 'phase-2-design', 'phase-3-construct', 'phase-4-visual', 'phase-5-tech',
    'phase-6-listing', 'phase-7-test', 'phase-8-release', 'phase-9-live',
  ];
  const commandsAligned = phaseSkills.every((skill, index) => {
    const text = fs.readFileSync(path.join(ROOT, '.claude', 'skills', skill, 'SKILL.md'), 'utf8');
    const phase = index + 1;
    const match = text.match(new RegExp(`phase-state\\.mjs complete ${phase}([^\\r\\n]*)`));
    if (!match) return false;
    const args = new Set(match[1].trim().split(/\s+/).filter(Boolean));
    return contracts[index].requiredEvidence.every(item => args.has(item.path));
  });
  check(commandsAligned, 'all canonical phase skill completion commands provide their contract evidence files');

  for (let phase = 2; phase <= 9; phase += 1) {
    const irrelevant = path.join(tmp, `phase-${phase}-irrelevant`);
    write(irrelevant, 'wiki/random.md', prose('Unrelated', 'This file is real but does not prove phase completion.'));
    const rejectedIrrelevant = validatePhaseCompletion({ root: irrelevant, phase, evidence: ['wiki/random.md'] });
    check(!rejectedIrrelevant.ok && rejectedIrrelevant.failures.some(item => /requires explicit evidence/.test(item)),
      `Phase ${phase} rejects an existing but irrelevant evidence file`);
  }

  const p2 = path.join(tmp, 'phase-2-valid');
  write(p2, 'wiki/design/gdd.md', prose('GDD', 'Core loop economy retention content ladder controls UX and acceptance.'));
  write(p2, 'wiki/plan/02-development-plan.md', prose('Development plan', 'Sprint task owner acceptance verifier dependency implementation.'));
  result = validatePhaseCompletion({ root: p2, phase: 2, evidence: ['wiki/design/gdd.md', 'wiki/plan/02-development-plan.md'] });
  check(result.ok && result.contract?.phase === 2, 'Phase 2 accepts its complete GDD + development-plan contract');

  const p3 = path.join(tmp, 'phase-3-valid');
  write(p3, 'wiki/plan/02-development-plan.md', prose('Development plan', 'Implemented sprint acceptance and verifier results.'));
  write(p3, 'wiki/testing.md', prose('Testing', 'PASS playtest produced real actions and zero runtime errors.'));
  write(p3, 'WorkProgress/demo/index.html', '<!doctype html><style>canvas{display:block}</style><canvas></canvas><script>requestAnimationFrame(()=>{});</script>');
  write(p3, 'WorkProgress/demo/playtest-out/report.json', JSON.stringify({ rafAlive: true, errors: [], actions: ['clicked start'] }));
  result = validatePhaseCompletion({ root: p3, phase: 3, evidence: ['wiki/plan/02-development-plan.md', 'wiki/testing.md'] });
  check(result.ok, 'Phase 3 requires implementation plus a clean machine playtest report');
  write(p3, 'WorkProgress/demo/playtest-out/report.json', JSON.stringify({ rafAlive: true, errors: ['boom'], actions: ['clicked start'] }));
  result = validatePhaseCompletion({ root: p3, phase: 3, evidence: ['wiki/plan/02-development-plan.md', 'wiki/testing.md'] });
  check(!result.ok && result.failures.some(item => /zero runtime errors/.test(item)), 'Phase 3 rejects counterfeit PASS text when playtest JSON has errors');

  const p4 = path.join(tmp, 'phase-4-valid');
  write(p4, 'wiki/design/target-frame.md', prose('Target frame', 'Approved hierarchy palette composition typography and reference rationale.'));
  write(p4, 'assets/style/STYLE-BIBLE.md', prose('Style Bible', 'Approved visual tokens palette type scale states effects and asset rules.'));
  write(p4, 'WorkProgress/demo/styles.css', '.game{color:#fff;background:#111;padding:12px;border:2px solid #333;}'.repeat(8));
  result = validatePhaseCompletion({ root: p4, phase: 4, evidence: ['wiki/design/target-frame.md', 'assets/style/STYLE-BIBLE.md'] });
  check(result.ok, 'Phase 4 accepts approved visual documents only with integrated visual implementation');

  const p5 = path.join(tmp, 'phase-5-valid');
  write(p5, '.forge-ai.json', '{}\n');
  write(p5, 'wiki/qa/phase-5-tech.md', prose('Phase 5 technical gate', 'PASS SDK lifecycle ads mobile touch and AI configuration checks.'));
  write(p5, 'WorkProgress/demo/index.html', `<style>canvas{touch-action:none;padding-top:env(safe-area-inset-top)}</style><script>
    YaGames.init(); LoadingAPI.ready(); GameplayAPI.start(); GameplayAPI.stop();
    ysdk.adv.showRewardedVideo(); addEventListener('pointerdown',()=>{});
  </script>`);
  result = validatePhaseCompletion({ root: p5, phase: 5, evidence: ['.forge-ai.json', 'wiki/qa/phase-5-tech.md'] });
  check(result.ok, 'Phase 5 accepts only source-backed SDK/mobile/ads lifecycle evidence');

  const p6 = path.join(tmp, 'phase-6-valid');
  write(p6, 'SETUP_GUIDE.md', prose('SETUP GUIDE', 'Console upload languages listing category rating ads screenshots video checklist references.'));
  write(p6, 'wiki/qa/phase-6-listing.md', prose('Phase 6 listing gate', 'PASS listing schema screenshots promo video and i18n checks.'));
  write(p6, 'store-listing-ru.json', JSON.stringify({ lang: 'ru', title: 'Игра', subtitle: 'Короткое описание игры', description: 'Описание '.repeat(20), keywords: ['игра'] }));
  writeBuffer(p6, 'screens/store/screen-1.png', png());
  writeBuffer(p6, 'screens/video/promo.mp4', mp4());
  write(p6, 'WorkProgress/demo/app.js', `const I18N={ru:{start:'Старт'}}; function t(k){return I18N.ru[k]}`);
  result = validatePhaseCompletion({ root: p6, phase: 6, evidence: ['SETUP_GUIDE.md', 'wiki/qa/phase-6-listing.md'] });
  check(result.ok, 'Phase 6 requires listing JSON, real promo media and i18n implementation');

  const p7 = path.join(tmp, 'phase-7-valid');
  write(p7, 'wiki/testing.md', prose('Testing', 'PASS functional mobile runtime balance and persistence verification.'));
  write(p7, 'wiki/qa/phase-7-report.md', prose('Phase 7 QA', 'PASS visual QA playtest local stage and state diversity.'));
  write(p7, 'WorkProgress/demo/index.html', '<!doctype html><canvas></canvas><script>requestAnimationFrame(()=>{});</script>');
  write(p7, 'WorkProgress/demo/playtest-out/report.json', JSON.stringify({ rafAlive: true, errors: [], actions: ['clicked start'] }));
  write(p7, 'WorkProgress/demo/stage-out/rt.json', JSON.stringify({ errors: [], rt: { _readyCalled: true, _i18nRead: 'ru' } }));
  result = validatePhaseCompletion({ root: p7, phase: 7, evidence: ['wiki/testing.md', 'wiki/qa/phase-7-report.md'] });
  check(result.ok, 'Phase 7 accepts concrete reports backed by clean playtest and local-stage JSON');
  fs.mkdirSync(path.join(tmp, 'phase-7-directory', 'wiki', 'qa'), { recursive: true });
  result = validatePhaseCompletion({ root: path.join(tmp, 'phase-7-directory'), phase: 7, evidence: ['wiki/qa'] });
  check(!result.ok && result.failures.some(item => /not a regular file/.test(item)), 'Phase 7 no longer accepts a directory as completion evidence');

  const p8 = path.join(tmp, 'phase-8-valid');
  write(p8, 'wiki/deploy-log.md', prose('Deploy log', 'release-ready TOTAL: 84 pass, 0 fail, 2 warn. Manual checklist recorded.'));
  write(p8, 'SETUP_GUIDE.md', prose('SETUP GUIDE', 'Upload archive and complete the manual Console checklist after GREEN.'));
  for (const suffix of ['', '-debug', '-marketing']) writeBuffer(p8, `Release/demo/yandex/demo-v1.2.0${suffix}.zip`, zip());
  result = validatePhaseCompletion({ root: p8, phase: 8, evidence: ['wiki/deploy-log.md', 'SETUP_GUIDE.md'] });
  check(result.ok, 'Phase 8 requires exact GREEN evidence and one complete release ZIP trio');
  fs.rmSync(path.join(p8, 'Release', 'demo', 'yandex', 'demo-v1.2.0-marketing.zip'));
  result = validatePhaseCompletion({ root: p8, phase: 8, evidence: ['wiki/deploy-log.md', 'SETUP_GUIDE.md'] });
  check(!result.ok && result.failures.some(item => /ZIP trio/.test(item)), 'Phase 8 rejects an incomplete release variant set');

  const p9 = path.join(tmp, 'phase-9-valid');
  write(p9, 'wiki/metrics.md', prose('Live metrics', 'D7 plan 10% fact 9%. D30 plan 4% actual 3%. CTR and rating facts recorded.'));
  result = validatePhaseCompletion({ root: p9, phase: 9, evidence: ['wiki/metrics.md'] });
  check(result.ok, 'Phase 9 requires plan-vs-fact D7/D30 and CTR/rating evidence');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) process.exit(1);
console.log('\nPASS: phase completion is evidence-bound and early experimental checkpoints stay local');
