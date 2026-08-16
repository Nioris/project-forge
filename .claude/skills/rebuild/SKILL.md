---
name: rebuild
kind: tactical
description: "Пересобрать существующий проект в output/. Triggers on: rebuild, пересобери, пересборка."
---

Rebuild existing project in output/.

`$ARGUMENTS`: project folder name

1. Read output/{project}/CONVERT_REPORT.md
2. Re-sync www/ from input/
3. npx cap sync android
4. Rebuild APK/AAB
5. Update report
