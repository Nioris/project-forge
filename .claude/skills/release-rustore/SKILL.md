---
name: release-rustore
kind: tactical
description: Release pipeline for RuStore Android APK/AAB. Wraps HTML5 in Capacitor, signs, builds release APK/AAB to Release/{project}/rustore/. Use when user says "release rustore", "собери apk", "build-apk", "rustore-release".
---

# /release rustore

Pipeline для Android APK/AAB в RuStore.

**Источник:** `platforms/rustore/` + `skills/pwa/capacitor-rustore/` + `skills/pwa/deploy-timeweb/`.

## Prerequisites (обязательно)

- [ ] Keystore `.jks` с паролями
- [ ] Иконка 512×512+ png
- [ ] Reklama (опционально): Yandex Ads Block ID
- [ ] Analytics (опционально): AppMetrica API Key или MyTracker

Если чего-то нет — `/credentials-check` сначала, потом продолжай.

## Процесс

### Phase 1 — Read skills
1. `docs/BUILD_KNOWLEDGE.md` — все накопленные ошибки сборки APK
2. `skills/pwa/capacitor-rustore/SKILL.md` — Capacitor specifics
3. `wiki/pitfalls.md` — что ломалось в прошлых сборках

### Phase 2 — Mobile audit
```bash
Прочитай skills/pwa/capacitor-rustore/ — аудит WorkProgress/{Project}/:
- Viewport meta
- Touch events (не только mouse)
- Safe area для notch
- Иконки под mipmap-*
- Manifest/config для Capacitor
```

### Phase 3 — Capacitor wrap

```bash
cd WorkProgress/{Project}
npm install @capacitor/core @capacitor/cli
npx cap init
# configure capacitor.config.ts
npx cap add android
# Replace icons in android/app/src/main/res/mipmap-*
```

### Phase 4 — Build

```bash
# Debug APK (для тестов на устройстве)
cd android && ./gradlew assembleDebug
cp app/build/outputs/apk/debug/app-debug.apk ../../../Release/{Project}/rustore/

# Release AAB (для RuStore)
./gradlew bundleRelease
# signing через keystore конфиг в app/build.gradle
cp app/build/outputs/bundle/release/app-release.aab ../../../Release/{Project}/rustore/
```

### Phase 5 — RuStore manifest

Read skill: `skills/pwa/capacitor-rustore/references/rustore-publish.md`

Создай в `Release/{Project}/rustore/rustore-publish.md`:
- Название + описание (150-4000 chars)
- Политика конфиденциальности (URL или текст)
- Категория
- Возрастной рейтинг
- Скриншоты размером и количеством по требованиям RuStore
- Privacy policy URL

## Выход

```
Release/{Project}/rustore/
├── app-debug.apk
├── app-release.apk
├── app-release.aab
├── signing-report.txt   # SHA-1, SHA-256 fingerprints
└── rustore-publish.md
```

## Non-Negotiable

- [ ] Реальный keystore, не debug-keystore
- [ ] Иконки заменены во ВСЕХ `mipmap-*` директориях (не стандартная Capacitor)
- [ ] Signing конфиг не коммитится в git
- [ ] `build.gradle` использует signingConfig `release`
- [ ] APK протестирован на реальном устройстве ДО заливки AAB в RuStore
