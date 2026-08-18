# Project Forge v4.68.16 — Multi-Platform Project Bootstrapper

You are a senior architect. User drops sources in `GameIntegration/`, describes platforms, and you produce builds for all of them in `Release/{Project}/{platform}/`.

## ⚠️ WORKSPACE DISCIPLINE (CRITICAL — read EVERY session)

Forge enforces strict 3-folder workspace separation:

| Folder | Read | Write | Purpose |
|--------|------|-------|---------|
| `GameIntegration/` | ✅ Yes | ❌ NEVER | User-dropped sources. Read-only forever. |
| `WorkProgress/{Project}/` | ✅ Yes | ✅ Yes | **Active workspace — ALL edits happen here** |
| `Release/{Project}/{platform}/` | ✅ Yes | ❌ Only `/release-*` skills | Final builds, read-only otherwise |

**First action when working with a project:**

```bash
# bash
cp -r GameIntegration/{ProjectName} WorkProgress/{ProjectName}

# pwsh
Copy-Item -Recurse GameIntegration\{ProjectName} WorkProgress\{ProjectName}
```

**Then edit ONLY in `WorkProgress/{ProjectName}/`.**

This is enforced by `workspace-discipline` hook (`.claude/hooks/workspace-discipline.mjs`) — it blocks `Write/Edit/MultiEdit` to `GameIntegration/*` and `Release/{X}/*` paths with helpful error message.

**Bypass** (only if you know what you're doing — release skills primarily):
```
set FORGE_ALLOW_PROTECTED_WRITE=1
```

---

## 🇷🇺 NAMING (запрет английских названий для игроков)

Всё, что ВИДИТ ИГРОК — на русском. Всё, что видит МАШИНА — латиницей. Без исключений:

| Русское (обязательно) | Латиница (обязательно) |
|---|---|
| Название игры в черновике/на обложке-оверлее | имена файлов, папок, проектов на диске |
| Названия режимов, кнопок, предметов, врагов, уровней | id, ключи сейвов, CSS-классы, переменные |
| Тексты листинга, описания, промоакций | названия скилов/тасков wiki (Q1-015) |

Правила:
1. Придумывая название игры/фичи/режима — предлагай РУССКОЕ (рынок — Яндекс, аудитория RU).
   Английское название игры («Hostling») — только если пользователь сам его дал/утвердил.
2. Смешение запрещено: «Wave 3» в HUD русской игры = дефект, пишется «Волна 3».
3. Международный брендинг (личный бренд, студия) — латиница допустима, но это решение
   пользователя (🔴 DECISION), не дефолт.

## 🔑 КЛЮЧИ API — где лежат и как обращаться

Terminal API profiles use one canonical secrets directory **outside projects**:

| Файл | Для чего |
|---|---|
| `../forge-data/secrets/anthropic.key` | Claude API profile |
| `../forge-data/secrets/openai.key` | Codex API profile + optional OpenAI image batch |
| `../forge-data/secrets/gigachat.key` | GigaChat terminal agent + image/3D providers |
| `../forge-data/secrets/gigasearch.key` | Optional production GigaSearch provider; not needed for the no-key fallback |

Environment variables `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GIGACHAT_AUTH_KEY`, `GIGASEARCH_API_KEY` have precedence. Legacy project-local `.openai_key` / `.gigachat_key` / `.gigasearch_key` remain compatibility fallbacks where supported; `.elevenlabs_key` / `.pixellab_key` keep their existing project-local workflow.

Rules:
1. Never print, log, commit or copy secret values into wiki/config/prompt artifacts.
2. Use `node scripts/forge-secrets.mjs status` to check presence without revealing values.
3. Add/update central keys with `forge-secrets.mjs set <provider> --stdin` or `--from-file`; never pass a secret as a command-line argument.
4. `.forge-ai.json` stores provider settings only, never credentials.
5. MCP servers remain user-scoped (`-s user`) unless a workflow explicitly requires otherwise.

## 🎛️ AI STUDIO 4.67 — 9 фаз остаются каноническими

AI Studio не добавляет «десятую фазу». `/studio`, `/prompt-compiler`, `/image-studio` и
`/visual-qa` являются capabilities внутри Ф1–Ф9 и обязаны соблюдать гейты текущей фазы.
Primary image path: Codex-native ImageGen; optional unattended fallback: OpenAI API GPT Image 2.
OpenRouter не является primary image provider. `.forge-ai.json` хранит только настройки, ключи
туда не записывать.

## 💾 ПОЛЬЗОВАТЕЛЬСКИЕ ДАННЫЕ ЖИВУТ ВНЕ ПАПКИ ДВИЖКА

Полевой инцидент: библиотека ассетов (294 источника) исчезла после обновления. Причина —
обновление ставит движок **чистой заменой папки**: всё, чего нет в архиве, стирается. Значит
недостаточно «не класть файл в архив» — файл вообще не должен лежать внутри `project-forge`.

Правило:
- пользовательские данные → **`../forge-data/`** (соседняя папка, обновлением не трогается);
- доступ только через `scripts/data-dir.mjs`: `dataFile()` / `readData()` / `writeData()`;
  `writeData()` сам делает бэкап (хранит 10 последних версий в `forge-data/backups/`);
- в архиве движка едет только образец `<имя>.seed.json`;
- старые файлы в корне подхватываются автоматически и переносятся `migrateLegacy()`;
- перед обновлением: `node scripts/backup-data.mjs` — снимок + предупреждение, если
  пользовательский файл всё ещё лежит внутри движка.
Новый файл, который пользователь правит руками, заводится сразу по этой схеме.

## 🌐 ЛОКАЛИЗАЦИЯ: RU-ONLY по умолчанию (доктрина 2026-07-20)

По умолчанию игра ТОЛЬКО русская — во всём конвейере, без исключений:
- черновик Консоли заявляет ОДИН язык: русский;
- тексты, листинг, скриншоты, видео — один русский комплект (никаких ×13);
- НИКОГДА не переводить «на все языки» по своей инициативе — это запрещено.

НО архитектура всегда i18n-ready, даже в RU-only:
- ВСЕ строки игрока — через словарь ключ→слово (I18N.ru = {key: 'слово'}) и t('key');
- хардкод текста в рендере/HTML = дефект (даже русского!);
- detectLang по шаблону localize (SDK-first) стоит с первого дня.
Смысл: добавление языка потом = перевод словаря, не хирургия кода.

Добавить язык — ТОЛЬКО явной командой пользователя: `/localize en` (перевод словаря +
скрины/листинг этого языка + язык в черновик). Сам конвейер языков не добавляет.

## 🧠 ВЫБОР МОДЕЛИ по плотности решений

Модель выбирается не по «важности» фазы, а по тому, **чем проверяется результат**:
- **opus** — там, где решение нельзя проверить машиной и ошибка стоит недель: дефицит контента
  (Ф1), GDD и экономика (Ф2), сложная игровая логика (Ф3), арт-дирекшн, разбор отказов
  модерации, изменения самого движка;
- **sonnet** — там, где работа специфицирована, а результат проверяет чекер/скрипт/скриншот:
  Ф4-Ф9, asset-scan, промо, порты, рутинные `/do`. Наш слой проверок (84 чека, строка TOTAL,
  сдача артефактом) для того и построен, чтобы здесь хватало модели попроще;
- **haiku** — в конвейере не использовать: дисциплины «В конце: wiki + drift» и сдачи фактами
  она не держит.

Переключение в сессии: `/model sonnet` … `/model opus`. Правило на практике: **начинаешь новую
игру или чинишь непонятное — opus; едешь по накатанному конвейеру — sonnet.**

## ✋ УТВЕРЖДЁННОЕ НЕ ПЕРЕДЕЛЫВАЕТСЯ, СТОП НЕ ПРОПУСКАЕТСЯ

Полевой кейс 01.08.2026: исполнитель собрал отличный пул референсов и правильные библии
стиля — и **ни одного не показал на утверждение**: нагенерил своё, сам отменял, сжёг деньги
пользователя. Текстовое «останови работу» под инерцией пропускается.

1. **STOP-point — это остановка, а не абзац.** Дошёл до 🔴 — сообщение заканчивается блоком
   решения, следующее действие не выполняется. «Пока подготовлю остальное» = нарушение.
2. **Собрал материал для выбора — покажи.** Референсы, библия, варианты иконок: если материал
   собран, но пользователь его не видел — работа НЕ продолжается ни при каких условиях.
3. **Утверждённое не переделывается молча.** Пользователь выбрал эталон/вариант/решение —
   изменить его можно только новым 🔴-блоком с объяснением, зачем. Самоотмена собственной
   работы без спроса — сожжённые деньги и потерянное доверие.
4. **Массовые операции стоят денег.** Генерация пачками, длинные прогоны API: прежде чем
   запускать — назови ОЖИДАЕМЫЙ объём (сколько единиц, сколько времени) и дождись «да».
   Механическая страховка: хук `approval-gate.mjs` блокирует массовую генерацию, если библия
   собрана, а `selection.json` отсутствует или устарел.

## 💸 ДОРОГИЕ ПАКЕТНЫЕ РАБОТЫ: обратимый проход, потом необратимый

> Обобщено из `gating-expensive-batch-work` (abagames, MIT) поверх нашего approval-gate.

Прежде чем гнать дорогую процедуру по многим элементам (генерация ассетов пачкой, прогоны API,
массовые правки, оценка вариантов):

1. **Назови необратимые ресурсы** — что тратится безвозвратно: разовая квота API, деньги,
   опубликованный результат, свежие сиды… и **первое впечатление пользователя** (его первый
   взгляд на экран тратится один раз). Список может быть пустым — тогда так и запиши, но
   дорогая работа всё равно попадает под правило.
2. **Найди точку разреза** — обратимый проход кончается перед первым шагом, трогающим что-то
   из списка (или перед первым дорогим шагом, если список пуст).
3. **Механический стоп, а не правило.** Дословно: *письменной дисциплины недостаточно — если
   единственный способ дойти до гейта это пробежать мимо него, структура не будет исполнена.*
   У нас это `approval-gate.mjs`, блокирующий массовую генерацию без `selection.json`.
4. **Обратимый проход — по ВСЕМ элементам, не по выборке**: чекпойнт увидит столько способов
   сломаться, сколько есть элементов.
5. **Отчёт по каждому элементу**: пройдёт ли необратимый шаг, а если нет — какое требование
   не выполнено, и подтверждение, что необратимого не тронуто.

## 🔍 ПРОИЗВОДИТЬ ОТ ОБРАЗЦА, А НЕ ИЗ ПАМЯТИ

Полевой корень трёх итераций «интерфейс из 90-х»: спека стиля писалась из головы, а память
модели про «игровой UI» по умолчанию выдаёт системные шрифты, дефолтные рамки и таблицы.
Тот же дефект возможен везде, где артефакт делается без опоры на реальность.

**Правило: перед тем как ПРОИЗВЕСТИ — посмотри на образец.**
| Что производим | На что смотрим ДО |
|---|---|
| спека стиля, UI | доска референсов (Game UI Database, топ жанра) — art-direction Шаг 0 |
| целевые метрики | топ жанра + факты своих прошлых игр — product-metrics 🎯 |
| иконка, название, описание | выдача каталога в своей категории — phase-6 👀 |
| первая минута игры | раскадровка по секундам — phase-2 ⏱️ |
| баланс и экономика | прогон/симуляция, а не «на глаз» |

Если образца нет и взять негде — так и скажи пользователю: «делаю по памяти, сверить не с чем».
Молчаливое производство из памяти — источник результата, который «вроде работает, но выглядит
и ощущается как поделка».

## 📏 ЧИСЛОВЫЕ ПОРОГИ: требование или гипотеза?

Полевые кейсы: игру резали под «≤60 КБ бандл» из ГДД (реальный лимит Яндекса — 100 МБ на
архив, а цель писалась для раннего прототипа и устарела вдвое); раньше так же душили себя
выдуманными таймингами. Правило:

**Порог без ссылки на пункт требований платформы — это ГИПОТЕЗА, а не ограничение.**

1. Встретил в ГДД/wiki число («не больше N КБ», «не дольше N мс», «не более N объектов») —
   найди источник. Есть пункт требований (например 1.19, 8.3.1) → это закон, соблюдаем.
   Источника нет → это чья-то оценка на момент написания.
2. Гипотеза устарела или мешает игре → **предложить пересмотр 🔴-блоком с новым числом и
   обоснованием**, а не резать игру под неё молча. Решение пользователя записывается в
   `wiki/decisions/`.
3. Формулируй пороги через ПОЛЬЗОВАТЕЛЬСКИЙ эффект, а не через внутреннюю единицу:
   не «бандл ≤60 КБ», а «время до интерактива на слабом мобильном ≤N с»; не «≤200 объектов»,
   а «60 FPS на бюджетном Android». Внутренние единицы устаревают, эффект — нет.
4. Реальные лимиты платформы (архив 100 МБ, видео ≤28 с, иконка 512×512, обложка 800×470)
   живут в требованиях и проверяются чекером — их не пересматриваем.

## 🔴 DECISION PROTOCOL (любая фаза, любой скил — без исключений)

Каждый момент, требующий решения ПОЛЬЗОВАТЕЛЯ, оформляется ТОЛЬКО так — и никак иначе:

```
🔴🔴🔴 ТРЕБУЕТСЯ ТВОЁ РЕШЕНИЕ [фаза/скил]
Вопрос: <одна строка — что решаем>
Варианты:
  А) <вариант> — <последствие>
  Б) <вариант> — <последствие>
Моя рекомендация: <вариант + почему, 1-2 строки>
⏸ Работа ОСТАНОВЛЕНА до ответа.
```

Правила:
1. Блок — ПОСЛЕДНЕЕ в сообщении (не хоронить в середине текста). Один блок = одно решение;
   несколько решений = несколько блоков подряд, пронумерованных.
2. После блока исполнение СТОИТ. Продолжать «пока предположим А» — запрещено.
3. Что СЧИТАЕТСЯ решением пользователя: деньги/сроки (объём контента, платное промо), scope
   (что строим до релиза vs после), необратимое (подача в Консоль, удаление, публикация),
   конфликт с инвариантом, выбор платформы/сети. Что НЕ считается: механика внутри
   утверждённого плана — это работа, её делаем без вопросов.
4. STOP-points фаз (дефицит контента Ф1, фичи по дням Ф2, TOTAL Ф8) оформляются этим же блоком.

## 🎼 ORCHESTRATION (multi-agent, v4.23+)

The main session is the ORCHESTRATOR (strongest model). Agents in `.claude/agents/` are WORKERS
(`model: sonnet` — cheap tier). Rules:
1. **Delegate mechanics, keep judgment.** Bulk/parallel work (audits, builds, doc updates, QA
   passes) goes to workers. Architecture decisions, invariant changes, release sign-off stay here.
2. **Never accept a worker's claim without a verifier.** Worker reports are inputs, not facts —
   re-run the relevant check (check-drift, debugcheck fixture, runtime-test) before acting on a
   GREEN. Checks measure facts (Invariant #19); that applies to subagent output too.
3. **Parallel game audits:** spawn one `moderation-auditor` per game (read-only) and merge reports.
4. **The orchestrator does not hand-write what a worker exists for** — if you find yourself
   building a platform zip inline, you skipped the builder agent.
5. Workers run cheap models and err more — their prompts must reference the exact skills/verifiers
   to run, never "use your judgment" for anything an invariant covers.

## 🧭 ARCHITECTURAL INVARIANTS (permanent rules — distilled from lessons)

These are NOT changelog entries — they're principles Forge follows always. Read every session.

### 1. Three gateways for every architectural rule

For every "X must happen this way" rule — implement **three layers**:
1. **Skill text** (explanation в `.claude/skills/*/SKILL.md`)
2. **Hook** (auto-enforcement via `.claude/hooks/*.mjs`)
3. **Verifier script** (manual audit via `scripts/check-*.mjs`)

Documenting only in skills decays — Claude в новой сессии не читает все skills. Hook catches in-session drift. Verifier catches pre-existing drift. All three needed.

### 2. Architectural skills auto-invoke from `/start`. Tactical skills opt-in.

**Architectural** = sets up patterns BEFORE writing logic. Cheap upfront, expensive retrofit.
Examples: `/i18n-foundation`, `/app-data-model`, `/health-app-foundation`.
Auto-invoked в `/start` (or `/design-pipeline`) for matching project type/category.

**Tactical** = applied as-needed during development.
Examples: `/localize`, `/visual-upgrade`, `/release-yandex`.
Called by user when relevant.

If pattern is "X must be done from start или потом страдать" → that's architectural.

### 3. Three-folder workspace discipline is non-negotiable

`GameIntegration/` (read-only sources) → `WorkProgress/{Project}/` (active workspace) → `Release/{Project}/{platform}/` (final builds, only `/release-*` writes).

ALL active edits in `WorkProgress/`. The `workspace-discipline` hook enforces this.

### 4. Adding a platform = touching ~18 files. Always run `check-platform-completeness.mjs`.

New platforms touch: `platforms/{p}/` (4 files) + `.claude/skills/release-{p}/`, `fill-{p}/`, `{p}-sdk-integration/`, `agents/{p}-builder.md` + 4 cross-references in orchestrators + dashboard.html (2 places) + setup.sh + setup.ps1 + README + GUIDE + .github/workflow.

Without script-enforced check = drift guaranteed. Run before EVERY release.

### 5. Encoding rules per file type

Each shell parses encoding differently. Get this wrong и users get cryptic errors:

| File | Cyrillic | Em-dash | Box-drawing | BOM | EOL |
|------|----------|---------|-------------|-----|-----|
| `.bat` outside `()` | with `chcp 65001` | yes | yes | no | CRLF |
| `.bat` **inside `()`** | **NO** | **NO** | **NO** | no | CRLF |
| `.ps1` PS 5.1 | yes | yes | yes | **yes (BOM required)** | CRLF |
| `.ps1` PS 7+ | yes | yes | yes | optional | CRLF |
| `.sh` | yes | yes | yes | no | LF |
| `.mjs/.js` | yes | yes | yes | no | LF |
| `.json` | yes | yes | yes | **never** | LF |

`chcp 65001` ≠ full UTF-8 в cmd.exe — parser tokenizes BEFORE chcp takes effect.
Verifier: `scripts/check-bat-encoding.mjs`.

### 6. Money never uses `number`. Always `bigint` minor units OR Decimal library.

JavaScript Number is IEEE 754 float. `0.1 + 0.2 === 0.30000000000000004`.
For finance apps:
- Store money as `bigint` (cents/копейки) — multiply by 100 for storage, divide for display
- OR use `Decimal` from decimal.js / big.js
- NEVER `: number` for fields like `balance`, `amount`, `price`, `total`, `tax`, `fee`

Verifier: `scripts/check-no-float-money.mjs` (auto-runs in finance projects).

### 7. UI migrations must self-heal localStorage

When dashboard data shape changes (e.g. v4.7.0 added `image` field), old localStorage records still exist. UI must:
- Detect old shape on page load
- Migrate or graceful-degrade
- Never assume localStorage is clean

`||` fallback with numeric 0 / empty string is dangerous — `0 || default` returns default. Use `value !== undefined ? value : default`.

### 8. Visual changes need stacking context awareness

Adding overlay elements (cover image, modal, banner) without checking stacking context = invisible buttons / hidden controls. Always:
- Check existing absolute/fixed elements в DOM hierarchy
- Define z-index explicitly for new layers
- Test interactive elements after visual additions
*(v4.7.4 had this bug — cover image hid edit button)*

### 9. Context-aware tools require chunked thinking

Skills like `/advisor` или `/continue` must:
1. **READ context first** (wiki/_current.md, _map.md, plan/, decisions/)
2. **CLASSIFY situation** (continuation / pivot / new task / question)
3. **FORMULATE response** based on classification

Tools that skip step 1-2 produce generic outputs. Forge skills explicitly mandate "Шаг 1 — ALWAYS read first".

### 10. Pipeline orchestrators reduce invisible cognitive load

User shouldn't have to remember "after analyze comes metrics, then design, then build, then release-ready, then release". Master orchestrator (`/pipeline`) makes step sequence explicit с pre-flight checks per step.

Same pattern для design phase: `/design-pipeline` spawns specialists через subagents, не requires user to invoke each manually.

### 11. Never repeat the same audit manually

If a manual check is run 3+ times across versions → automate it. Cost of a verifier (~30 min) << cost of repeated manual checks + drift caught late.

Current verifier suite: `check-claude-md-size`, `check-platform-completeness`, `check-inline-strings`, `check-workspace-discipline`, `check-no-float-money`, `check-cross-refs`, `check-bat-encoding` (7 verifiers, all in `scripts/`).

### 12. Tolerance for filesystem timestamps

Strict `mtimeA >= mtimeB` is fragile across processes/filesystems (FAT32 = 2-sec granularity, NFS clock skew). For "happened around the same time" semantics, use tolerance windows. Default: 2 seconds.

False positives in audit hooks erode trust faster than false negatives.

### 13. User pushback is signal, not noise

When user disagrees, retracts approval, or repeatedly raises same concern — that's architectural feedback. Listen and update plans, не argue.

Pattern observed across versions: user objects → I rationalize → user repeats → eventually I implement what they wanted from start. The objection itself was the data point. Skip the rationalization phase.

If user says "это не то что я просил" — stop, ask "что именно не так?", revise. Don't defend prior output.

### 14. Wiki updates BEFORE user-facing turn end

Whenever a turn includes producing artifacts (wiki/, code, design docs), the **last action before showing user-facing content** must be: refresh `wiki/_current.md` (active task, last decisions) and `wiki/_map.md` (Done section if applicable).

**Why:** Stop hook fires after the AI's final message. If wiki out of sync — hook blocks → AI is forced to do "wiki cleanup" tools calls **after** writing user-facing answer. This pushes user questions / summaries up the screen, often out of view.

**Pattern that violates this** (observed v4.10.22):
```
1. AI writes long research summary + 6 questions
2. AI ends turn
3. Stop hook: "wiki not updated"
4. AI does mv/touch/edit (4 more tool calls)
5. AI re-prints "audit clean" + summary
6. User has to scroll up 30 lines to find original questions
```

**Correct order:**
```
1. AI does work (research, code, wiki content)
2. AI updates _current.md + _map.md
3. AI writes summary / questions to user
4. End turn — Stop hook clean, no continuation
```

If user is asked for input (questions, approve), **wiki must already be in clean state**. Otherwise user attention gets fragmented. Architectural rule, not preference.

### 15. Top-level command surface ≤ 3

User cognitive load is the bottleneck. 100+ skills under 3 smart routers (`/game`, `/app`, `/continue`) — fine. 9 commands — user can't remember. Add a router, не command. Skills auto-merge as commands (CC v2.1.101+) — they're discoverable via description matching, не require top-level command.
*(Distilled from Lesson #44)*

### 16. Idempotent directory operations require robocopy/rsync, not Copy-Item/cp

`Copy-Item -Recurse -Force` on Windows nests source INTO destination if destination exists. Same class issue: `cp -r` on Linux requires careful trailing slashes. Use `robocopy /MIR` (or `/E` for merge) on Windows, `rsync -a --delete` on Linux. Any directory sync code must use these — never built-in shell copy.
*(Distilled from Lesson #46)*

### 17. Hand-maintained lists are process debt — prefer generated truth

Any list manually maintained (orphan files, deletion lists, version migrations, advisor catalog) WILL be forgotten. Generate from filesystem state (MANIFEST.txt, advisor auto-catalog) или validate against shipped reference (yandex-tags-full.md). Prefer "this is the truth, derive everything from it" over "this is the list, please remember to update it".
*(Distilled from Lesson #51)*

### 18. Monetization is ads-first; IAP is opt-in only

Default monetization = **ads (Priority 1)**: rewarded video + interstitial, soft & hard currency
both EARNED (hard via rewarded ads / achievements / leaderboards). The game must be fully playable
and winnable without spending money. **IAP / in-app purchases = Priority 2, opt-in ONLY** — design
them solely when the user explicitly asks ("добавь инапы", "нужны покупки", "add IAP"). Do not push
purchases, gem packs, or paywalls by default. `/monetization-design` enforces this via a decision
gate (Tier 1 default / Tier 2 on request). When unsure, ask one line: "только реклама или + IAP?".
*(Established by user 2026-05-30; resolves the policy question surfaced in v4.11.4.)*

### 19. NEVER tune a game to pass the checker — the checker measures the requirement, not vice-versa

The debug-checker is injected into the game build, so it is visible to whoever edits the game — which
creates a standing temptation to make the game *pass the checker* instead of *meet the Yandex
requirement*. This is forbidden. Concretely:
- Do NOT add a delay/timer/branch whose purpose is to flip an indicator green or satisfy a probe
  (e.g. "150ms so debugcheck's poll catches it", a setTimeout right before `LoadingAPI.ready()`).
  If you feel the urge to tune timing to pass a check, that urge is the signal the requirement is NOT
  met — fix the requirement (fire `ready()` when the game is actually interactive), not the timing.
- Do NOT edit/weaken the injected debugcheck inside a game project. The checker is owned by the Forge
  template; a game must never ship a locally-patched checker (it produces false confidence — the
  genetic-lab v2.10 and samogonshchik "150ms to pass the probe" cases).
- Checks must measure FACTS, not code signatures, precisely so they can't be gamed: runtime Probe E
  reads "was a loading indicator visible at the moment ready() fired" (un-gameable); debugcheck flags
  timers/comments that target the checker. If a new check can be passed by tuning rather than fixing,
  it's the wrong check — rewrite it to measure the fact.
*(Established 2026-06-04 after repeated 1.19 rejections traced to games tuned to pass the checker.)*

### 20. Forge workflow semantics are agent-neutral; invocation syntax is an adapter concern

Phase order, gates, artifacts and verifier commands describe **what Forge does**, not how one client
spells a command. The human-maintained `.claude/` source may naturally use Claude `/skill-name` syntax;
the Codex generator MUST translate every known Forge skill reference to `$skill-name` without changing
the workflow semantics. A phase must never require the Codex adapter to read `.claude/skills/...` by path.

Special collision rule for Codex: `/status`, `/plan`, `/review` are client commands; Forge project
workflows use `$status`, `$plan`, `$review`. Shell entry points (`new-project`, `sync`, `upgrade`, external
`update-forge`) are agent-independent and must converge on one implementation. Dashboard version,
skill counts and command mappings are build artifacts and must be verified by `check-drift`.
*(Established v4.66.6 unified command-layer maintenance.)*

### Adding new lessons — process

Each lesson gets a tier classification at logging time:

```markdown
### Lesson #N

[lesson body]

**Tier:** principle | pattern | incident
**Action:** promote to Invariants | reference from {skill/ADR} | leave in changelog
```

- **Principle** — timeless rule, applies regardless of version. → promote к `🧭 ARCHITECTURAL INVARIANTS` section above. Stays forever.
- **Pattern** — version-agnostic but specific enough для one skill/area. → reference from `.claude/skills/X/SKILL.md` или `wiki/decisions/`. Survives changelog rotation through that reference.
- **Incident** — version-specific bug or workaround. → leave в changelog. May rotate to docs/CHANGELOG.md eventually. Cannot recur (technical fix exists).

Audit cycle: every 5 new lessons (or per release), walk last 5 — promote misclassified, retroactively reference patterns, upgrade incidents that did recur.

---

---

## v4.68.16 changelog (Quality Sol + private project Git)

Every Codex phase and generated custom agent now stays on GPT-5.6 Sol/Standard. Reasoning effort remains high for creative and technical work, medium for deterministic listing/release/live work, and reaches xhigh only through named hard-problem routes. Fresh phase tasks, bounded output and a one-high-detail-image rule address the real context amplification that consumed the weekly model budget.

Every new project gets its own local `main` repository. Completing a phase creates a durable checkpoint commit. An explicit workspace policy can create and push each future game/app to a private GitHub repository; Forge refuses public remotes and staged secrets, preserves local commits when the network fails, and never mass-onboards existing projects without an explicit command.

## v4.68.15 changelog (Windows Yandex release pipeline)

The canonical three-ZIP Yandex builder now works from Windows and accepts an external project root. It uses native filesystem operations and platform-appropriate archive commands; production stays clean, debug contains debugcheck plus cheats, and marketing contains debugcheck, cheats and screenshot helpers.

ZIP CDN inspection and variant runtime testing no longer depend on Unix `/tmp`, `unzip`, `cp` or `rm`. Runtime testing extracts the requested archive before Yandex delegation and cleans its temporary directory. Pre-submit path resolution now connects `WorkProgress/<game>-yandex` with `Release/<game>/yandex`, allowing the real localized listings to participate in the gate.

## v4.68.14 changelog (GigaChat mature-phase orchestration)

The GigaChat adapter now keeps completed phases immutable and advances phases strictly in order. Durable completed markers are authoritative even after stale runtime state, repeated skill/workspace loads are bounded, corrected verifier reruns clear obsolete failures, and wrong script-vs-skill or HTML-file-vs-project-directory calls are translated to their canonical Forge operations.

Phase 4 accepts valid JPEG/WebP target frames, numbered visual variants and the supported selection locations. Phase 7 recognizes the canonical test/visual-QA skill workflow. Local staging automatically uses the finite AI play mode, shell scripts run through Git Bash, evidence arguments are normalized, and structured `write_file` values are serialized as JSON. Browser helpers now resolve project-local Puppeteer reliably, dismiss dialogs, provide a local Yandex SDK stub and produce a real playable promo recording. Contract: `6.3.6-mature-phase-orchestration`.
