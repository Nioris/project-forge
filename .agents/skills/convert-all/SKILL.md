---
name: convert-all
kind: tactical
description: "Конвертировать ВСЕ необработанные проекты в input/ в Android APK."
---

Convert ALL unprocessed projects in input/.

Scan input/ → for each folder not in output/ → run $convert {name}

Summary at end:
```
✅ project-a — Capacitor → APK 4.2MB
⚠️ project-b — Server detected
❌ project-c — Build failed
⏭️ project-d — Already converted
```
