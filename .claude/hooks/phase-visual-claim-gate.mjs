/**
 * Stop hook: an assistant may not tell the user that Phase 4 is complete unless the durable
 * marker and the executable visual evidence gate both pass in the current project.
 */
import fs from 'node:fs';
import path from 'node:path';
import { validatePhase4VisualEvidence } from '../skills/status/references/phase-4-visual-evidence.mjs';

function readPayload() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
}

function lastAssistantText(payload) {
  if (typeof payload.last_assistant_message === 'string') return payload.last_assistant_message;
  if (typeof payload.message === 'string') return payload.message;
  const inline = payload.message?.content;
  if (typeof inline === 'string') return inline;
  if (Array.isArray(inline)) return inline.filter(item => item?.text).map(item => item.text).join('\n');
  if (payload.transcript_path && fs.existsSync(payload.transcript_path)) {
    try {
      const lines = fs.readFileSync(payload.transcript_path, 'utf8').trim().split(/\r?\n/u).reverse();
      for (const line of lines) {
        const item = JSON.parse(line);
        if (item.type !== 'assistant' && item.role !== 'assistant') continue;
        const content = item.message?.content || item.content;
        if (typeof content === 'string') return content;
        if (Array.isArray(content)) return content.filter(block => block?.type === 'text').map(block => block.text || '').join('\n');
      }
    } catch {}
  }
  return '';
}

function claimsPhase4Completion(text) {
  const sentences = String(text || '').split(/(?<=[.!?\n])/u);
  const positive = [
    /(?:phase|фаз[аы])\s*(?:№\s*)?4[^.!?\n]{0,100}(?:pass(?:ed)?|complete|completed|done|готов[а-яё]*|заверш[а-яё]*|сдан[а-яё]*|пройден[а-яё]*|принят[а-яё]*)/iu,
    /(?:pass(?:ed)?|complete|completed|done|готов[а-яё]*|заверш[а-яё]*|сдан[а-яё]*|пройден[а-яё]*|принят[а-яё]*)[^.!?\n]{0,80}(?:phase|фаз[аы])\s*(?:№\s*)?4/iu,
    /четв[её]рт[а-яё]*\s+фаз[а-яё]*[^.!?\n]{0,80}(?:пройден[а-яё]*|готов[а-яё]*|заверш[а-яё]*|принят[а-яё]*)/iu,
    /(?:визуал|visual(?:s)?)\s+(?:принят[а-яё]*|утвержд[а-яё]*|готов[а-яё]*|approved|accepted|pass(?:ed)?)/iu,
  ];
  const negative = /(?:\bnot\b|cannot|rejected|invalid|incorrect|false(?:ly)?|formal(?:ly)?|\bне\s|нельзя|отклон|ошибоч|ложн|формальн|ещ[её]\s+не|неправильн)/iu;
  return sentences.some(sentence => positive.some(pattern => pattern.test(sentence)) && !negative.test(sentence));
}

function projectRoot(payload) {
  const candidates = [payload.cwd, process.cwd()].filter(Boolean).map(value => path.resolve(value));
  return candidates.find(candidate => fs.existsSync(path.join(candidate, 'wiki')) || fs.existsSync(path.join(candidate, '.forge-managed.json'))) || null;
}

function output(value) {
  process.stdout.write(JSON.stringify(value));
}

const payload = readPayload();
const text = lastAssistantText(payload);
const root = projectRoot(payload);
const claimed = claimsPhase4Completion(text);

try {
  if (!root || !claimed) {
    output({ continue: true, suppressOutput: true });
  } else {
      let marker = null;
      try { marker = JSON.parse(fs.readFileSync(path.join(root, 'wiki', 'phases', 'phase-4.json'), 'utf8')); } catch {}
      const gate = validatePhase4VisualEvidence({ root });
      const markerPassed = marker?.state === 'complete' && marker?.completionGate?.status === 'passed';
      if (markerPassed && gate.ok) output({ continue: true, suppressOutput: true });
      else output({
        decision: 'block',
        reason: [
          'Нельзя заявлять пользователю, что Phase 4 завершена: executable visual gate не пройден.',
          markerPassed ? null : 'Durable marker wiki/phases/phase-4.json не имеет state=complete + passed gate.',
          ...gate.failures.slice(0, 12).map(item => `- ${item}`),
          '',
          'Открой реальные mobile/desktop PNG, исправь UI/арт, сделай новый screens-shoot capture,',
          'получи независимый visual review и повтори phase-state.mjs complete 4 со всеми evidence paths.',
        ].filter(item => item !== null).join('\n'),
      });
  }
} catch (error) {
  if (!root || !claimed) output({ continue: true, suppressOutput: true });
  else output({
    decision: 'block',
    reason: `Нельзя заявлять, что Phase 4/визуал завершены: проверка evidence аварийно завершилась и gate работает fail-closed. ${error?.message || 'Unknown visual gate error'}`,
  });
}
