---
name: build-apk
kind: tactical
description: Build Android APK from HTML/PWA project using Capacitor and prepare for RuStore. Use when user says "build apk", "android", "rustore", "собери apk", "сборка", "публикация".
---

# Build APK for RuStore

## Purpose
Convert HTML5/PWA project to Android APK via Capacitor and prepare for RuStore publication.

## Instructions

### Step 0: Credentials Check + SDK Updates ⚠️ ОБЯЗАТЕЛЬНО
**Read:** docs/BUILD_KNOWLEDGE.md — актуальные версии SDK, Capacitor pitfalls, подпись
**Read skill:** credentials-check (секция "Для RuStore")
- Проверить: keystore, ad IDs, AppMetrica, RuStore SDK keys
- Если keystore нет → предложить сгенерировать или спросить путь
- Если ad IDs нет → спросить, показать где получить
- НЕ собирать release APK без keystore

**⚠️ ОБЯЗАТЕЛЬНО: Проверить актуальные версии через веб-поиск!**
```
Выполнить веб-поиск для КАЖДОГО SDK перед сборкой:
- "capacitor latest version npm" → обновить если устарел
- "android gradle plugin latest version" → обновить build.gradle
- "yandex mobile ads sdk android latest" → если используется
- "appmetrica android sdk latest" → если используется

ПРАВИЛО: при ошибке сборки СНАЧАЛА проверь версию SDK через поиск.
НЕ городить костыли вокруг багов старой версии!
```

### Step 1: Initialize Capacitor

```bash
# Install Capacitor
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/android

# Initialize
npx cap init "{App Name}" "com.yourcompany.appname" --web-dir dist

# Add Android platform
npx cap add android
```

### Step 2: Build and sync

```bash
# Build web assets (depends on your build tool)
# For plain HTML: copy to dist/
# For SvelteKit: npm run build

# Sync to Android
npx cap sync android
```

### Step 2.5: Иконка приложения ⚠️ ОБЯЗАТЕЛЬНО

```
ПЕРЕД СБОРКОЙ — проверить что иконка НЕ стандартная Capacitor!

1. Найти иконку пользователя:
   - src/icon.png, assets/icon.png, icon.png, StoreData/*.png
   - Спросить: "Есть готовая иконка 512x512? Скажи путь"

2. Сгенерировать все размеры из 512x512:
   android/app/src/main/res/mipmap-mdpi/ic_launcher.png      (48x48)
   android/app/src/main/res/mipmap-hdpi/ic_launcher.png      (72x72)
   android/app/src/main/res/mipmap-xhdpi/ic_launcher.png     (96x96)
   android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png    (144x144)
   android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png   (192x192)
   + ic_launcher_round.png те же размеры

3. Проверить визуально: ls -la android/app/src/main/res/mipmap-*/
   Каждая папка должна содержать ic_launcher.png ПРАВИЛЬНОГО размера

⚠️ Если иконка стандартная Capacitor (зелёный логотип) — release НЕЛЬЗЯ собирать!
```

### Step 3: Configure for RuStore

Edit `android/app/build.gradle`:
```gradle
plugins {
    id 'ru.rustore.publish' version '0.5.0'
}

rustore {
    companyId = System.getenv('RUSTORE_COMPANY_ID')
    keyId = System.getenv('RUSTORE_KEY_ID')
    keyPath = file(System.getenv('RUSTORE_KEY_PATH'))
}
```

Build signed APK:
```bash
cd android
./gradlew assembleRelease
```

APK location: `android/app/build/outputs/apk/release/app-release.apk`

For detailed Capacitor + RuStore setup, read: `skills/pwa/capacitor-rustore/SKILL.md`

## Non-Negotiable
- [ ] APK builds without errors
- [ ] App icons and splash screens configured
- [ ] Signing key created and secured
- [ ] RuStore metadata prepared (description, screenshots)
- [ ] Min SDK version set appropriately (API 24+)
