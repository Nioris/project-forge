---
name: convert
kind: tactical
description: "Convert HTML5 project to Android APK/AAB for RuStore. Full pipeline from analysis to build. Use when user says \"convert\", \"конвертируй\", \"в apk\", \"android\", \"rustore\", \"apk из…"
---

> Codex adapter: `[INVOCATION_INPUT]` means the actual user text/arguments supplied with this skill invocation; substitute that value wherever the placeholder appears.

# Convert HTML5 → Android

## Arguments
`[INVOCATION_INPUT]`: project folder path (or empty = scan for first unprocessed)

## Pipeline

### 0. Credentials Check + SDK Updates ⚠️ ОБЯЗАТЕЛЬНО ПЕРВЫМ
**Read:** docs/BUILD_KNOWLEDGE.md — актуальные версии SDK, pitfalls, подводные камни
**Read skill:** credentials-check
- Проверить наличие: keystore, ad IDs, AppMetrica, RuStore keys
- Если чего-то нет → СПРОСИТЬ у пользователя, показать где получить и куда положить
- НЕ продолжать сборку без обязательных ключей (keystore минимум)
- Пока пользователь готовит ключи → продолжать шаги 1-3

**⚠️ ОБЯЗАТЕЛЬНО: Проверить актуальные версии SDK через веб-поиск!**
```
ПЕРЕД СБОРКОЙ — выполнить веб-поиск для КАЖДОГО используемого SDK:

1. Capacitor: поиск "capacitor latest version npm 2026"
   → Проверить: package.json использует актуальную версию?
   → Если нет → обновить: npm install @capacitor/core@latest @capacitor/cli@latest @capacitor/android@latest

2. Gradle: поиск "android gradle plugin latest version 2026"
   → Проверить: android/build.gradle использует актуальную версию?

3. Yandex Ads SDK: поиск "yandex mobile ads sdk android latest version"
   → Проверить: build.gradle dependency актуальна?

4. AppMetrica: поиск "appmetrica android sdk latest version"

5. RuStore SDK: поиск "rustore sdk latest version"

ПРАВИЛО: НИКОГДА не использовать версии из своей памяти — они УСТАРЕВШИЕ!
Всегда проверять через веб-поиск перед сборкой.
Если при сборке ошибка — СНАЧАЛА проверить версию SDK, а не городить костыли.
```

### 1. Analyze
**Read skill:** analyze-project
- Detect type (simple HTML, PWA, Canvas game, multi-page, Unity WebGL)
- Check for server dependencies
- Check for assets (images, sounds, fonts)

### 2. Mobile Audit
**Read skill:** mobile-ready
- Touch controls present?
- Responsive layout?
- Correct orientation?
- Fix issues before wrapping

### 3. Choose Strategy
| Type | Strategy |
|------|----------|
| Simple HTML5 (no server) | Capacitor wrap |
| HTML5 + server | TWA (needs hosting) |
| PWA (manifest + SW) | TWA if hosted, else Capacitor |
| Canvas game | Capacitor + orientation lock |

### 4. Wrap
**Read skill:** capacitor-wrap OR twa-wrap (based on strategy)

### 4.5. Иконка и Splash ⚠️ ОБЯЗАТЕЛЬНО

Проверить наличие иконки приложения. Если пользователь дал иконку — использовать её.

```
ПОИСК ИКОНКИ:
1. Проверить: src/icon.png, src/assets/icon.png, assets/icon.png, icon.png
2. Проверить: StoreData/ (может быть готовая 512x512)
3. Спросить пользователя: "Есть готовая иконка? Если да — скинь или скажи путь"

ГЕНЕРАЦИЯ ВСЕХ РАЗМЕРОВ:
Из одной 512x512 PNG создать ВСЕ размеры для Android:

android/app/src/main/res/
├── mipmap-mdpi/ic_launcher.png          (48x48)
├── mipmap-mdpi/ic_launcher_round.png    (48x48)
├── mipmap-hdpi/ic_launcher.png          (72x72)
├── mipmap-hdpi/ic_launcher_round.png    (72x72)
├── mipmap-xhdpi/ic_launcher.png         (96x96)
├── mipmap-xhdpi/ic_launcher_round.png   (96x96)
├── mipmap-xxhdpi/ic_launcher.png        (144x144)
├── mipmap-xxhdpi/ic_launcher_round.png  (144x144)
├── mipmap-xxxhdpi/ic_launcher.png       (192x192)
├── mipmap-xxxhdpi/ic_launcher_round.png (192x192)
└── mipmap-xxxhdpi/ic_launcher_web.png   (512x512) ← оригинал

Команда для ресайза (через sharp/jimp/ImageMagick):
  npx sharp-cli resize 48 48 -i icon-512.png -o mipmap-mdpi/ic_launcher.png
  # или через convert (ImageMagick):
  convert icon-512.png -resize 48x48 mipmap-mdpi/ic_launcher.png
  convert icon-512.png -resize 72x72 mipmap-hdpi/ic_launcher.png
  convert icon-512.png -resize 96x96 mipmap-xhdpi/ic_launcher.png
  convert icon-512.png -resize 144x144 mipmap-xxhdpi/ic_launcher.png
  convert icon-512.png -resize 192x192 mipmap-xxxhdpi/ic_launcher.png

ПРОВЕРКА:
  - ic_launcher.png существует во ВСЕХ 5 mipmap-* папках
  - Размеры правильные (48, 72, 96, 144, 192)
  - НЕ стандартная зелёная иконка Capacitor
  
SPLASH SCREEN (если есть):
  - Создать splash.png из иконки (иконка по центру на фоне цвета приложения)
  - Или использовать @capacitor/splash-screen конфиг
```

**⚠️ НИКОГДА не оставлять стандартную иконку Capacitor в release-билде!**

### 5. Build
- Build debug APK for testing
- Build release AAB for RuStore
- Sign with keystore

### 6. Prepare for Store
**Read skill:** rustore-publish
- App metadata (title, description, category)
- Screenshots (phone + tablet)
- Privacy policy
- Content rating
- RuStore SDK integration (optional)

### 7. Report
Create `CONVERT_REPORT.md` with strategy, changes, build output.

## Non-Negotiable
- [ ] NEVER modify original files — copy first
- [ ] Type detected BEFORE choosing strategy
- [ ] Mobile audit PASSED before wrapping
- [ ] Иконка установлена во ВСЕХ mipmap-* (НЕ стандартная Capacitor)
- [ ] Splash screen настроен (не белый экран)
- [ ] APK builds without errors
- [ ] Min SDK 21, Target SDK 34
- [ ] CONVERT_REPORT.md created
