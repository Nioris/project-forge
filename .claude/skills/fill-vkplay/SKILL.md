---
name: fill-vkplay
kind: tactical
description: "Заполнение VK Play Game card на developers.vkplay.ru: название (рус+англ), описание ≥150/≤4000, tech description, скриншоты ≥3, иконка 1024×1024, loading 1000×1000, категория, возрастной рейтинг, языки, поддержка, privacy. Triggers on: заполнить vkplay, game card vkplay, описание вкплей, /fill-vkplay."
---

# /fill-vkplay — Заполнение VK Play Game card

Запускается параллельно или после `/release-vkplay`. Готовит все материалы для Game card на developers.vkplay.ru.

**Важно:** это VK Play (vkplay.ru), не VK Mini Apps (vk.com). Для VK Mini Apps — `/fill-vk` (отдельный skill).

## Что делает

Создаёт `StoreData/vkplay/`:
- `name-ru.txt` + `name-en.txt` — названия игры
- `description-ru.md` + `description-en.md` — основное описание (≥150, ≤4000)
- `tech-description-en.md` — техническое описание (только EN, для модерации)
- `category.md` — выбранная категория из списка VK Play
- `age-rating.md` — возрастной рейтинг с обоснованием
- `languages.md` — список поддерживаемых языков
- `support-contacts.md` — email + чат + privacy policy URL
- `screenshots-checklist.md` — 3+ скриншотов с подсказками
- `icons-checklist.md` — иконка 1024×1024, loading 1000×1000
- `art-prompts.md` — промпты для иконки и арта
- `SUBMISSION_CHECKLIST.md` — финальный чеклист

## Phase 0: Research

```
/research-references {жанр} VK Play vkplay браузерные игры популярные
```

Изучи 3-5 игр в жанре на vkplay.ru. Отметь:
- Стиль их описаний (formal/playful, длина, структура)
- Какую категорию выбрали
- Возрастные рейтинги (16+, 18+, 12+)
- Promo material visual style (цветовая гамма, контраст)

## Phase 1: Названия

### Русское название
- Длина: 1-50 chars
- Допускается кириллица + латиница + цифры
- НЕТ: эмодзи, специальные символы (★, ❤, etc)
- Не должно совпадать с существующей игрой на платформе

### Английское название
- 1-50 chars latin
- Обычно либо транслит русского, либо отдельный English brand name
- Обязательно если планируется international release

## Phase 2: Описания

### Описание (RU + EN, минимум 150, максимум 4000 chars)

Структура:
```
[Hook 1-2 предложения — что игра]

[Главные особенности (3-5 буллетов)]
• Конкретная фича 1
• Конкретная фича 2
• Что отличает от конкурентов

[Краткий сюжет / setting если есть]

[Кому подойдёт]

[Призыв к действию]
```

Markdown допустим в VK Play описаниях:
- `**bold**`, `*italic*`
- `### Заголовки`
- Списки через `-` или `*`
- Ссылки `[text](url)`

**НЕ используй:**
- Caps lock на целые предложения
- Слова типа "лучшая", "невероятная" — модерация может отклонить за гиперболу
- HTML теги (только markdown)
- Прямые ссылки на конкурентов (Steam, Yandex Games — disallowed)

### Tech description (EN only)

Описание для модераторов VK Play, юзеры его НЕ видят:
```
HTML5 game built on {engine — Phaser/PixiJS/Construct}.
Architecture: iframe-embedded, JS API integration, server-side auth via signed hash.
Backend: {Node.js / Cloudflare Workers / etc}.
Cloud saves: yes (server-side per-user).
Payments: {VK Play Wallet / disabled for free game}.
Multiplayer: {none / async / real-time WebSocket}.
Avg session length: {N} min.
Age appropriate: {12/16/18}+.
```

Это help модератору быстро понять что у тебя за продукт.

## Phase 3: Категория

VK Play имеет фиксированный список категорий. На момент написания (проверь dev portal — список может меняться):

- **Аркады** — простые, casual gameplay
- **Головоломки** — puzzles
- **Стратегии** — RTS, TBS
- **Симуляторы** — simulation
- **Гонки** — racing
- **Спорт** — sports
- **Приключения** — adventure
- **Шутеры** — shooters
- **RPG** — role-playing
- **Карточные** — card games
- **MMO** — massively multiplayer
- **Файтинги** — fighting

Выбирай **одну primary**. Если игра гибрид (например, RPG + Card) — выбирай ту что больше driveит gameplay.

## Phase 4: Возрастной рейтинг

VK Play использует российские стандарты (по аналогии с PEGI/ESRB):

- **0+** — без насилия, без сложных тем (например, Match-3, casual)
- **6+** — мультяшное насилие, без крови
- **12+** — fantasy combat, легкие references на violence
- **16+** — реалистичное насилие, blood
- **18+** — gore, sexual content, наркотики (требует special approval)

Выбирай **honestly**. Если поставишь 6+ а у тебя fictional violence — модерация перенесёт на 12+ и срок продлится.

## Phase 5: Языки и поддержка

### Supported Languages
- Минимум: Russian (ru) + English (en)
- Чем больше — тем больше discoverability в search
- В Game card отметь которые языки **полностью** локализованы (UI + content), не частично

### Support Contacts
- **Support email** — обязательный, должен реально отвечать (модерация может test'ить)
- **Support chat** — опционально (Telegram/Discord)
- **Privacy Policy URL** — обязательный если есть **любая** обработка persона данных (auth, analytics, payment). Шаблон политики на https://www.privacypolicies.com/ или своя страница на твоём домене.

## Phase 6: Screenshots & Icons

### Screenshots (минимум 3, рекомендовано 5-8)
- Размер: 16:9 рекомендовано (1280×720 минимум, 1920×1080 идеально)
- Формат: PNG или JPG
- Должны показывать **gameplay**, не только меню
- Без UI overlay'ев типа "DEBUG" / FPS counter
- Без watermark'ов

### Главная иконка
- **1024×1024 PNG**
- На прозрачном фоне (если возможно) или solid цвет
- Узнаваемая в маленьком размере (preview в каталоге часто 64×64)
- НЕТ текста (название уже отдельно показывается)

### Loading Image (опционально)
- **1000×1000 PNG** или JPG
- Показывается между кликом Play и загрузкой iframe
- Можно поставить gamenfo art или просто красивый logo

### Промпты для арта
`/art-prompts` сгенерирует промпты под:
- Иконку (style description, focal element)
- Loading image (atmosphere, color palette)
- Banner для promo (если planning featured placement)

## Phase 7: Final Submission Checklist

`StoreData/vkplay/SUBMISSION_CHECKLIST.md`:

```markdown
## Pre-Submit Checklist

### Texts
- [ ] Название RU 1-50 chars
- [ ] Название EN 1-50 chars
- [ ] Описание RU 150-4000 chars
- [ ] Описание EN 150-4000 chars (если planning international)
- [ ] Tech description EN заполнен
- [ ] Никакой гиперболы / caps lock / forbidden words

### Categorization
- [ ] Категория выбрана из списка
- [ ] Возрастной рейтинг честный
- [ ] Tags релевантные

### Languages & Support
- [ ] Минимум RU + EN languages указаны
- [ ] Support email отвечает
- [ ] Privacy policy URL валидный (если есть data processing)

### Visuals
- [ ] Иконка 1024×1024 ✅
- [ ] Loading image 1000×1000 (если есть) ✅
- [ ] 3+ скриншотов 16:9, gameplay
- [ ] Никаких debug overlay/watermarks

### Tech
- [ ] iframe URL HTTPS
- [ ] iframe URL открывается в browser (тест curl)
- [ ] /api/auth/vkplay endpoint отвечает 200 на legit hash
- [ ] /api/webhook/vkplay-payment endpoint развёрнут
- [ ] Pre-submit script показал 0 blockers

### Payment (если applicable)
- [ ] integration@vk.team запрошено включение payment
- [ ] Подтверждение payment system enabled получено
- [ ] Test purchase прошёл

### Legal
- [ ] ИП/ЮЛ оформлены
- [ ] Налоговая ставка указана (НДС 20% или УСН)
- [ ] Banking details для receiving payments

### Final
- [ ] Game card preview визуально OK
- [ ] iframe URL работает в incognito (нет dependency на cookies)
```

## Что НЕ делает

- **Не загружает images** — Game card требует ручного upload через UI
- **Не пишет тексты от нуля** — даёт structure и hints, content твой
- **Не оформляет ИП/ЮЛ** — manual процесс
- **Не настраивает privacy policy** — даёт template URL, не пишет policy

## Related

- `/release-vkplay` — основной release pipeline
- `/art-prompts` — промпты для иконки/loading/banner
- `/fill-vk` — для VK Mini Apps (другая платформа!)
- `platforms/vkplay/README.md` — техническая документация
- Docs: https://documentation.vkplay.ru/f2p_vkp/f2p_setups_sbs_vkp

## Non-Negotiable

- [ ] Phase 0 research перед description writing
- [ ] Описание ≥150 chars (VK Play HARD min)
- [ ] Описание ≤4000 chars (VK Play HARD max)
- [ ] Tech description на EN (для модерации)
- [ ] Возрастной рейтинг честный — модерация проверяет
- [ ] Privacy policy URL обязателен если есть auth/payment/analytics
- [ ] НЕ путать с VK Mini Apps Game card (другие требования)
