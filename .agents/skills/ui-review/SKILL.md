---
name: ui-review
kind: tactical
description: "Screenshot-driven UI audit. AI vision systematically scans interface zone-by-zone detecting collisions, overlaps, prejat'ie, illegible labels, broken hierarchy. Output —…"
---

# UI Review — Screenshot-Driven Systematic Audit

## What this skill does (v4.10.28 rewrite)

**NEW (v4.10.28):** Screenshot-driven. AI looks at actual rendered UI и detects specific defects.
**OLD (deprecated):** Principles-based heuristic checklist. Was generic — "improve hierarchy", "tighten spacing". User pain: "100 раз присылал скрины, ему срать" — generic principles переписывали specific observations.

This rewrite forces **systematic visual scan**, не "глянул и подумал ОК".

## Mandatory inputs

Skill **refuses** to run без one of:
1. **Screenshot attached к user message** (drag-and-drop в Claude Code chat)
2. **Path к existing screenshot:** `$ui-review path/to/screenshot.png`
3. **Auto-snapshot request:** `$ui-review --auto` — runs `runtime-test.mjs` к capture current state
4. **HTML file path:** `$ui-review WorkProgress/MyGame/index.html` — opens file, asks user to provide screenshot or auto-snapshot

Если ничего из above не provided:

```
❌ Screenshot needed. Options:
1. Drag-and-drop screenshot в this chat
2. Specify path: $ui-review path/to/screenshot.png
3. Auto-capture: $ui-review --auto (runs runtime-test.mjs к snapshot current build)
4. For wireframe/concept stage без UI: see "Legacy principles-based mode" section below
```

## Workflow — systematic scan procedure

### Phase 1 — Identify zones (mandatory, не skip)

Look at screenshot. Mentally divide into **6-9 zones** based on UI layout:
- Header (top strip)
- Top-right (controls/account)
- Top-left (logo/title)
- Main content (center)
- Left sidebar (if present)
- Right sidebar (if present)
- Bottom bar (footer/CTA)
- Modals/overlays (if present)
- Notifications/toasts (если visible)

For each zone, output to user:

```
ZONE 1: Header — describing what's visible
ZONE 2: Top-right — describing what's visible
...
```

**DO NOT skip к "looks fine".** Mandatory enumeration.

### Phase 2 — Per-zone violation scan

For **each** zone, apply 8-point checklist:

```
1. Text overlap — is any text on top of other text? (most common bug)
2. Element collision — do two elements touch без gap >= 8px?
3. Label/value prejat'ie — is a label squashed against its value без 4px+ spacing?
4. Inconsistent font sizes — text < 11px? > 24px without semantic reason?
5. Pill/badge spacing — pills around them have 8px+ margin from siblings?
6. Border-radius consistency — пилл/cards radius matches design system?
7. Color contrast — text passes WCAG AA (4.5:1 ratio)?
8. Visual hierarchy — most important element actually largest/loudest?
```

Output per zone:

```
ZONE 3 (Main content):
  [VIOLATION] Pill "+1 за 40 🥕" overlaps number "13" at coordinates (~x:250, y:740)
              No visible gap between elements. Pill should have margin-left: 12px.
  [WARN]      Label "Размер колонии:" font-weight matches value font-weight
              — hierarchy weak, consider value bold or larger
  [OK]        Bullet markers spacing within DNA editor list
```

### Phase 3 — Map к source files

For each VIOLATION, find source:

```bash
# Search для visible text content
grep -rn "Размер колонии" --include="*.html" --include="*.tsx" --include="*.jsx" --include="*.vue"

# Or for unique class names from devtools если provided
grep -rn "class=.colony-size" .
```

Show file + line к user.

### Phase 4 — Output structured violations

After scanning all zones, output one consolidated table:

```
## Found 5 violations:

| # | Severity | Zone | Description | Source file | Suggested fix |
|---|---|---|---|---|---|
| 1 | CRITICAL | Main | Pill "+1 за 40" overlaps "13" | index.html:740 | Add margin-left: 12px к .pill class |
| 2 | MAJOR | Right sidebar | Biome subtitle prejat'ie | index.html:892 | margin-top: 6px к .biome-subtitle |
| 3 | MAJOR | Right sidebar | Difficulty pills touch card border | index.html:920 | padding: 12px на .difficulty-group |
| 4 | MINOR | Header | "0/12 звёзд" subtitle font too small | index.html:560 | font-size: 11px → 12px, opacity 0.5 → 0.65 |
| 5 | MINOR | Pipeline | Icons spacing < 16px | index.html:620 | gap: 24px на .pipeline-icons |
```

### Phase 5 — STOP. Do not auto-fix.

**Critical:** $ui-review это **audit only**. **НЕ** apply fixes automatically.

After Phase 4 output, write:

```
Found N violations above. To fix:
- Run `$ui-pipeline` для full redesign workflow (read patterns + apply все fixes + re-verify)
- Or fix specifically: tell me "fix violations 1, 3, 5" — I will Edit those только
- Or fix all: tell me "fix all" — I will Edit each one + verify через `$ui-review --auto` после
```

Wait для user direction. Do NOT proceed к Edit без explicit "fix" instruction.

## Severity definitions

- **CRITICAL** — Element overlap, text unreadable, button unreachable, hierarchy broken (most important element invisible)
- **MAJOR** — Pre-jatie, inconsistent spacing >= 8px deviation, contrast fail, label hidden
- **MINOR** — Style inconsistency, suboptimal sizes, missing affordance hints
- **NIT** — Optional polish (rounded corners not matching, missing hover state)

## Anti-patterns — what NOT to output

These are signs you're regressing к old principles-based mode. Reject them в your output:

❌ "The UI looks crowded — consider more whitespace"
   → Not specific enough. Where? How many pixels?

❌ "Hierarchy could be improved"
   → Where? Which element should be larger? By how much?

❌ "Consider design system tokens"
   → Generic advice. Not screenshot-driven.

❌ "Some text appears small"
   → Which text? What size now? Target size?

❌ "Overall the spacing is tight"
   → Which spacing? Between what? Pixel measurements?

✅ "Pill `+1 за 40 🥕` overlaps number `13` at coordinates (~x:250, y:740). Margin-left: 12px needed on `.pill-class`."

The rule: **every observation needs coordinates OR pixel measurement OR specific element name**.

## Integration с pre-claim-fixed hook (v4.10.27)

After Phase 5 user says "fix violations 1, 3, 5":
1. AI Edit's source files
2. AI runs runtime-test.mjs auto-snapshot
3. AI re-views screenshot, confirms violation resolved
4. ONLY THEN can AI say "fixed"

Pre-claim-fixed hook will block если AI says "fixed" без git diff. Так что AI forced к real action.

## Integration с /goal

```
/goal $ui-review --auto outputs zero CRITICAL violations
```

Claude iterates: scan → fix → re-scan → fix → ... пока CRITICAL count = 0.

## Auto-snapshot workflow

If user passed `--auto` или has no screenshot:

```bash
# 1. Start dev server если not running
npx http-server WorkProgress/<project>/ -p 8080 &

# 2. Capture screenshot via runtime-test
node scripts/runtime-test.mjs WorkProgress/<project>/ --scenarios=dom --screenshot=true

# 3. Screenshot saved к wiki/screenshots/{date}-{viewport}.png
# 4. Read that screenshot
# 5. Proceed с Phase 1 scan
```

If runtime-test не available (puppeteer not installed):
```
Cannot auto-snapshot — puppeteer missing.
Run: npm install puppeteer
Then retry $ui-review --auto

Or manually: open game в browser, screenshot, drag к chat.
```

## When user describes UI (no screenshot)

```
User: "у меня в Genetic Lab кнопки налипают друг на друга"
AI: ❌ Cannot review without screenshot. Drag-and-drop or use $ui-review --auto.
```

Don't try к imagine the UI и give principles-advice. That's the failed v4.10.27- behavior.

## Legacy principles-based mode (deprecated — use only if NO screenshot possible)

Used когда UI ещё не существует (wireframe/concept stage). Less accurate но better than nothing.

For wireframe review, ask user к describe в text + apply Nielsen 10 heuristics:
1. Visibility of system status
2. Match between system и real world
3. User control и freedom
4. Consistency и standards
5. Error prevention
6. Recognition rather than recall
7. Flexibility и efficiency of use
8. Aesthetic и minimalist design
9. Help users recognize, diagnose, recover from errors
10. Help и documentation

Output severity-ranked findings.

**However:** as soon as wireframe becomes working UI, switch к screenshot mode. Principles are 10x less effective than vision-based scan.

## Files this skill writes к (optional)

- `wiki/ui-audits/{date}-{project}.md` — structured violations report для history
- `wiki/screenshots/{date}-{viewport}.png` — auto-captured screenshots (if --auto used)

## Non-Negotiable

- [ ] Screenshot input present (refuse without one)
- [ ] Systematic zone enumeration (Phase 1 mandatory — not skipped to "looks fine")
- [ ] Per-zone 8-point checklist applied
- [ ] Each VIOLATION has coordinates OR element name OR pixel measurement
- [ ] Source files mapped (grep'd to verify)
- [ ] No principles-based generic advice
- [ ] Stop after Phase 4 — wait for fix instruction
- [ ] Severity assigned per violation

## 📸 САМООЦЕНКА ПО КАДРАМ (обязательный шаг, до показа пользователю)

Полевое открытие 01.08.2026: заставить исполнителя СНЯТЬ свои экраны и оценить их баллами
сработало лучше любых текстовых правил — он сам поставил 4/10, 3/10, 5/10, 7/10, 4/10, сам
назвал структурную причину («экраны собраны как списки в DOM, ни одного пикселя арта») и сам
нашёл три дефекта, включая боевой экран в 1.23 мобильного экрана.

### Процедура
```
node <движок>/scripts/screens-shoot.mjs . --states "штаб,карта,бой,итог"
```
Скрипт снимает каждое состояние на **мобильном 412** (основная аудитория) и десктопе 1920,
собирает контактный лист `screens/review/index.html` и сам помечает кадры, которые НЕ ВЛЕЗАЮТ
в экран.

### Оценка — по каждому кадру, без исключений
Формат строки: **`<экран> — N/10. <что видно> <почему такой балл>`**
Правила честности:
- 10 — выглядит как игра 2026 года, 1 — панель настроек в тёмной теме;
- балл ставится ЗА КАДР, а не за замысел: «задумано хорошо» баллов не даёт;
- обязательно назвать, **сколько процентов экрана пусто** и **есть ли на нём арт** — это две
  главные причины низких баллов;
- отдельной строкой — дефекты, видные на кадре (наложения, обрезки, висящие подсказки);
- в конце — **общий вердикт словами**: структурная причина, а не список мелочей.

### Сравнение с ЦЕЛЕВЫМ КАДРОМ (если он утверждён)
Есть `assets/target/target-frame.png` — оценка каждого экрана дополняется строкой:
**«до цели: <3 главных расхождения>»**. Формат: что в кадре есть, а на экране нет
(композиция, плотность, палитра, материал панелей), и что из этого **исправимо в браузере**,
а что было недостижимой детализацией генерации.
Балл ставится не «красиво/некрасиво», а **насколько близко к утверждённому кадру**.

### Что делать с оценкой
- любой экран **ниже 6/10 → в работу**, показывать пользователю рано;
- если низкие баллы у всех экранов кроме одного — причина СТРУКТУРНАЯ (обычно: арт есть
  только в одном месте, остальное нарисовано рамками и текстом). Чинить структуру, не отступы;
- переделал → **сними и оцени снова**. Оценка после правок обязательна, иначе не видно,
  помогло ли.
