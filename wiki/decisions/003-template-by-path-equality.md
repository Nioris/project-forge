---
date: 2026-04-22 (v4.6.1)
status: accepted
tags: [decision, sync, paths]
---

# 003: Template detection by path equality, not folder name

## Context

`sync.bat` / `sync.ps1` / `open-all.ps1` walk through sibling directories of Forge to find user projects. They need to **skip** Forge itself.

Original implementation: skip if folder name matches `Project-forge` or `project-forge`. Worked for the canonical install path `F:\Projects\Project-forge\`.

User feedback (v4.6.1): "у меня не Project а f:\\ProjectForgeUniversal\\project-forge" — sync was including Forge itself in the iteration because the parent dir was `ProjectForgeUniversal` not `Projects`, and the folder name happened to be `project-forge` (lowercase). Hardcoded fallback failed.

## Options Considered

1. **More fallback names** — hard-code `Forge`, `MyForge`, `Universal-Forge` etc. Cons: doesn't scale, breaks if user picks weird name.

2. **Marker file approach** — Forge has `.forge-template` file, sync checks for that. Pros: works regardless of naming. Cons: dependent on file existence, not on path identity.

3. **Path equality detection** — compare absolute resolved path of Forge against absolute resolved path of each child. If equal, it's the template. Pros: works regardless of naming. Cons: requires path resolution which is OS-specific syntax.

## Decision

**Path equality** with **legacy hardcoded fallback**.

In bash:
```sh
FORGE_ABS=$(cd "$FORGE" && pwd -P)
CHILD_ABS=$(cd "$CHILD" && pwd -P)
if [ "$CHILD_ABS" = "$FORGE_ABS" ]; then SKIP=1; fi
# Plus legacy:
case "$(basename "$CHILD")" in
  Project-forge|project-forge) SKIP=1;;
esac
```

In PowerShell:
```powershell
$forgeAbs = (Resolve-Path $FORGE).Path
$childAbs = (Resolve-Path $child).Path
if ($childAbs -ieq $forgeAbs) { $skip = $true }
```

Five scripts updated: `sync.bat`, `sync.ps1`, `open-all.ps1`, `open-all-tmux.sh`, `sync-to-obsidian.ps1`.

## Consequences

- **Pro**: User can name Forge anything (`UniversalForge`, `MyTemplate`, `forge42`)
- **Pro**: Doesn't break legacy installs (fallback names retained)
- **Con**: Path resolution adds 2-3 lines per script
- **Con**: Still relies on user keeping projects as siblings of Forge — the template+siblings layout — but that's a separate architectural assumption baked into Forge's design
