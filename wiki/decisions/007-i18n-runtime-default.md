---
date: 2026-04-26 (v4.7.6)
status: accepted
tags: [decision, i18n, architecture]
---

# 007: i18n foundation as default — ru+en runtime, not compile-time, not 13 languages upfront

## Context

User observation: "нет системы локализации ведь даже когда мы не для паблишинга готовим игру, сама система нужна что бы потом производить быструю локализацию".

Existing `/localize` skill solved post-fact 13-language case for Yandex Games. But architectural-level i18n was missing. Each new project from `/start` started with inline cyrillic strings. Retrofit стоил days of work.

## Options Considered

### For language count default

1. **Only `ru`** — baseline only. Pros: simplest. Cons: можно случайно захардкодить text в обход `t()` и не заметить (no language switch to test).

2. **`ru + en`** — minimal pair. Pros: forces `t()` discipline (because switching reveals missing keys). Cons: en is placeholder until proper translation.

3. **`ru + 12 Yandex languages`** — full Yandex set upfront. Pros: ready for Yandex. Cons: overkill for projects that never go to Yandex; 12 placeholder files = 12x maintenance burden.

### For implementation approach

4. **Runtime** — `src/i18n/{lang}.ts` exports object, `t('key')` looks up at runtime. Pros: simple, hot-swap works. Cons: typing requires careful TypeScript const assertions.

5. **Compile-time via plugin** — `vite-plugin-i18n` or similar. Pros: typed keys, smaller bundle. Cons: build step config dependency, harder to debug.

### For key catalog approach

6. **Upfront catalog** — pre-define 200+ keys at project start. Pros: comprehensive. Cons: guess work, dead keys, premature.

7. **Discovery-driven** — add keys as they appear in code. Pros: no waste. Cons: easy to forget adding to all language files (mitigated by const assertion making it compile error).

## Decision

**`ru + en` + Runtime + Discovery-driven keys.**

Rationale:
- **ru + en**: minimal pair sufficient to reveal "I forgot to add this key" bugs. Yandex 13-lang добавляется через `/localize` later когда время релиза.
- **Runtime**: тsconfig strict + типизированные dictionaries дают type-safety без специальных плагинов. Hot-swap works из коробки. Less moving parts.
- **Discovery-driven keys**: const assertion в `types.ts` makes forgotten keys compile-time errors — no upfront waste, no silent drift.

Created skill `/i18n-foundation` to lay structure С НУЛЯ:
- `src/i18n/{index.ts, types.ts, ru.ts, en.ts, data.ru.ts, data.en.ts, detect.ts}`
- `scripts/check-inline-strings.mjs` — gate against cyrillic literals outside `src/i18n/`
- Integration: `/start` Step 6.5 = MANDATORY for new projects (opt-out via explicit user request)

Critical patterns enforced in skill:
- `var _activeLang` (NOT `let`) — exposes `window._lang` for cheat panels and Yandex screenshotter
- `setLang()` always triggers re-render via listener pattern
- Template substitution `'День {0}'` (NOT concat) — handles morphological cases
- `detectLang()` BEFORE UI initialization (Yandex moderation проверяет first-paint language)

## Consequences

- **Pro**: New projects start with proper i18n architecture. Day-1 cost ~30min, infinite savings later.
- **Pro**: `check-inline-strings.mjs` catches drift if developer forgets `t()` wrapping.
- **Pro**: Adding 11 more languages (для Yandex) becomes mechanical — just create more `*.ts` files following existing template.
- **Con**: 30min upfront cost for projects that never need localization.
- **Con**: Two-language setup feels more complex than one-language for tiny projects.

Lesson #26: Architectural skills (i18n-foundation) отличаются от tactical skills (localize). Architectural должны auto-invoke из `/start`. Pattern для других architectural skills (auth, error-boundary, save-system) — to be applied in v4.8.
