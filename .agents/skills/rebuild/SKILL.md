---
name: rebuild
kind: tactical
description: "Пересобрать существующий проект в output/."
---

> Codex adapter: `[INVOCATION_INPUT]` means the actual user text/arguments supplied with this skill invocation; substitute that value wherever the placeholder appears.

Rebuild existing project in output/.

`[INVOCATION_INPUT]`: project folder name

1. Read output/{project}/CONVERT_REPORT.md
2. Re-sync www/ from input/
3. npx cap sync android
4. Rebuild APK/AAB
5. Update report
