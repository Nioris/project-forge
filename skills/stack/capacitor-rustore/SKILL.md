---
name: capacitor-rustore
description: "Capacitor 6.x: APK from PWA, camera, push, geolocation, RuStore publish. Triggers on: capacitor, APK, rustore, android, native, camera."
---
# Capacitor + RuStore

## Purpose
Wrap PWA as Android APK. Publish to RuStore.

## Instructions
```bash
npm i @capacitor/core @capacitor/cli
npx cap init "App" ru.app.name --web-dir build
npm i @capacitor/android @capacitor/camera @capacitor/geolocation @capacitor/push-notifications
npx cap add android
npm run build && npx cap sync && npx cap open android
```

## Non-Negotiable Acceptance Criteria
- [ ] appId format: ru.company.appname
- [ ] cap sync after every build
- [ ] Permissions in AndroidManifest.xml
- [ ] APK signed for RuStore
