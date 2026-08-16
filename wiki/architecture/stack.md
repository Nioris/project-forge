# Tech Stack

## Core runtime

| Technology | Version | Why chosen |
|-----------|---------|------------|
| Node.js | 20+ | Native ESM, fetch, fs/promises. No transpilation. |
| Bash | 4+ | setup.sh + .sh scripts. Standard on macOS/Linux. |
| PowerShell | 5.1+ (Win) / 7+ | setup.ps1 + .ps1 scripts. PS 5.1 requires BOM for non-ASCII; PS 7 doesn't. |
| cmd.exe | Windows 10+ | sync.bat + open-all.bat. **ASCII-only inside `()` blocks** (parser bug with multi-byte). |
| git | 2.30+ | wiki-audit hook uses `git log --since`, `git status` for diff detection. |

## Why no runtime dependencies

Forge code (hooks, validators, scripts) uses **only Node built-ins**:
- `fs`, `path`, `child_process`, `crypto`, `url` — built-in
- No npm install for Forge itself
- Reduces install friction (no `npm install` step for end-users)
- Reduces version conflicts (PowerShell 5.1 has weird behavior with some packages)
- For projects created via Forge — they have their own package.json

## File formats

| Extension | Purpose | Encoding rules |
|---|---|---|
| `.mjs` | ES modules — hooks, validators, scripts | UTF-8, explicit charset in fs reads/writes |
| `.sh` | Bash scripts | LF endings, bash locale |
| `.ps1` | PowerShell | UTF-8 with BOM if non-ASCII (PS 5.1 requirement); PS 7 is forgiving |
| `.bat` | cmd.exe | **Pure ASCII inside `()` blocks** (parser bug); CRLF endings; chcp 65001 helps echo only |
| `.json` | Config — settings, plugin, marketplace | Never BOM (rejected by JSON parsers) |
| `.md` | Markdown — skills, agents, wiki | UTF-8, no BOM |
| `.yml` | GitHub workflow | UTF-8, no BOM |
| `.html` | Dashboard | UTF-8 with `<meta charset="utf-8">` |
| `.vdf` | Steam SteamPipe configs | ASCII recommended |

## Skills system

- `.claude/skills/{name}/SKILL.md` — slash-command definitions (frontmatter `name:`, `description:`)
- 81 skills total in v4.7.7
- Loaded by Claude Code from project root
- Markdown text becomes the skill's instruction set

## Hooks system

- `.claude/hooks/{name}.mjs` — Node modules for event-driven enforcement
- 8 hooks in v4.7.7
- Wired via `.claude/settings.json` (manual install) and `.claude/hooks/plugin-hooks.json` (plugin install)
- Events: SessionStart, PreToolUse:Bash, PreToolUse:Write|Edit|MultiEdit, PostToolUse, Stop
- Exit codes: 0 = allow, 1 = warn (some), 2 = block

## Knowledge base (./skills/)

NOT loaded as commands. Just markdown reference docs:
- `skills/CATALOG.md` — index
- `skills/core/`, `skills/games/`, `skills/apps/`, `skills/pwa/`, `skills/stack/`
- 61 SKILL.md files total
- Referenced by command skills (`.claude/skills/start/` etc) — they instruct Claude to read these

## Versioning

- Single number `vX.Y.Z` in 8 sync'd places: `setup.sh`, `setup.ps1`, `README.md`, `GUIDE.md`, `CLAUDE.md`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `dashboard.html`
- Bumped via sed (with care for `.ps1` BOM preservation)
- Plugin manifest uses semver without `v` prefix (`"version": "4.7.7"`)
- Release tag = `v4.7.7`

## Distribution

- Single ZIP file: `project-forge-vX.Y.Z.zip` (1.3 MB, ~395 files)
- User unpacks → runs `setup.sh` (Linux/Mac) or `setup.ps1` (Windows)
- Setup verifies dependencies, initializes git, seeds `wiki/_current.md` template
- Subsequent updates: `sync.bat` (Windows) / `sync.sh` (Linux) propagates changes to sibling projects

## Verifier scripts

In `scripts/`:
- `check-claude-md-size.mjs` — alerts when CLAUDE.md > 30KB soft / 50KB hard
- `check-platform-completeness.mjs` — 18 checks × 9 platforms automated audit
- `check-inline-strings.mjs` — i18n discipline gate (no cyrillic literals outside `src/i18n/`)
- `check-workspace-discipline.mjs` — git status audit (no edits outside `WorkProgress/`)
