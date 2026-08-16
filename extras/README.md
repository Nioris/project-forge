# External one-click updater

`update-forge.bat` is intentionally stored under `extras/` in the Forge package because its runtime location is **outside** the engine folder.

Copy it next to `project-forge/` once:

```text
F:\ProjectForgeUniversal\update-forge.bat
F:\ProjectForgeUniversal\project-forge\
F:\ProjectForgeUniversal\my-game\
F:\ProjectForgeUniversal\my-app\
```

For later releases, download `project-forge-vX.Y.Z*.zip` and double-click the external updater. It chooses the highest semantic version available next to itself or in Downloads, backs up user data, upgrades the engine, regenerates Claude/Codex/dashboard surfaces, syncs all sibling projects, and stops on any failed integrity gate.
