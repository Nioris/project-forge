---
name: monetization-design
kind: architectural
description: "Monetization design: ads-first by default (rewarded + interstitial), with IAP as an opt-in second tier ONLY when the user explicitly asks for in-app purchases. Designs WHERE and WHY to show ads/offers — does NOT implement SDK calls. Triggers on: monetization, ads, revenue, rewarded, conversion, ARPU, retention, IAP, purchase, инапы, покупки."
---

# Monetization Design

## ⭐ Tiered model — read FIRST (decides what this skill builds)

Forge monetization has two tiers. **Default to Tier 1. Only add Tier 2 on explicit request.**

- **Tier 1 — Ads (PRIORITY 1, always the default):** rewarded video + interstitial + (optional)
  banner. Soft currency earned by playing; hard currency earned via rewarded ads + achievements +
  leaderboards. **No purchases.** This is the complete monetization design unless the user says
  otherwise. The game stays fully playable and winnable without spending money.

- **Tier 2 — IAP (PRIORITY 2, opt-in ONLY):** in-app purchases — gem packs, starter pack, remove-ads.
  Build this **only when the user explicitly asks** — e.g. "добавь инапы", "нужны покупки", "add IAP",
  "сделай магазин за деньги". If they didn't ask for purchases, do NOT design them.

**Decision gate (do this before designing):**
```
Did the user explicitly request in-app purchases / paid items / a money shop?
  NO  (default)  → Tier 1 only. Skip Step 1b and the IAP parts of Steps 3-4. Don't push purchases.
  YES (opt-in)   → Tier 1 + Tier 2. Add the IAP catalog, paid offers, and purchase funnel.
```
When unsure, ask one line: "Только реклама, или добавить и внутриигровые покупки (IAP)?" — then proceed.

## Phase 0: Research references (v4.5+, MANDATORY unless user skips)

**Before making changes, understand what similar successful games/apps do.** This prevents blind reinvention and grounds decisions in real patterns.

Invoke: `/research-references {genre/category} {specific-aspect}`

This produces `wiki/research/{Project}-references.md` with 3-5 real competitors, extracted patterns, and UI/UX direction. Wait for user confirmation of the direction before applying changes below.

**Skip if:** user explicitly says "skip research" / "без research", or `wiki/research/{Project}-references.md` already exists and is <14 days old.

---

## Purpose
Design WHAT to monetize and WHERE to place it. SDK implementation is handled by CLAUDE.md pipeline — this skill only designs the strategy. Output: a monetization map that the SDK integrator follows.

## ⚠️ SCOPE
- ✅ DESIGN: what to sell, where to show ads, reward amounts, price points
- ✅ CREATE: UI elements (shop screen, offer popups, reward buttons)
- ✅ ADD: game mechanics that support monetization (soft/hard currency, energy)
- 🚫 NEVER: write YandexSDK.* calls (that's CLAUDE.md Phase 1 job)
- 🚫 NEVER: change existing ad/purchase SDK wrappers

---

## Step 1: Currency System (Tier 1 — always)

Every F2P game needs dual currency. **By default both are EARNED, never purchased.**

```javascript
// SOFT currency (coins/gold) — earned by playing
// HARD currency (gems/crystals) — scarce, EARNED via rewarded ads + achievements + leaderboards
//                                  (NOT purchased — that's Tier 2 / opt-in only)

const ECONOMY = {
  soft: {
    name: 'coins',
    earnPerRun: { min: 20, max: 100 },        // based on score/performance
    earnPerAd: 50,                              // rewarded video bonus
    earnDaily: [50, 100, 150, 200, 250, 300, 500], // daily bonus
  },
  hard: {
    name: 'gems',
    earnPerAd: 1,                               // rewarded: 1 gem per video
    earnPerAchievement: [1, 2, 3, 5],           // scale with difficulty
    earnPerLeaderboard: [1, 2, 3],              // ranking rewards
    earnDaily: 0,                                // day 4 and 7 only
    // NO purchase source by default — hard currency is earned, period (Tier 1)
  },
  // SINK (where currency goes):
  upgrades: 'soft',          // permanent upgrades cost coins
  cosmetics: 'hard',         // skins cost gems
  continues: 'soft_or_ad',   // continue run: 100 coins OR watch ad
  skipWait: 'hard',          // skip energy timer: 1 gem
};
```

### Step 1b: IAP price anchoring (Tier 2 — ONLY if user requested purchases)

⚠️ **Skip this entire sub-step unless the user explicitly asked for IAP** (see decision gate). If
they did, add gem-purchase + a hard-currency `buy` source to the economy above:

```javascript
// IAP price points (Yandex Games uses YAN currency) — Tier 2 only
const IAP_CATALOG = [
  // Small — impulse buy
  { id: 'gems_10', gems: 10, price: 15, label: '10 💎', popular: false },
  // Medium — BEST VALUE (mark it!)
  { id: 'gems_50', gems: 50, price: 49, label: '50 💎 +20% БОНУС', popular: true },
  // Large — whale bait
  { id: 'gems_150', gems: 150, price: 99, label: '150 💎 +50% БОНУС', popular: false },
  // Special — remove ads forever
  { id: 'no_ads', removeAds: true, price: 59, label: 'Без рекламы навсегда', popular: false },
  // Starter pack — one-time, huge value
  { id: 'starter', gems: 30, coins: 500, skin: 'gold', price: 29, label: 'Стартовый набор', oneTime: true },
];
```

## Step 2: Ad Placement Map

### Interstitial (fullscreen, forced)
**RULE:** Only at NATURAL PAUSES. Never during gameplay.

| Moment | Good? | Why |
|--------|-------|-----|
| After death / game over | ✅ BEST | Player already stopped, low frustration |
| Between levels | ✅ GOOD | Natural break |
| Returning to menu | ✅ OK | Transition moment |
| Opening shop/inventory | ❌ BAD | Punishes browsing |
| During gameplay | ❌ FORBIDDEN | Yandex rejects this |
| First 30 seconds | ❌ BAD | Player hasn't engaged yet |

```javascript
// Interstitial cooldown: minimum 60 seconds between shows
// Track: deathCount, levelCompletions — show every 2-3 events, not every one
const AD_COOLDOWN = 60000; // ms
const AD_EVERY_N_DEATHS = 2; // not every death
let lastAdTime = 0;
let deathsSinceAd = 0;

function shouldShowInterstitial(event) {
  if (Date.now() - lastAdTime < AD_COOLDOWN) return false;
  if (event === 'death') {
    deathsSinceAd++;
    return deathsSinceAd >= AD_EVERY_N_DEATHS;
  }
  if (event === 'level_complete') return true;
  return false;
}
// After showing: lastAdTime = Date.now(); deathsSinceAd = 0;
```

### Rewarded Video (opt-in, player chooses)
**RULE:** Always show WHAT the reward is BEFORE asking to watch.

| Hook | Reward | When to Offer |
|------|--------|---------------|
| Continue after death | Revive with 50% HP | Game over screen: "Посмотреть рекламу и продолжить?" |
| Double coins | 2x run earnings | Result screen: "Удвоить награду?" |
| Free currency | 50 coins or 1 gem | Main menu: daily free reward button |
| Unlock hint | Show solution | Puzzle: after 3 failed attempts |
| Bonus chest | Random loot | After level: "Открыть бонусный сундук?" |
| Extra lives | +1 life | Before run: "Начать с доп. жизнью?" |
| Speed boost | 2x production for 30min | Idle: timed boost button |

```javascript
// Rewarded video button pattern:
// 1. Show button with reward preview
// 2. Player taps → SDK shows ad
// 3. Ad completes → give reward
// 4. Ad skipped/error → no reward, no punishment
// 5. Cooldown: 1 min between rewarded videos

function createRewardButton(container, rewardText, callback) {
  // Visual: [▶ icon] [reward description]
  // Example: [▶] Удвоить монеты: +120 → +240
  // CRITICAL: Button must show the EXACT reward amount
}
```

### Sticky Banner
```javascript
// Small banner at top or bottom — always visible during gameplay
// Height: 50-70px depending on screen
// MUST NOT overlap game controls or important UI
// Subtract banner height from game area calculation
```

## Step 3: Conversion Funnel (Tier 2 — ONLY if user requested IAP)

⚠️ **Skip this step entirely for the default ads-only design.** A purchase funnel only exists if
there are purchases. Use this only when the user opted into IAP.

```
Free player → sees rewarded ads → earns slowly → wants faster progress
                                                          ↓
                                               sees IAP in shop
                                                          ↓
                                        buys starter pack (best value)
                                                          ↓
                                            hooked → buys more gems
```

### Soft Paywall Triggers (Tier 2)
```javascript
// Show shop/offer at these moments (ONLY if IAP enabled):
// 1. Player tries to buy upgrade but doesn't have enough coins
//    → "Не хватает 50 монет. [Посмотреть рекламу +50] [Купить 💎]"

// 2. Player dies 3+ times on same level
//    → "Сложно? [Улучшить оружие] [Продолжить бесплатно]"

// 3. Player sees cool skin in game (other players or NPCs)
//    → Small indicator: "🔒 Скин 'Золотой' — 10 💎"

// 4. After best performance ever
//    → "Рекорд! Отметь победу: [Стартовый набор -50%]" (one-time)
```

**Tier 1 equivalent (ads-only "funnel"):** there's no paywall — the loop is play → earn → rewarded-ad
for a boost → progress. The "conversion" is simply: offer a rewarded ad at the moment the player wants
more (more coins, a revive, a skip). No money, no shop. That's the whole funnel by default.

## Step 4: Output — Monetization Map

After analysis, create this document for the SDK integrator:

```markdown
## Monetization Map: {Game Name}

### Currencies
- Soft: {name}, earn rate: {X per run}
- Hard: {name}, earn rate: {X per ad}

### Interstitial Ads
1. {moment} — every {N} events, cooldown {X}s
2. {moment} — ...

### Rewarded Video
1. {hook}: reward {X}, offered at {screen/moment}
2. {hook}: ...

### IAP Catalog  ← include this section ONLY if Tier 2 (user requested IAP); omit entirely otherwise
| ID | Content | Price (YAN) | Notes |
...

### Soft Paywalls  ← Tier 2 only; omit for ads-only
1. {trigger} → {offer}
2. ...
```

## Non-Negotiable Acceptance Criteria

**Tier 1 (always — the default ads-only design):**
- [ ] Dual currency system (soft + hard), both EARNED — hard via rewarded ads / achievements / leaderboards
- [ ] Interstitial ONLY at natural pauses, cooldown >= 60s
- [ ] Rewarded video shows exact reward BEFORE asking
- [ ] At least 3 rewarded video hooks (all opt-in upside)
- [ ] Game is fully playable and winnable while ignoring every ad (no ad-gating, no pay-to-progress)
- [ ] No pay-to-win: any paid items (if Tier 2) = cosmetic or convenience, not power
- [ ] Monetization map document created for SDK integrator
- [ ] ⚠️ ZERO SDK calls written — only design/UI, SDK integrator handles calls
- [ ] Did NOT design IAP / purchases unless the user explicitly requested them

**Tier 2 (ONLY if user opted into IAP — otherwise these must be absent):**
- [ ] IAP catalog with "best value" highlighted
- [ ] "Remove ads" option exists
- [ ] Purchase funnel + soft paywalls designed
- [ ] Hard currency may add a `buy` source alongside its earned sources

## 🔥 АГРЕССИВНАЯ ads-only ДОКТРИНА (v4.30.8 — «вежливая» монетизация запрещена)

Наша модель: заработок = реклама. Значит RV-хук ставится на КАЖДОЕ желание игрока. Правило
плотности: **игрок должен встречать осмысленное RV-предложение каждые 2-3 минуты игры.**

### Каталог RV-хуков (выбрать МИНИМУМ 5 под жанр, цель 6-8)
| Желание игрока | Хук | Паттерн |
|---|---|---|
| «быстрее» | ускорение ×2 на N мин / мгновенное завершение таймера | стройки, крафт, кулдауны |
| «больше денег» | ×2-×3 к награде (окно 10с после получения) | конец уровня/заказа/боя |
| «ещё раз» | второй шанс / revive / продолжить после поражения | смерть, провал, game over |
| «не хочу ждать» | сброс кулдауна способности/попытки | энергия, попытки, спины |
| «дай ресурс» | бесплатный сундук/бустер каждые N минут по RV | периодический магнит в HUD |
| «стартовый буст» | бафф на партию (×2 доход / +скорость) перед стартом | экран перед уровнем |
| «удвоить дейлик» | ×2 к ежедневной награде | daily-петля |
| «доп. слот/попытка» | +1 слот стройки / +1 реролл / +1 ход | системные лимиты |

### Interstitial (фон, не основа)
Между сессиями/уровнями, кулдаун ≥60с, ТОЛЬКО после жеста (4.4). Наращивать агрессию тут НЕЛЬЗЯ
— злит и роняет рейтинг (2.13). Агрессия живёт в RV, не в межстраничке.


### 🚫 Правило дифференциации хуков (полевой дефект: кнопки-клоны)
Один ТИП награды = максимум ОДИН хук. 6 хуков = 6 РАЗНЫХ выгод (деньги, ускорение, очки, буст,
второй шанс, скин/слот, дейлик ×2) — не три кнопки «+монеты» в разных углах. Проверка при
ретрофите: выпиши таблицу «хук → награда»; повтор награды = дефект, замени на другой паттерн
из каталога. Хуки различаются и ПО МОМЕНТУ (до партии / во время / после / при провале) — 
покрытие моментов важнее количества кнопок.

### Границы (агрессивно ≠ самоубийственно)
- RV всегда ДОБРОВОЛЬНЫЙ (4.5: по жесту, по кнопке) — потому его и можно ставить густо;
- база играбельна без рекламы: RV ускоряет/умножает/возрождает, но не открывает core loop
  (иначе рейтинг умрёт быстрее, чем накапает ARPDAU);
- каждый хук честный: обещал ×2 — дай ×2; фейк = отзывы = 2.13;
- пауза звука/игры под рекламой (4.7), сейв до показа (4.2) — как всегда.

### Метрики агрессии (в metrics.md игры)
RV-показы/DAU: floor 1.0, target 2.5, stretch 4+. Хуков в билде: ≥5. Если RV/DAU < 1 —
хуки стоят не на желаниях, переставить.

## 🔧 РЕТРОФИТ существующей игры (усиление монетизации за один заход)
1. Инвентарь: grep showRewardedVideo — сколько хуков есть, где стоят.
2. Карта желаний: пройди по системам игры (таймеры, награды, поражения, лимиты, дейлики) —
   каждой системе хук из каталога.
3. Дельта: выбери топ-5 недостающих по частоте контакта игрока (то, что он видит каждую сессию).
4. Реализация: кнопки RV с иконкой 📺 и ЧЕСТНЫМ текстом ВЫГОДЫ («Реклама: ×2 монеты»).
   ⚠️ п.4.5.1 (полевой отказ): голое число рядом с кнопкой читается как РАЗМЕР НАГРАДЫ, хотя
   означает остаток применений. Награда — на кнопке словами; остаток — отдельной строкой
   («осталось 3 из 5»). Неоднозначный маркер = отказ,
   без тёмных паттернов; все через существующий ad-слой (пауза/сейв уже там).
5. Проверка: playtest → каждый хук кликабелен, награда выдаётся, отказ от просмотра не ломает;
   debugcheck RV-коллбеки зелёные.

## 💰 ГИБРИДНАЯ МОДЕЛЬ (платежи + реклама) — для игр с длинным прогрессом

🔥 Агрессивная ads-only доктрина выше писалась под казуалки на Яндексе. Для **стратегий,
градостроителей, клановых игр с таймерами** она не работает: прогресс там измеряется часами и
днями, рекламой такие масштабы не проскакиваются. Здесь модель другая, и роли строго разделены.

### Иерархия (фиксируется в GDD ДО баланса)
| Слой | Что даёт | Роль |
|---|---|---|
| **Платежи (IAP)** | ускорители пачками, ресурсы, сезонный пропуск, слоты строительства/маршей, косметика | ПРОГРЕСС и удобство — основной доход |
| **Реклама (RV)** | мелкие ускорения, ×2 к сбору, щит, ×2 к дейлику, бесплатный сундук | ПРИВЫЧКА и вовлечение — не источник прогресса |

### Железные правила
1. **RV не эквивалент покупки.** Если рекламой добывается то же, что за деньги, платить
   перестают ВСЕ. Реклама даёт минуты, покупка — часы и дни.
2. **Лимиты на RV обязательны**: 3-5 просмотров в день на категорию, счётчик виден игроку.
   Безлимитная реклама обесценивает покупку и ломает экономику.
3. **Красная линия pay-to-win**: деньги дают СКОРОСТЬ и УДОБСТВО, не абсолютную силу.
   Платящий обязан быть сильнее (иначе не платит), но не неуязвим (иначе некому проигрывать).
   Сезонное обнуление лечит перекос лучше любых формул.
4. **Первая покупка проектируется отдельно**: дешёвый стартовый набор с очевидной ценностью
   в первые 3-7 дней. Конверсия в первый платёж — самая трудная точка воронки.
5. **Валидация покупок на сервере обязательна.** Клиентское «я купил» подделают на первой
   неделе. Чек проверяется бэкендом до выдачи товара (см. /multiplayer, async-профиль).
6. Интерстишлы в таких играх — **между сессиями и только для неплатящих**; платящему рекламу
   не показывать вообще (это стандарт жанра и уважение к покупке).

### Метрики гибрида (в metrics.md)
Конверсия в платящих (доля), ARPPU, средний чек, доля дохода IAP vs реклама, RV/DAU у
неплатящих. Ориентир здорового гибрида: реклама даёт 10-25% дохода, остальное платежи; если
реклама даёт больше половины — прогрессия слишком дешёвая, экономика поедет.
