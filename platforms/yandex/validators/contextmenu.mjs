// scripts/validators/contextmenu.mjs
// REQ-1.6.2.7: interaction with the game area must not produce text selection or context menu.
// Source: п. 1.6.2.7
// "Взаимодействие с внутренним полем игры не приводит к выделению поля или открытию контекстного меню"
//
// Past rejection: Metro v3.0 had handler attached to "#G" only — moderator triggered ПКМ
// outside that element and saw the system menu. Required: handler on document.

import path from 'node:path';
import { LEVELS, resolveGamePaths, walkFiles, readTextSafe, runCli, isMain } from './_lib.mjs';

export const ID = 'contextmenu';
export const REQUIREMENTS = ['REQ-1.6.2.7'];
export const URL = 'https://yandex.ru/dev/games/doc/ru/concepts/requirements';
export const CITATION = '"Взаимодействие с внутренним полем игры не приводит к выделению поля или открытию контекстного меню" (1.6.2.7)';

export function validate(gamePath) {
  const { workPath } = resolveGamePaths(gamePath);
  const issues = [];

  const jsFiles = walkFiles(workPath, ['.js', '.html']);
  let foundDocumentHandler = false;
  let foundLocalHandler = null;
  let foundSelectStart = false;

  for (const file of jsFiles) {
    const text = readTextSafe(file);
    if (!text) continue;

    // Pattern 1: document.addEventListener('contextmenu', ...)
    if (/document\s*\.\s*addEventListener\s*\(\s*['"]contextmenu['"]/i.test(text) ||
        /document\s*\.\s*oncontextmenu\s*=/i.test(text)) {
      foundDocumentHandler = true;
    }

    // Pattern 2: <element>.addEventListener('contextmenu', ...)
    // Match a non-document target.
    const localRe = /(\w+(?:\s*\.\s*\w+)*)\s*\.\s*addEventListener\s*\(\s*['"]contextmenu['"]/g;
    let lm;
    while ((lm = localRe.exec(text)) !== null) {
      const target = lm[1].trim();
      if (target !== 'document' && target !== 'window' && !/^document\./.test(target) && !/^window\./.test(target)) {
        if (!foundLocalHandler) {
          const lineNo = text.slice(0, lm.index).split('\n').length;
          foundLocalHandler = { file, target, line: lineNo };
        }
      }
    }

    // Pattern 3: selectstart prevention (related to "выделение поля")
    if (/document\s*\.\s*addEventListener\s*\(\s*['"]selectstart['"]/i.test(text) ||
        /user-select\s*:\s*none/.test(text) ||
        /\.style\.userSelect\s*=\s*['"]none['"]/.test(text)) {
      foundSelectStart = true;
    }
  }

  if (!foundDocumentHandler) {
    issues.push({
      id: 'REQ-1.6.2.7', level: LEVELS.BLOCKER,
      message: 'No document-level contextmenu handler. Right-click anywhere on the page will show system menu.',
      citation: CITATION, url: URL, file: workPath
    });
    if (foundLocalHandler) {
      issues.push({
        id: 'REQ-1.6.2.7', level: LEVELS.INFO,
        message: 'Found local handler on "' + foundLocalHandler.target + '" — extend it to document. Past rejection (Metro v3.0): handler was on #G only.',
        url: URL, file: foundLocalHandler.file, line: foundLocalHandler.line
      });
    }
  }

  if (!foundSelectStart) {
    issues.push({
      id: 'REQ-1.6.2.7', level: LEVELS.WARNING,
      message: 'No text-selection prevention (CSS user-select:none OR JS selectstart preventDefault). Long-press / drag may select UI text.',
      citation: CITATION, url: URL, file: workPath
    });
  }

  return issues;
}

if (isMain(import.meta.url)) {
  runCli({ ID, validate });
}
