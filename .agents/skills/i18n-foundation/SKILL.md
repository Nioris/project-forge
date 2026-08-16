---
name: i18n-foundation
kind: architectural
description: "Заложи i18n архитектуру С НУЛЯ — даже если игра/приложение пока на одном русском. Создаёт src/i18n/ structure (ru + en placeholder), t()/td() API, language detection, hot-swap…"
---

# i18n Foundation — заложить структуру с нуля

## Когда использовать

- **Новый проект** — после `$start` инициализирует scaffold, до того как написана логика
- **Existing проект без i18n** — retrofit когда видно что технический долг растёт (50+ inline литералов)
- **Перед $localize 13 языков** — `$localize` ожидает что foundation уже есть. Без него $localize начнёт с поиска "где у вас inline strings?" и потеряется.

## Принцип

**i18n — это архитектурная инвестиция, не post-fact работа.** Даже если проект только на русском языке без планов на публикацию:

1. Любая HTML5/TS игра в 2026 имеет шанс уйти на Yandex Games / VK / Telegram → 13 языков для Yandex обязательны
2. Hot-swap языков — единственный способ протестировать что layout не ломается с длинными немецкими строками
3. `t('hud.day')` всегда дешевле чем `'ДЕНЬ'` потому что **дисциплинирует**: разработчик не пишет string в 5 мест где он должен быть в одном

## Что создаёт skill

```
src/i18n/
  index.ts       # API: t(), td(), setLang(), detectLang(), onLangChange()
  ru.ts          # UI strings — baseline (most complete)
  en.ts          # UI strings — placeholder (can start as copy of ru, fix later)
  data.ru.ts     # Game-data strings (имена карт/врагов/построек/ресурсов)
  data.en.ts     # Game-data strings — placeholder
  types.ts       # Type-safe keys via const assertion
  detect.ts      # Browser language → fallback chain → 'ru'

scripts/
  check-inline-strings.mjs   # Gate против inline-литералов
```

И **patches existing code** — все inline strings оборачивает в `t()` / `td()`.

## Структура runtime

### `src/i18n/index.ts` (core API)

```typescript
import { type Lang, type UIKeys, RU, EN } from './ru';
import { DATA_RU } from './data.ru';
import { DATA_EN } from './data.en';
import { detectLang } from './detect';

const DICTIONARIES: Record<Lang, UIKeys> = { ru: RU, en: EN };
const DATA_DICTS: Record<Lang, typeof DATA_RU> = { ru: DATA_RU, en: DATA_EN };

// IMPORTANT: var not let — exposes window._lang for cheat-panel and screenshot tools
declare global { interface Window { _lang: Lang } }
var _activeLang: Lang = detectLang();

const listeners: Set<() => void> = new Set();

export function t(key: keyof UIKeys, ...args: (string | number)[]): string {
  const dict = DICTIONARIES[_activeLang] ?? DICTIONARIES.ru;
  let template = dict[key] ?? DICTIONARIES.ru[key] ?? key;  // fallback chain: active → ru → key itself
  // Substitution: 'Day {0}' + ['5'] → 'Day 5'
  return args.reduce<string>((acc, arg, i) => acc.replace(`{${i}}`, String(arg)), template);
}

export function td(dataKey: keyof typeof DATA_RU): string {
  const dict = DATA_DICTS[_activeLang] ?? DATA_DICTS.ru;
  return dict[dataKey] ?? DATA_DICTS.ru[dataKey] ?? String(dataKey);
}

export function getLang(): Lang { return _activeLang; }

export function setLang(lang: Lang): void {
  if (!DICTIONARIES[lang]) {
    console.warn(`[i18n] unsupported lang: ${lang}, falling back to ru`);
    lang = 'ru';
  }
  _activeLang = lang;
  if (typeof window !== 'undefined') window._lang = lang;
  listeners.forEach(fn => { try { fn(); } catch (e) { console.error('[i18n] listener error', e); } });
}

export function onLangChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Auto-init on module load
if (typeof window !== 'undefined') window._lang = _activeLang;
```

### `src/i18n/types.ts`

```typescript
export type Lang = 'ru' | 'en';

// Single source of truth for all UI string keys.
// Adding a key here forces every language file to provide it.
export const UI_KEYS = {
  // Common
  loading: 'loading',
  retry: 'retry',
  ok: 'ok',
  cancel: 'cancel',

  // HUD
  'hud.day': 'hud.day',
  'hud.boss_progress': 'hud.boss_progress',
  'hud.hand': 'hud.hand',

  // Screens
  'screen.menu': 'screen.menu',
  'screen.game': 'screen.game',
  'screen.victory': 'screen.victory',
  'screen.defeat': 'screen.defeat',

  // Settings
  'settings.title': 'settings.title',
  'settings.lang': 'settings.lang',
  'settings.sound': 'settings.sound',

  // Add as you go — discovery-driven, not big upfront catalog
} as const;

export type UIKey = keyof typeof UI_KEYS;
```

### `src/i18n/ru.ts` (baseline)

```typescript
import type { UIKey } from './types';

export type UIKeys = Record<UIKey, string>;

export const RU: UIKeys = {
  loading: 'Загрузка...',
  retry: 'Повторить',
  ok: 'ОК',
  cancel: 'Отмена',

  'hud.day': 'ДЕНЬ {0}',
  'hud.boss_progress': 'БОСС',
  'hud.hand': 'РУКА',

  'screen.menu': 'МЕНЮ',
  'screen.game': 'ИГРА',
  'screen.victory': 'ПОБЕДА',
  'screen.defeat': 'ПОРАЖЕНИЕ',

  'settings.title': 'НАСТРОЙКИ',
  'settings.lang': 'Язык',
  'settings.sound': 'Звук',
};

export type { Lang } from './types';
export { type UIKeys };
```

### `src/i18n/en.ts` (placeholder — start as copy or machine-translate)

```typescript
import type { UIKeys } from './types';

export const EN: UIKeys = {
  loading: 'Loading...',
  retry: 'Retry',
  ok: 'OK',
  cancel: 'Cancel',

  'hud.day': 'DAY {0}',
  'hud.boss_progress': 'BOSS',
  'hud.hand': 'HAND',

  'screen.menu': 'MENU',
  'screen.game': 'GAME',
  'screen.victory': 'VICTORY',
  'screen.defeat': 'DEFEAT',

  'settings.title': 'SETTINGS',
  'settings.lang': 'Language',
  'settings.sound': 'Sound',
};
```

### `src/i18n/data.ru.ts` (game-content strings)

```typescript
// Card/enemy/building names — separated from UI because:
// 1) Yandex localization translates UI but data may stay in original
// 2) Different cadence — UI changes often, data names stable
export const DATA_RU = {
  // Cards
  'card.rock': 'Скала',
  'card.forest': 'Лес',
  'card.meadow': 'Луг',
  'card.cemetery': 'Кладбище',

  // Enemies
  'enemy.slime': 'Слизь',
  'enemy.skeleton': 'Скелет',
  'enemy.spider': 'Паук',
  'enemy.boss_lord_loop': 'Лорд Петли',

  // Resources
  'res.branch': 'Ветка',
  'res.memory_fragment': 'Фрагмент памяти',

  // Buildings
  'building.altar': 'Алтарь',
  'building.workshop': 'Мастерская',

  // Add as you go
} as const;
```

### `src/i18n/detect.ts`

```typescript
import type { Lang } from './types';

const SUPPORTED: Lang[] = ['ru', 'en'];

// Yandex Games-aligned fallback rules:
// - be/kk/uk/uz → ru (cyrillic family preference)
// - everything else → en (lingua franca)
const FALLBACK_TO_RU = ['be', 'kk', 'uk', 'uz'];

export function detectLang(): Lang {
  // Priority 1: explicit user preference (localStorage / URL param)
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('lang');
    if (saved && SUPPORTED.includes(saved as Lang)) return saved as Lang;

    const urlParam = new URLSearchParams(window.location.search).get('lang');
    if (urlParam && SUPPORTED.includes(urlParam as Lang)) return urlParam as Lang;
  }

  // Priority 2: platform-specific (Yandex SDK provides this)
  // This is overridden in platform/yandex.ts when YSDK is available:
  //   const lang = ysdk.environment.i18n.lang;  // 'ru', 'en', 'tr', etc.

  // Priority 3: navigator.language
  if (typeof navigator !== 'undefined' && navigator.language) {
    const browserLang = navigator.language.toLowerCase().split('-')[0];
    if (SUPPORTED.includes(browserLang as Lang)) return browserLang as Lang;
    if (FALLBACK_TO_RU.includes(browserLang)) return 'ru';
  }

  // Priority 4: default
  return 'ru';
}
```

## Integration в существующий код

### Bootstrap (main.ts)

```typescript
import { setLang, detectLang, onLangChange } from './i18n';

const initialLang = detectLang();
setLang(initialLang);

// Re-render game on language change (critical for Yandex screenshot tool!)
onLangChange(() => {
  rerenderUI();      // your render function
});
```

### Replacing inline strings

**Before:**
```typescript
hudText.text = 'ДЕНЬ ' + day;
buttonLabel.text = 'РУКА';
enemyName.text = 'Скелет';
```

**After:**
```typescript
import { t, td } from './i18n';

hudText.text = t('hud.day', day);    // 'ДЕНЬ {0}' interpolated
buttonLabel.text = t('hud.hand');
enemyName.text = td('enemy.skeleton');
```

## Gate против regressions: `scripts/check-inline-strings.mjs`

```javascript
#!/usr/bin/env node
/**
 * @file check-inline-strings.mjs
 * @description Scan src/ for cyrillic literals NOT inside i18n/ folder.
 *              Cyrillic in code OUTSIDE src/i18n/ = inline string = i18n violation.
 *              Returns exit 1 if any found, 0 if clean.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] || '.');
const CYRILLIC = /[А-Яа-яЁё]/;

function walk(dir, exts = ['.ts', '.tsx', '.js', '.jsx']) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'i18n') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full, exts));
    else if (exts.some(x => e.name.endsWith(x))) out.push(full);
  }
  return out;
}

const violations = [];
for (const file of walk(path.join(ROOT, 'src'))) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const stripped = line.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '');
    // Match string literals: 'foo', "foo", `foo`
    const literals = stripped.match(/(['"`])([^'"`\\]|\\.)*?\1/g) || [];
    for (const lit of literals) {
      if (CYRILLIC.test(lit)) {
        violations.push({ file: path.relative(ROOT, file), line: i + 1, literal: lit.slice(0, 60) });
      }
    }
  });
}

if (violations.length === 0) {
  console.log('✓ No inline cyrillic strings in src/ (excluding i18n/)');
  process.exit(0);
}

console.log(`✗ ${violations.length} inline string violations:\n`);
for (const v of violations.slice(0, 30)) {
  console.log(`  ${v.file}:${v.line}  ${v.literal}`);
}
if (violations.length > 30) console.log(`  ... and ${violations.length - 30} more`);
console.log('\nFix: wrap with t() or td(). Add key to src/i18n/types.ts and ru.ts/en.ts.');
process.exit(1);
```

## Pipeline

### For NEW project (called from `$start` Phase 1.5):

1. Create `src/i18n/` structure (6 files above)
2. Add `import { t, td, setLang, detectLang, onLangChange } from './i18n'` to `main.ts`
3. Add `setLang(detectLang())` to bootstrap
4. Add `onLangChange(() => rerenderUI())` to bootstrap
5. Create `scripts/check-inline-strings.mjs` (above)
6. **Stop, ask user:** "i18n foundation готов. Начинать писать код игры — все строки через t() / td(). Согласен?"

### For EXISTING project (retrofit):

1. Run inventory scan: `grep -nrE "[А-Яа-яЁё]" src/ --include='*.ts' --include='*.tsx' | grep -v 'i18n/'`
2. Categorize findings:
   - **UI strings** (HUD labels, button text, screen titles) → ui keys in `types.ts` + ru/en
   - **Data strings** (names of cards/enemies/buildings) → DATA_RU/DATA_EN
   - **Comments** (cyrillic comments, OK to keep) → skip
3. Create `src/i18n/` structure with **all found strings** as initial keys
4. **Stop, show user the proposed dictionary.** Ask approval before proceeding.
5. Replace inline strings file-by-file (commit per file ideally)
6. After each file: run `node scripts/check-inline-strings.mjs` — should decrease until 0
7. **Stop after every 5 files** — show progress, get approval to continue

## Validation checks

После завершения:

```bash
# Должно показать ✓
node scripts/check-inline-strings.mjs

# Должно показать что setLang работает
# (manually toggle in cheat panel: window._lang = 'en'; rerenderUI())
```

## Что НЕ делает skill

- **Не переводит на en качественно** — placeholder либо machine translation. Для production-quality EN — `$localize` + human review.
- **Не сразу 13 языков для Yandex** — это `$localize` job когда уже время релиза. `$i18n-foundation` фокусируется на **архитектуре**, не контенте.
- **Не покрывает image-baked text** — спрайты с текстом нужно либо переделать в HTML overlay, либо иметь N версий спрайтов per-lang. Это вне scope.
- **Не trtouch'ает comments** — cyrillic comments OK, валидатор их пропускает.

## Common pitfalls

1. **`let` instead of `var` для `_activeLang`** — `let` не создаёт `window._lang`, что ломает Yandex screenshotter и cheat panels. Use `var`.

2. **`setLang()` не вызывает re-render** — переключение происходит в memory, но screen не обновляется до следующего frame. **Всегда** вызывай `rerenderUI()` (или эквивалент) в `onLangChange` callback.

3. **`detectLang()` ПОСЛЕ загрузки игры** — Yandex moderation проверяет: при открытии на турецком домене UI **сразу** на турецком. `setLang(detectLang())` должен быть первым step в bootstrap, до loading screen.

4. **Конкатенация вместо template substitution** — `'День ' + day` вместо `t('hud.day', day)` со template `'День {0}'`. Конкатенация ломает языки где числа другой синтаксис (e.g. русский родительный падеж: "1 день / 2 дня / 5 дней").

5. **Сразу попытка покрыть все будущие keys** — overhead. Better: discovery-driven. Добавляй keys по мере появления текста.

## Related skills

- `$localize` — после foundation, добавление 11 дополнительных языков для Yandex Games
- `$start` — Phase 1.5 теперь автоматически вызывает `$i18n-foundation` для новых проектов
- `$analyze-game`, `$analyze-project` — отчёт включает i18n status, recommend foundation если ≥50 inline strings

## Non-Negotiable

- [ ] `var _activeLang`, не `let`
- [ ] `window._lang` exposed для tools
- [ ] `setLang()` ВСЕГДА вызывает re-render через `onLangChange` listeners
- [ ] `detectLang()` runs ПЕРЕД любой UI initialization
- [ ] `check-inline-strings.mjs` запускается в build pipeline (через `$gate`)
- [ ] Comments в cyrillic — ОК, не трогать
- [ ] Default: `ru + en` минимум. `ru-only` setup допустим но не рекомендован
- [ ] Discovery-driven keys — не пытайся upfront catalog of 200 keys
- [ ] Stop после каждого крупного refactor блока (5 файлов)
