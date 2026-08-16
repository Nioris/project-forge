# Skill Catalog

Read this file to know which skills exist and when to load them.

## How Skill Selection Works

1. User describes what they want to build
2. You read this catalog
3. Match keywords → select skills
4. Load selected SKILL.md files
5. If nothing matches → use `/write-skill` to create a new one

## Catalog

### Core Skills (load for ANY project that needs them)

| Skill | Path | Load When |
|-------|------|-----------|
| visual-quality | `skills/core/visual-quality/` | Any Canvas game — rendering, particles, sound |
| game-ui | `skills/core/game-ui/` | Any game with menus, HUD, shops, inventory |
| mobile-controls | `skills/core/mobile-controls/` | Any game — PC + touch input |
| html-template | `skills/core/html-template/` | Any single-file HTML5 game |

### Game Genre Skills (load ONE matching genre)

| Skill | Path | Keywords |
|-------|------|----------|
| platformer | `skills/games/platformer/` | jump, platform, gravity, Mario, side-scroller |
| shooter | `skills/games/shooter/` | shoot, bullet, gun, enemies, waves, space |
| puzzle | `skills/games/puzzle/` | puzzle, match, sokoban, logic, tiles, merge |
| tower-defense | `skills/games/tower-defense/` | tower, defense, TD, waves, path, turret |
| idle-clicker | `skills/games/idle-clicker/` | idle, clicker, incremental, upgrade, passive |
| roguelike | `skills/games/roguelike/` | roguelike, dungeon, permadeath, procedural, loot |
| runner | `skills/games/runner/` | runner, endless, dodge, obstacles, auto-run |
| fighting | `skills/games/fighting/` | fight, combat, martial, versus, punch, kick |
| racing | `skills/games/racing/` | race, car, drift, speed, track, driving |
| rhythm | `skills/games/rhythm/` | rhythm, music, beat, notes, timing, dance |
| strategy | `skills/games/strategy/` | strategy, tactics, turn-based, grid, units, chess |
| simulation | `skills/games/simulation/` | sim, tycoon, farm, cafe, manage, build, grow |
| survival | `skills/games/survival/` | survival, craft, resources, day-night, hunger |
| cardgame | `skills/games/cardgame/` | cards, poker, deck, blackjack, solitaire, hand |
| sports | `skills/games/sports/` | sports, ball, goal, football, golf, tennis |
| sandbox | `skills/games/sandbox/` | sandbox, build, destroy, physics, powder, blocks |

### Game System Skills (load for complex games)

| Skill | Path | Load When |
|-------|------|-----------|
| deepgame-systems | `skills/games/deepgame-systems/` | RPG, inventory, quests, skill trees, dialogue, crafting |

### App Category Skills (load ONE matching category)

| Skill | Path | Keywords |
|-------|------|----------|
| finance | `skills/apps/finance/` | budget, money, expense, savings, investment, crypto, calculator |
| utility | `skills/apps/utility/` | calculator, timer, converter, notes, counter, clock, tools |
| health | `skills/apps/health/` | health, fitness, workout, habits, water, mood, meditation, sleep |
| productivity | `skills/apps/productivity/` | todo, tasks, kanban, pomodoro, planner, goals, time tracking |
| education | `skills/apps/education/` | learn, study, flashcards, quiz, vocabulary, math, typing |
| social | `skills/apps/social/` | poll, vote, social, team, reaction, wheel, icebreaker |
| tools | `skills/apps/tools/` | QR, password, color, JSON, regex, markdown, generator, encoder |

### App System Skills (load for complex apps)

| Skill | Path | Load When |
|-------|------|-----------|
| deepapp-systems | `skills/apps/deepapp-systems/` | Multi-page app, charts, dark mode, data export, settings |

### Publishing Skills — VK Mini Apps

| Skill | Path | Load When |
|-------|------|-----------|
| vk-release | `.claude/skills/vk-release/` | Релиз в VK Mini Apps — полный 3-фазный пайплайн |
| vk-sdk-integration | `.claude/skills/vk-sdk-integration/` | Интеграция VK Bridge в игру / приложение |
| fill-vk | `.claude/skills/fill-vk/` | Заполнение карточки каталога ВК |

**VK release** → load: vk-release + vk-sdk-integration + fill-vk
**Быстрый фикс VK-проблем** → load: vk-sdk-integration (содержит 10 причин реджекта)
**Только карточка, код уже готов** → load: fill-vk

## Selection Rules

1. **Game project** → always load: visual-quality + game-ui + mobile-controls + html-template + matching genre
2. **Complex game (RPG, deckbuilder)** → also load: deepgame-systems
3. **App project** → load: matching category
4. **Complex app** → also load: deepapp-systems
5. **Mix genres** → load BOTH genre skills
6. **Bot / API / backend** → no existing skill → run `/write-skill` to create
7. **Unclear** → ask user ONE question to clarify, then select

## If No Skill Matches

Use `/write-skill` to create a new one on the fly. Example:
```
/write-skill telegram bot that monitors prices and sends alerts
```
This creates `skills/custom/{name}/SKILL.md` and saves it for future use.

---

### Stack Skills (load based on tech requirements)

| Skill | Path | Load When |
|-------|------|-----------|
| sveltekit | `skills/stack/sveltekit/` | ANY SvelteKit project — routing, stores, PWA |
| dexie-offline | `skills/stack/dexie-offline/` | ANY offline-first app — IndexedDB, sync |
| pocketbase | `skills/stack/pocketbase/` | Projects with backend — auth, collections |
| tailwind-system | `skills/stack/tailwind-system/` | ANY UI project — design tokens, components |
| capacitor-rustore | `skills/stack/capacitor-rustore/` | Mobile build — APK, RuStore, native APIs |
| seo-russian | `skills/stack/seo-russian/` | SEO content — articles, meta, Yandex |
| ai-integration | `skills/stack/ai-integration/` | AI features — Claude, YandexGPT |
| yookassa-payments | `skills/stack/yookassa-payments/` | Paid subscriptions — checkout, SBP |
| web-push | `skills/stack/web-push/` | Push notifications — reminders, alerts |
| photo-media | `skills/stack/photo-media/` | Camera/photo — capture, compress, upload |
| leaflet-maps | `skills/stack/leaflet-maps/` | Maps/GPS — routes, markers, offline tiles |
| testing | `skills/stack/testing/` | QA — unit tests, E2E, accessibility |
| deploy-vps | `skills/stack/deploy-vps/` | Deploy — Docker, nginx, SSL, CI/CD |
| performance | `skills/stack/performance/` | Optimization — Lighthouse, CWV, lazy load |
| security | `skills/stack/security/` | Security — API keys, XSS, CSP, CORS |

### Selection for PWA Products (Мой Сад, Зеркало, Питомец, etc.)

ALWAYS load these for any PWA product:
- `skills/stack/sveltekit/` — framework
- `skills/stack/dexie-offline/` — offline data
- `skills/stack/tailwind-system/` — UI design
- `skills/stack/pocketbase/` — backend

Load based on features:
- Has payments → `skills/stack/yookassa-payments/`
- Has push → `skills/stack/web-push/`
- Has photos → `skills/stack/photo-media/`
- Has maps → `skills/stack/leaflet-maps/`
- Has AI → `skills/stack/ai-integration/`
- Has SEO articles → `skills/stack/seo-russian/`
- Needs APK → `skills/stack/capacitor-rustore/`
- Going to deploy → `skills/stack/deploy-vps/`

---

### PWA Stack Skills (load for SvelteKit PWA projects)

| Skill | Path | Keywords |
|-------|------|----------|
| sveltekit-pwa | `skills/pwa/sveltekit-pwa/` | PWA, service worker, offline, manifest, workbox |
| dexie-offline | `skills/pwa/dexie-offline/` | IndexedDB, offline, database, Dexie, sync |
| pocketbase | `skills/pwa/pocketbase/` | backend, API, auth, real-time, collections |
| yukassa-payments | `skills/pwa/yukassa-payments/` | payment, subscribe, SBP, paywall, billing |
| auth-vk | `skills/pwa/auth-vk/` | auth, login, VK, OAuth, registration |
| tailwind-mobile | `skills/pwa/tailwind-mobile/` | CSS, design, responsive, mobile, font, dark mode |
| web-push | `skills/pwa/web-push/` | push, notification, remind, alert, VAPID |
| ai-integration | `skills/pwa/ai-integration/` | AI, Claude, GPT, LLM, chat, recommendation |
| seo-content | `skills/pwa/seo-content/` | SEO, meta, sitemap, Yandex, indexing |
| deploy-timeweb | `skills/pwa/deploy-timeweb/` | deploy, server, VPS, Nginx, PM2, SSL |
| capacitor-rustore | `skills/pwa/capacitor-rustore/` | Capacitor, Android, APK, RuStore, native |
| yandex-s3 | `skills/pwa/yandex-s3/` | S3, storage, upload, photo, image, CDN |
| gamification | `skills/pwa/gamification/` | XP, level, streak, achievement, badge |
| content-catalog | `skills/pwa/content-catalog/` | catalog, encyclopedia, database, search |
| regional-calendar | `skills/pwa/regional-calendar/` | calendar, season, region, moon, frost |
| ai-photo | `skills/pwa/ai-photo/` | identify, camera, TensorFlow, plant ID |
| offline-maps | `skills/pwa/offline-maps/` | map, GPS, offline map, trail, hike |

**PWA project** → load: sveltekit-pwa + dexie-offline + pocketbase + tailwind-mobile + auth-vk
**With payments** → also: yukassa-payments
**With push** → also: web-push
**With AI** → also: ai-integration
**With SEO site** → also: seo-content
**For RuStore** → also: capacitor-rustore
**With photos** → also: yandex-s3 + ai-photo
**With gamification** → also: gamification
**With catalogs** → also: content-catalog
**With calendars** → also: regional-calendar
**With maps** → also: offline-maps
**Deploy** → also: deploy-timeweb
