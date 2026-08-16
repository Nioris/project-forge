---
name: art-direction
kind: architectural
description: "MANDATORY first phase for ANY visual work (3D, pixel, vector, UI). Defines a concrete per-game art-direction spec BEFORE generating pixels, and a self-critique loop that runs BEFORE showing the user — so the FIRST draft is polished, not programmer-art that needs 10 rounds of 'сделай нормально'. Invoked by /three-setup, /visual-style, /procedural-geo, /pixel-art, /visual-upgrade, /ui-pipeline. Triggers on: art direction, арт дирекшн, выглядит дёшево, сразу нормально, programmer art, generic, AI default, подбери стиль, стиль под игру, визуальная концепция, looks cheap, make it good first time."
---

# Art Direction — Define quality FIRST, generate to spec, self-critique BEFORE delivering

## Why this skill exists (the actual problem it fixes)

First-draft visuals come out weak — "просто стены", flat sprites, generic UI — and then take
many rounds of "сделай нормально" to reach quality. **Root cause:** generation starts with no
defined target, so the model emits its safest, most generic default; the *user* becomes the
quality loop. This skill inverts that: define a concrete target up front, then self-evaluate and
revise **before** the user ever sees it. Goal — **deliver pass-3 quality on pass 1.**

This is invoked FIRST by every visual skill. Do not generate visuals without a spec.

## Part A — The Art-Direction Spec (do this BEFORE any pixels)

Produce `wiki/design/art-direction-{Project}.md`. It must be **concrete** — exact hex, exact
counts, named references. Vague specs ("nice, modern, clean") produce generic output; that is
the failure mode. If you catch yourself writing an adjective, replace it with a number, a hex
code, or a named touchstone.

```markdown
# Art Direction — {Project}

## 1. Identity (one sentence)
"{Genre} game that feels like {emotional adjective} — think {Reference A} meets {Reference B}."

## 2. Reference touchstones (3–5, NAMED, real)
- {Game/film/artist} — for {what specifically: palette / lighting / shape language / mood}
- ... (pull from /research-references if it ran; otherwise name them now)

## 3. Palette (EXACT hex — this is binding, not a suggestion)
- Background:  #______  (never pure black #000 unless the spec is "void/horror")
- Surface/mid: #______
- Primary:     #______
- Accent (1):  #______  ← used sparingly, draws the eye to the most important thing
- Highlight:   #______
- Shadow tint: #______  (shadows are NOT just darker — they shift hue, usually cooler)
Rule: 60/30/10 — 60% background+surface, 30% primary, 10% accent. Accent is precious.

## 4. Shape language
- Forms: {rounded & soft | sharp & angular | geometric | organic}
- Why it matches the game: {1 line}

## 5. Detail density target (kills "просто стены")
- Detail level: {minimal | medium | rich}
- Every focal surface gets ≥ {N} distinct detail elements (texture, trim, prop, wear, decal).
- NO large flat untextured/single-color surface in the player's view.

## 6. Lighting & material mood
- Key light direction + colour, ambient fill, contrast ratio (dramatic vs flat).
- Materials: {matte | glossy | metallic | mixed} — and where each is used.

## 7. Hero details (3–5 — the things that SELL the look)
The specific elements that make it read as intentional, not default:
- e.g. "warm rim-light on every character edge"
- e.g. "every room has 1 light source + cast shadows + 2 set-dressing props"
- e.g. "sprites have a 1px darker outline + 1 highlight pixel on the top-left"

## 8. Quality bar / Definition of Done
A reviewer should say "this looks intentionally designed", not "this is a prototype".
- [ ] (fill per project — see Part B rubric)
```

If `/research-references` already produced `wiki/research/{Project}-references.md`, mine it for
sections 2–7 instead of inventing. Genre→starting-palette tables live in `/visual-upgrade`
(2D) and `/visual-style` (3D) — pull from them, then make the hex exact here.

## Part B — The Self-Critique Loop (run BEFORE showing the user, EVERY time)

After you generate ANY visual (a scene, a sprite, a screen), do NOT deliver it yet. Run this:

1. **Render/inspect what you actually produced** (screenshot it via runtime-test --screenshot /
   /ui-review for UI; describe a sprite at native resolution). Look at the *output*, not the code.
2. **Score against the rubric** (1–5 each). Anything ≤ 3 must be fixed before delivery:

   | Axis | What "5" looks like | Common "default" failure (score 1–2) |
   |------|--------------------|--------------------------------------|
   | **Richness** | Surfaces have layered detail per spec §5 | Big flat untextured walls / single-fill shapes |
   | **Readability** | Focal element pops instantly (squint test) | Everything equal weight; can't tell what matters |
   | **Cohesion** | Matches spec palette + shape language | Random colors, mixed unrelated styles |
   | **Hierarchy** | One clear Tier-1 focal point | Flat, no focal point, or 5 competing ones |
   | **Intentionality** | Hero details (§7) present | Looks like programmer-art / AI default |
   | **Life** (anim/motion) | Movement has weight, easing, feedback | Static, linear, instant, dead |

3. **Name the 3 weakest things in one line each**, then **revise them** — re-generate, don't patch.
4. **Re-score.** Loop until no axis is ≤ 3. THEN deliver.

State the final self-score briefly when delivering (e.g. "self-check: richness 4, readability 5,
intentionality 4 — furnished the scene + added rim light before showing you"). This makes the
internal loop visible and keeps you honest (pairs with the pre-claim-fixed hook).

## Redesign vs Patch (critical for UI, applies to all)

When the user says **"переделай / это говно / не то / не подходит под игру / выглядит дёшево"** —
that is a **REDESIGN** request, not a patch. Do NOT respond with a one-line tweak.
- Patch = "make this button bigger", "change this color" → targeted edit is correct.
- Redesign = any dissatisfaction with the *result as a whole* → return to the spec (Part A),
  question whether the direction itself fits the game, and rebuild to it. A redesign that
  changes < 30% of the surface is not a redesign — it's a patch wearing a costume.

## Integration (who calls this)

- **/three-setup, /procedural-geo, /visual-style, /shader-fx** → spec first, then build scene to §5/§7, then Part B.
- **/pixel-art** → spec first (palette ramps, sprite detail rules), then Part B silhouette/anim checks.
- **/visual-upgrade** → spec first, then upgrade to it, then Part B.
- **/ui-pipeline, /fix-ui** → spec drives design+UX choice per game; redesign-vs-patch rule above.

## Non-Negotiable
- [ ] Spec exists at `wiki/design/art-direction-{Project}.md` before any visual generation
- [ ] Spec is concrete (exact hex, counts, named references) — zero vague adjectives
- [ ] Self-critique loop run on the RENDERED output before delivery; no axis left ≤ 3
- [ ] "Переделай"/dissatisfaction → full redesign to spec, never a minimal patch
- [ ] No large flat untextured surface ships in the player's view

## 🖼️ ШАГ 0 — ДОСКА РЕФЕРЕНСОВ (до написания спеки стиля)

Спека стиля «из головы» даёт интерфейс 90-х: системные шрифты, дефолтные рамки, таблицы.
Сначала смотрим, как это делают сегодня, и сравниваем с пользователем.

### Сперва — готовые скилы под стиль
`/find-skills` по задаче игры (`pixel art`, `game ui`, `icon design`, `ui kit`). Готовая
методика от официального источника экономит несколько итераций. Проверка один раз на проект.

### Где брать референсы (профессиональные базы, не «картинки из гугла»)
| Источник | Что там |
|---|---|
| **Game UI Database** (gameuidatabase.com) | десятки тысяч экранов игр по фильтрам: жанр, тип экрана, платформа — отраслевой стандарт для UI-референсов |
| **Interface In Game** (interfaceingame.com) | экраны игр с разбором по типу интерфейса |
| **ArtStation** — раздел Game UI / Concept | стилевые доски, палитры, рамки |
| **itch.io** — топ игр жанра | что реально делают инди сегодня |
| Магазин Яндекс.Игр / RuStore — топ жанра | прямые конкуренты и ожидания аудитории |

### Процедура
1. Категории доски (4-6): `composition` (что где на экране), `panels` (рамки, фактуры),
   `icons`, `typography`, `palette`, `hud`.
2. Собери **по 3-4 референса в каждую**, скачай в `assets/refs/<категория>/ref-01.png…`.
   Рядом `_prompts.json` в роли источников: `{"ref-01.png": "игра/автор + URL"}` — обязательно,
   чтобы происхождение не потерялось.
3. Собери доску и **останови работу** (🔴 решение — направление стиля):
   ```
   node <движок>/scripts/asset-bible.mjs . --dir assets/refs --title "Референсы"
   ```
4. Пользователь отмечает, какие направления нравятся → `selection.json`.
5. **Спека стиля пишется ПО ВЫБРАННЫМ РЕФЕРЕНСАМ**: палитра снимается пипеткой с выбранных,
   плотность деталей и композиция описываются словами по ним же, шрифт подбирается похожий.

### Граница
Референс — для **композиции, палитры, плотности и настроения**, НЕ для копирования.
Перерисовывать чужой арт, копировать узнаваемые элементы интерфейса конкретной игры или
использовать её ассеты — запрещено. Итог: «в духе», а не «как у них».

## 🎨 ДИЗАЙН-ПРОЦЕСС (по методике Anthropic frontend-design, адаптировано под игры)

### Калибровка: узнай собственные дефолты и не используй их
ИИ-дизайн скатывается к узнаваемым шаблонам. В вебе это кремовый фон + serif + терракота,
почти-чёрный + кислотный акцент, газетная сетка. **В играх наши дефолты такие:**
системный шрифт · `border: 1px solid` + сплошная заливка · тёмно-серые панели с радиусом 8px ·
эмодзи вместо иконок · таблицы как основной экран · фиолетово-синий градиент «фэнтези».
Бриф прямо просит такое — делай. Бриф молчит — **не трать свободу на дефолт**.

### Два прохода: сперва ПЛАН, потом код
**Проход 1 — план на страницу**, в четырёх пунктах:
- **Палитра**: 4-6 именованных hex («ржавчина #8C4A2F», «снег на щите #DCE6F0»), не «тёмная тема»;
- **Типографика**: минимум 2 гарнитуры по ролям — характерная дисплейная (используется скупо)
  и рабочая для текста; шкала размеров с осознанными весами;
- **Раскладка**: концепт одним предложением + ASCII-вайрфрейм экрана;
- **SIGNATURE** — одна вещь, по которой запомнят игру. Не «красивый UI», а конкретика:
  «рамки как обугленные доски частокола», «счётчик хода — песочные часы, реально пересыпающиеся».

**Проход 2 — самокритика ДО кода**: прочитай план и спроси, получил бы ты то же самое для любой
другой игры этого жанра. Да → это дефолт, переделай эту часть и скажи, что изменил и почему.
Только после этого пишется код, и каждый цвет и шрифт берётся из плана.

### Черпай из МИРА игры, а не из «игрового UI вообще»
Отличительное берётся из материалов, инструментов и вещей самого сеттинга: для славянского
средневековья это дерево, кованое железо, береста, холст, воск, ржавчина — а не «фэнтезийные
рамочки». Спроси: из чего в ЭТОМ мире сделали бы панель, если бы делали руками?

### Смелость — в одном месте
Signature громкий, всё вокруг тихое и дисциплинированное. Правило Шанель: перед сдачей убери
один эффект. Нагромождение анимаций и свечений — верный признак сгенерированного дизайна.

### Тексты — материал дизайна
Активный залог и точное действие: «Отправить дружину», не «Подтвердить». Кнопка и результат
называются одинаково: нажал «В поход» — увидел «Поход начат». Называй вещи так, как их знает
игрок, а не как устроен код. Ошибки не извиняются и не расплывчаты: что случилось и что делать.
Пустой экран — приглашение к действию, а не сообщение о пустоте.

## Пиксельный стиль → отдельный пайплайн
Спека вышла пиксельной → дальше `/pixel-art-pipeline`: там развилка «PixelLab или своя
генерация» и правила размеров, палитры и читаемости. Не гони пиксель-арт обычной генерацией
не спросив: анимации и 8 направлений диффузионка не тянет, а PixelLab тянет.

## 🎯 ЦЕЛЕВОЙ КАДР (target frame) — картинка, к которой всё стремится

После выбора референсов и до производства: сгенерировать **3 варианта того, как должен
выглядеть ГЛАВНЫЙ ЭКРАН этой игры целиком**, пользователь выбирает один — и дальше всё
производство равняется на него. Индустриальный приём: студии рисуют target frame до
продакшена, чтобы у всех была одна картинка перед глазами.

Зачем: референсы — чужие игры, библия — элементы по отдельности. Целого изображения «как
должна выглядеть НАША игра» нет ни у кого, поэтому исполнитель делает «минимально
удовлетворяющее требование», а пользователь смотрит и говорит «не то». Кадр заканчивает этот
цикл: есть предъявляемый эталон, и разговор идёт про расстояние до него, а не про вкус.

### Как генерировать (честно, чтобы не гнаться за недостижимым)
1. **В целевом разрешении и пропорции** экрана игры (1920×1080 или 1080×1920), НЕ квадрат;
2. В промпт обязательно: `screenshot of a browser game`, жанр, вид камеры, стиль из спеки,
   палитра именованными hex, ключевые элементы интерфейса на своих местах;
3. **3 варианта с разной композицией** (не один промпт с сидами): например «сцена крупно,
   HUD по краям», «сцена + боковая панель», «поле по центру, панели сверху и снизу»;
4. Собрать доску и остановиться:
   ```
   node <движок>/scripts/asset-bible.mjs . --dir assets/target --title "Целевой кадр"
   ```
5. Выбранный вариант → `assets/target/target-frame.png` (🔴 решение пользователя).

### Ограничение, которое надо назвать вслух
Генерация нарисует детализацию, недостижимую в реальном времени в браузере. Поэтому при
утверждении **разметь, что берём и что нет**: композицию, палитру, плотность, настроение и
расположение блоков — да; фотографические тени, тысячи частиц, уникальный арт в каждом
пикселе — нет. Запиши это строкой в `wiki/design/target-frame.md`, иначе будешь гнаться
за картинкой, которую движок не потянет.

### Как используется дальше
- **производство** сверяется с кадром на каждом шаге: «мы ближе или дальше?»;
- **самооценка по кадрам** (ui-review) сравнивает скриншот с целевым: назвать 3 главных
  расхождения и что из них исправимо;
- кадр пересматривается только новым 🔴-решением — не «я решил, что так лучше».
