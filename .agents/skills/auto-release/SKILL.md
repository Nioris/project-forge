---
name: auto-release
kind: tactical
description: "Autonomous release workflow via Claude Code /goal (v2.1.139+). Sets persistent goal 'release-ready returns GREEN for {platform}', Claude iterates fix→validate→fix until все…"
---

# Auto-Release — Hands-Free Release Workflow

## When to use

Когда у тебя есть готовая игра/приложение и нужно довести её до моде́рации **без сидения над процессом**. Ты задаёшь "пусть всё будет зелёное для Яндекса", уходишь делать чай — возвращаешься через 30-60 минут, в идеале всё сделано.

**Don't use:**
- Если игра ещё в разработке (фичи не закончены) — это release workflow, не feature workflow
- Если хочешь видеть каждый шаг (используй `$release-ready` без auto loop)
- Если Claude Code < v2.1.139 (нет `/goal`)

## Requirements

- **Claude Code v2.1.139+** — `/goal` команда. Проверь: `claude --version` (актуальная — 2.1.153+)
- **Puppeteer installed** — `npm install puppeteer` один раз в проекте
- **WorkProgress/{Project}-<platform>/** существует с built code
- **StoreData/** существует с store-listing-{lang}.json для всех целевых языков

💡 **Effort (Opus 4.8):** для unattended fix→validate loop запусти `/effort xhigh` перед `/goal`
— это даёт модели больше бюджета на разбор validator-фейлов за turn. Opus 4.8 и так дефолтит на
high; `xhigh` оправдан для долгих release-петель.

## How it works

Skill оборачивается над Claude Code's `/goal` command (released 12 May 2026 в v2.1.139). Goal command:

1. Принимает completion condition
2. Запускает turn с condition как directive
3. После каждого turn — independent evaluator (Haiku) проверяет condition
4. If not met — Claude continues с next turn автоматически
5. If met — goal clears, control returns к user

`$auto-release` использует это для release readiness loop: condition = "all release validators GREEN".

## Process

### Step 0 — Verify prerequisites

```bash
# Check Claude Code version
claude --version
# Должна быть 2.1.139 или выше. Иначе:
# npm install -g @anthropic-ai/claude-code@latest

# Check puppeteer
ls node_modules/puppeteer 2>/dev/null || echo "Run: npm install puppeteer"

# Check project state
ls WorkProgress/*-yandex/ 2>/dev/null
ls StoreData/store-listing-*.json 2>/dev/null
```

If any prerequisite missing — fix first, не запускай `/goal`.

### Step 1 — Determine platform target

If user said "Яндекс" / "Yandex" — target = `yandex`.
If user said "RuStore" — target = `rustore`.
If user said "все" / "all" — invoke `$release-all` instead (it sequences platforms).

For each platform, validators chain is different. See "Validator chains per platform" below.

### Step 2 — Construct /goal command

For Yandex (most common):

```
/goal release-ready returns GREEN для yandex platform: runtime-test.mjs exits 0 (startup/lang/assets/dom/sdk scenarios pass), check-store-listing.mjs exits 0 (no forbidden fields, schema valid), check-setup-guide.mjs exits 0 (17 sections, no invalid tags/categories), check-platform-completeness.mjs reports yandex PERFECT
```

For RuStore:

```
/goal release-ready returns GREEN for rustore: check-store-listing.mjs exits 0, check-platform-completeness.mjs reports rustore PERFECT, RuStore-specific compliance verified (icon background fill, no app imitation)
```

### Step 3 — Set token / iteration budget

Long auto-loops могут быть expensive. Default Claude Code runaway guard = 500 stop-hook continuations. Для release work, usually нужно 10-50 turns. Recommend:

```bash
export CLAUDE_GOAL_MAX_STOP_CONTINUES=100
```

Set перед launching Claude Code. 100 это generous для release loop, prevents true runaway.

### Step 4 — Run goal

```
/goal {condition from Step 2}
```

Claude начнёт работать. Indicator `◎ /goal active` покажет elapsed time. After каждый turn — Haiku evaluator проверит condition.

### Step 5 — Monitor (optional)

Юзер может уйти. Если хочется проверить статус:

```
/goal
```

(без argument) → покажет turns, tokens spent so far + latest evaluator reason.

Pause:
```
/goal pause
```

Resume:
```
/goal resume
```

Cancel:
```
/goal clear
```

### Step 6 — Completion

When all validators GREEN → `/goal` clears automatically. Claude returns control к user с summary:
- Total turns spent
- Tokens consumed
- Files modified
- Final validator status

User теперь имеет release-ready build. Next step: `$release-yandex` (или manual upload к Yandex Console).

## Validator chains per platform

### Yandex

```
1. runtime-test.mjs WorkProgress/{Project}-yandex/ --scenarios=startup,lang,assets,dom,sdk
   → exit 0 required
2. check-store-listing.mjs StoreData/
   → exit 0, all store-listing-{lang}.json valid
3. check-setup-guide.mjs Release/{Project}/yandex/
   → exit 0, 17 sections, valid tags/categories из reference
4. check-platform-completeness.mjs --platform=yandex
   → PERFECT (all required artifacts present)
```

### RuStore

```
1. check-platform-completeness.mjs --platform=rustore
2. check-store-listing.mjs StoreData/  (if has listings)
3. APK или TWA wrapper built (build-apk skill must have run)
4. Icon meets RuStore rule 6.4 (full background fill)
```

### VK Play / Telegram / Steam

Each имеет own validator chain. Skill should read `release-{platform}/SKILL.md` для understanding what GREEN means для that platform.

## Anti-patterns

❌ **Don't use /goal для feature work.** Goal evaluator checks "is the condition met?". Если condition = "implement onboarding flow with 5 screens" — evaluator не может definitively judge "done". Use /goal для **measurable** conditions like exit codes, file existence, test counts.

❌ **Don't set vague conditions.** "Make the game ready" — evaluator can't check. "release-ready returns GREEN for yandex" — evaluator runs the command, checks exit code.

❌ **Don't skip prerequisites check.** If puppeteer не installed, runtime-test silently passes (skipped). Goal completes без actually testing runtime. Worthless GREEN.

❌ **Don't run /goal на untested code.** First do manual `$release-ready` → see what's RED → THEN /goal к auto-fix loop. Otherwise Claude может flounder на nothing-obvious issues.

❌ **Don't forget to set MAX_STOP_CONTINUES.** Default 500 turns × ~5K tokens per turn = potentially 2.5M tokens before runaway stops. Set 50-100 для release loops.

## Example session

```
User: $auto-release yandex
AI:   [reads skill]
      [verifies Claude Code v2.1.139+]
      [verifies puppeteer installed]
      [checks WorkProgress/Samogonshchik-yandex/ exists]
      [checks StoreData/store-listing-*.json present]
      
      Готов запустить auto-release loop. Цель:
      "release-ready returns GREEN для yandex"
      
      Budget: 100 turns max (set CLAUDE_GOAL_MAX_STOP_CONTINUES=100)
      
      Запускаю...
      
      /goal release-ready возвращает GREEN для yandex platform: 
      runtime-test.mjs exits 0 (все 5 scenarios pass), check-store-listing.mjs 
      exits 0, check-setup-guide.mjs exits 0, check-platform-completeness.mjs 
      reports yandex PERFECT

[Turn 1] Claude runs check-store-listing.mjs → 3 violations found 
         (forbidden field _comment в store-listing-tr.json, missing keywords в ru, lang="EN")
         Claude fixes all 3 → re-runs → PASS
         
[Turn 2] Claude runs runtime-test.mjs --scenarios=lang → FAIL
         (47 cyrillic leaks после setLang('en'))
         Claude analyzes _scrubCyrillicLeaves(), expands coverage, 
         re-runs → 12 leaks remaining
         
[Turn 3] Claude refines selector logic, re-runs → 0 leaks → PASS
         
[Turn 4] Claude runs check-setup-guide.mjs → FAIL 
         (3 placeholders {N} left, missing §10)
         Claude fills placeholders, adds icon section → PASS
         
[Turn 5] Claude runs check-platform-completeness.mjs → PERFECT
         All validators GREEN

[Goal achieved — 5 turns, ~28K tokens, 14 минут]

AI:   ✅ Release готов. Все validators PASS для yandex.
      
      Files modified:
        - StoreData/store-listing-tr.json (removed _comment)
        - StoreData/store-listing-ru.json (added keywords array)
        - WorkProgress/Samogonshchik-yandex/index.html (lang scrub expansion)
        - Release/Samogonshchik/yandex/SETUP_GUIDE.md (placeholders filled)
      
      Next: $release-yandex для финальной упаковки или manual upload в Console.
```

## Integration with $release-ready

`$release-ready` это **single-shot** validator — returns status (RED/AMBER/GREEN) и stops.
`$auto-release` это **continuous loop** — keeps fixing until GREEN.

Sequence:
1. **Manual**: `$release-ready yandex` — see что красное
2. **Auto** (if много issues): `$auto-release yandex` — let it fix iteratively
3. **Manual final**: `$release-ready yandex` — confirm зелёное, then ship

Don't run auto-release BEFORE manual release-ready — you might miss что the issues are obvious и should be addressed differently (e.g., если все validators RED потому что WorkProgress/ нет — auto не поможет, нужно build first).

## Files this skill uses

- Claude Code `/goal` built-in command (v2.1.139+)
- `scripts/runtime-test.mjs` — runtime gate
- `scripts/check-store-listing.mjs` — listing validator
- `scripts/check-setup-guide.mjs` — guide validator
- `scripts/check-platform-completeness.mjs` — completeness gate
- `.claude/skills/release-{platform}/SKILL.md` — platform-specific GREEN criteria

## Lesson learned

`/goal` enables **outcome-driven** workflows where the user defines finish line once. Forge's release process previously required:
1. User: "проверь готовность"
2. AI: runs checks, lists issues
3. User: "почини это"
4. AI: fixes
5. User: "проверь ещё раз"
6. AI: runs checks again
7. ... повторить пока зелёное

That's 5-10 user prompts. With `/goal`, that's **one** prompt. User attention is precious — auto-release returns it.

But: `/goal` works only когда completion condition is **machine-checkable**. Code formatting, factual claims, subjective quality — evaluator can't grade. Validators (exit codes) are perfect for `/goal` because evaluator just checks "did the command exit 0?".
