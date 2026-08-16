/**
 * @file platforms/_shared/_lib/imports.mjs
 * @description Shared helpers для validator scripts that need to detect
 *              imported/required module names — including aliased forms.
 *
 *              Background (Lesson #19, v4.7.7 fix):
 *
 *              Steam validator initially looked для literal `steamworks.init(...)`
 *              calls. But user code часто aliased the import:
 *
 *                const sw = require('steamworks.js');
 *                sw.init({ ... });
 *
 *              The literal-name regex missed these legitimate inits, false-positive
 *              "STEAM-INIT-NOT-CALLED" reported. v4.7.7 fixed by extracting
 *              imported variable names first, then building init regexes from them.
 *
 *              This pattern recurs whenever a validator looks for SDK init calls.
 *              Extracted here для reuse across platforms (yandex, vk, telegram,
 *              ok, max, rustore, web, steam, vkplay).
 *
 *              Also covers ESM imports:
 *                import sw from 'steamworks.js';            // default
 *                import * as sw from 'steamworks.js';        // namespace
 *                import { init as customInit } from '...';   // named (returns alias)
 */

/**
 * Find all variable names that import a given module.
 *
 * Detects 4 forms:
 *   1. CommonJS:    const sw = require('module-name')
 *   2. ESM default:  import sw from 'module-name'
 *   3. ESM namespace: import * as sw from 'module-name'
 *   4. ESM named:     import { init } from 'module-name'  (returns 'init')
 *
 * @param {string} sourceText - Full source code text to scan
 * @param {string|RegExp} moduleNameOrPattern - Module name (string) or pattern
 *                          to match. If string, exact match. If RegExp, used as-is.
 * @returns {string[]} Array of imported names. Empty array if no imports found.
 *                     Names are unique (deduped).
 *
 * @example
 *   const text = `const sw = require('steamworks.js'); sw.init();`;
 *   detectImportedNames(text, 'steamworks.js');
 *   // → ['sw']
 *
 *   const text2 = `import yag from 'ya-games-sdk';`;
 *   detectImportedNames(text2, /ya-games(-sdk)?/);
 *   // → ['yag']
 */
export function detectImportedNames(sourceText, moduleNameOrPattern) {
  if (!sourceText || typeof sourceText !== 'string') return [];

  // Build module match pattern. Escape regex special chars if string.
  let modulePart;
  if (moduleNameOrPattern instanceof RegExp) {
    modulePart = moduleNameOrPattern.source;
  } else {
    modulePart = String(moduleNameOrPattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  const names = new Set();

  // 1. CommonJS: const|let|var X = require('module')
  const cjsRe = new RegExp(
    `(?:const|let|var)\\s+(\\w+)\\s*=\\s*require\\s*\\(\\s*['"](?:${modulePart})['"]\\s*\\)`,
    'g'
  );
  let m;
  while ((m = cjsRe.exec(sourceText)) !== null) {
    names.add(m[1]);
  }

  // 2. ESM default import: import X from 'module'
  const esmDefaultRe = new RegExp(
    `import\\s+(\\w+)\\s+from\\s+['"](?:${modulePart})['"]`,
    'g'
  );
  while ((m = esmDefaultRe.exec(sourceText)) !== null) {
    names.add(m[1]);
  }

  // 3. ESM namespace import: import * as X from 'module'
  const esmNamespaceRe = new RegExp(
    `import\\s*\\*\\s*as\\s+(\\w+)\\s+from\\s+['"](?:${modulePart})['"]`,
    'g'
  );
  while ((m = esmNamespaceRe.exec(sourceText)) !== null) {
    names.add(m[1]);
  }

  // 4. ESM named imports: import { a, b as c } from 'module'
  // Returns the binding names (a, c) — not the original export names.
  const esmNamedRe = new RegExp(
    `import\\s*\\{([^}]+)\\}\\s*from\\s+['"](?:${modulePart})['"]`,
    'g'
  );
  while ((m = esmNamedRe.exec(sourceText)) !== null) {
    const bindings = m[1].split(',');
    for (const b of bindings) {
      // "originalName as alias" → take alias
      // "name" → take name
      const trimmed = b.trim();
      const asMatch = trimmed.match(/\bas\s+(\w+)\s*$/);
      if (asMatch) {
        names.add(asMatch[1]);
      } else {
        const nameMatch = trimmed.match(/^\w+/);
        if (nameMatch) names.add(nameMatch[0]);
      }
    }
  }

  return Array.from(names);
}

/**
 * Build init-call regexes for a list of imported names.
 *
 * For each name, produces regexes для common init patterns:
 *   - name.init(
 *   - name.initialize(
 *   - name.initAPI(   (steamworks/greenworks)
 *   - name.start(     (some SDKs)
 *
 * Combine с literal patterns для default-name calls.
 *
 * @param {string[]} importedNames - Array from detectImportedNames()
 * @param {string[]} [methodNames] - Init method names. Default: ['init', 'initAPI', 'initialize', 'start']
 * @returns {RegExp[]} Array of regex patterns
 *
 * @example
 *   const names = detectImportedNames(text, 'steamworks.js');
 *   const regexes = buildInitRegexes(names, ['init', 'initAPI']);
 *   const found = regexes.some(re => re.test(text));
 */
export function buildInitRegexes(importedNames, methodNames = ['init', 'initAPI', 'initialize', 'start']) {
  const regexes = [];
  for (const name of importedNames) {
    for (const method of methodNames) {
      // Match: name.method( with whitespace tolerance
      regexes.push(new RegExp(`\\b${name}\\s*\\.\\s*${method}\\s*\\(`));
    }
  }
  return regexes;
}

/**
 * Convenience: full detection + check.
 * Tests if any init call exists for given module imports.
 *
 * @param {string} sourceText - Source code
 * @param {string|RegExp} moduleNameOrPattern - Module identifier
 * @param {string[]} [literalCalls] - Always-checked literal call patterns
 *                                    (e.g. ['steamworks.init', 'steamworksInit'])
 * @param {string[]} [methodNames] - Method names to look for (default in buildInitRegexes)
 * @returns {{found: boolean, importedNames: string[], matchedPattern: string|null}}
 */
export function hasInitCall(sourceText, moduleNameOrPattern, literalCalls = [], methodNames) {
  const importedNames = detectImportedNames(sourceText, moduleNameOrPattern);

  // Check literal patterns
  for (const literal of literalCalls) {
    const re = new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\(/g, '\\s*\\('));
    if (re.test(sourceText)) {
      return { found: true, importedNames, matchedPattern: literal };
    }
  }

  // Check aliased patterns
  const regexes = buildInitRegexes(importedNames, methodNames);
  for (const re of regexes) {
    if (re.test(sourceText)) {
      return { found: true, importedNames, matchedPattern: re.source };
    }
  }

  return { found: false, importedNames, matchedPattern: null };
}
