# @file setup.ps1
# @description Project Forge v4 setup for Windows — init git, verify tools,
#              seed wiki/_current.md, create GameIntegration/WorkProgress/Release,
#              migrate flat sessions, display platform matrix.

param([switch]$SkipGit)

# v4.10.33: Unblock all files first (Mark-of-the-Web)
# Otherwise nested scripts (sync.ps1, hooks/*.ps1) may fail на fresh install
$ForgeRoot = $PSScriptRoot
Write-Host "[0/N] Unblocking files (Mark-of-the-Web)..." -ForegroundColor Yellow
Get-ChildItem -Path $ForgeRoot -Recurse -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue
Write-Host "    Done."
Write-Host ""

Write-Host ""
Write-Host "  ╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║         PROJECT FORGE v4.68.43              ║" -ForegroundColor Cyan
Write-Host "  ║   Multi-platform release pipeline     ║" -ForegroundColor Cyan
Write-Host "  ╚══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# AI clients — Forge supports Claude Code and Codex from the same repository.
$claudeVersion = $null
try { $claudeVersion = & claude --version 2>$null } catch {}
if ($claudeVersion) {
    Write-Host "  ✅ Claude Code: $claudeVersion" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  Claude Code not found (optional when using Codex)." -ForegroundColor Yellow
}
$codexVersion = $null
try { $codexVersion = & codex --version 2>$null } catch {}
if ($codexVersion) {
    Write-Host "  ✅ Codex: $codexVersion" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  Codex not found (optional when using Claude Code)." -ForegroundColor Yellow
}

# Node.js
$nodeVersion = $null
try { $nodeVersion = & node --version 2>$null } catch {}
if ($nodeVersion) {
    Write-Host "  ✅ Node.js: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "  ❌ Node.js not found — hooks + validators will not work." -ForegroundColor Red
    exit 1
}

# Refresh generated Claude/Codex/dashboard surfaces from canonical Forge sources.
if ((Test-Path "scripts/generate-agents-md.mjs") -and (Test-Path "scripts/sync-codex-adapter.mjs")) {
    & node "scripts/generate-agents-md.mjs" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & node "scripts/sync-codex-adapter.mjs" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & node "scripts/sync-dashboard-meta.mjs" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Host "  ✅ Unified agent/dashboard surfaces: synced" -ForegroundColor Green
}

# Puppeteer
if (Test-Path "node_modules/puppeteer") {
    Write-Host "  ✅ puppeteer: installed" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  puppeteer not installed (needed for Yandex runtime/smoke tests)" -ForegroundColor Yellow
    Write-Host "     Install later: npm install puppeteer" -ForegroundColor Gray
}

# Git init
if (-not $SkipGit -and -not (Test-Path ".git")) {
    Write-Host "  📦 Initializing git repository..." -ForegroundColor Yellow
    git init -q
    git add -A
    git commit -q -m "Initial commit: Project Forge v4"
    Write-Host "  ✅ Git initialized" -ForegroundColor Green
}

# Create pipeline dirs
foreach ($d in @("GameIntegration", "WorkProgress", "Release")) {
    if (-not (Test-Path $d)) {
        New-Item -ItemType Directory -Path $d -Force | Out-Null
        Write-Host "  ✅ Created $d/" -ForegroundColor Green
    }
}

# Seed _current.md
if ((Test-Path "wiki/_current.md.template") -and -not (Test-Path "wiki/_current.md")) {
    Copy-Item "wiki/_current.md.template" "wiki/_current.md"
    Write-Host "  ✅ Seeded wiki/_current.md" -ForegroundColor Green
}

# Migrate flat sessions
$flatLogs = @()
if (Test-Path "wiki/sessions") {
    $flatLogs = Get-ChildItem -Path "wiki/sessions" -Filter "????-??-??.md" -File -ErrorAction SilentlyContinue
}
if ($flatLogs.Count -gt 0) {
    Write-Host "  📦 Migrating $($flatLogs.Count) flat session log(s)..." -ForegroundColor Yellow
    & node "scripts/migrate-sessions.mjs"
}

# v4.10.11: Auto-cleanup orphan command wrappers
# When user upgrades Forge через copy-with-replace, old wrappers from previous versions
# remain. Detect и delete them so /game, /app, /continue stay the only top-level commands.
if (Test-Path "scripts/cleanup-orphan-wrappers.mjs") {
    $orphanCheck = & node "scripts/cleanup-orphan-wrappers.mjs" --dry 2>&1
    if ($orphanCheck -match "Found \d+ orphan") {
        Write-Host ""
        Write-Host "  🧹 Found legacy command wrappers from previous Forge versions." -ForegroundColor Yellow
        Write-Host "     Auto-cleaning (v4.10.9+ uses /game, /app, /continue + skill auto-invocation)..." -ForegroundColor Gray
        & node "scripts/cleanup-orphan-wrappers.mjs" --auto | Out-Null
        Write-Host "  ✓ Legacy wrappers removed." -ForegroundColor Green
    }
}

# Syntax check hooks + platform scripts
Write-Host ""
Write-Host "  Hooks & platform scripts:" -ForegroundColor White
$errors = 0

Get-ChildItem ".claude/hooks/*.mjs" | ForEach-Object {
    $null = & node --check $_.FullName 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ $($_.Name)" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $($_.Name)" -ForegroundColor Red
        $errors++
    }
}
if (Test-Path ".claude/hooks/lib") {
    Get-ChildItem ".claude/hooks/lib/*.mjs" | ForEach-Object {
        $null = & node --check $_.FullName 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ lib/$($_.Name)" -ForegroundColor Green
        } else {
            Write-Host "  ✗ lib/$($_.Name)" -ForegroundColor Red
            $errors++
        }
    }
}
foreach ($plat in @('yandex', 'vk', 'telegram', 'ok', 'max', 'rustore', 'web', 'steam', 'vkplay')) {
    $f = "platforms/$plat/scripts/pre-submit.mjs"
    if (Test-Path $f) {
        $null = & node --check $f 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ $f" -ForegroundColor Green
        } else {
            Write-Host "  ✗ $f" -ForegroundColor Red
            $errors++
        }
    }
    $rt = "platforms/$plat/scripts/runtime-test.mjs"
    if (Test-Path $rt) {
        $null = & node --check $rt 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ $rt" -ForegroundColor Green
        } else {
            Write-Host "  ✗ $rt" -ForegroundColor Red
            $errors++
        }
    }
}
# Shared utilities
if (Test-Path "platforms/_shared") {
    Get-ChildItem "platforms/_shared/*.mjs" | ForEach-Object {
        $null = & node --check $_.FullName 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ platforms/_shared/$($_.Name)" -ForegroundColor Green
        } else {
            Write-Host "  ✗ platforms/_shared/$($_.Name)" -ForegroundColor Red
            $errors++
        }
    }
}
if ($errors -gt 0) {
    Write-Host "  $errors syntax error(s) — check files above" -ForegroundColor Red
    exit 1
}

# Cross-reference audit — advisor catalog vs filesystem (v4.8+)
if (Test-Path "scripts/check-cross-refs.mjs") {
    Write-Host ""
    Write-Host "Validating advisor catalog (drift detection)..."
    $crossRefsOutput = & node scripts/check-cross-refs.mjs 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ advisor catalog matches filesystem (no drift)" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ advisor catalog drift detected:" -ForegroundColor Yellow
        $crossRefsOutput | Select-String -Pattern "Missing|Phantom|skill" | Select-Object -First 10 | ForEach-Object {
            Write-Host "    $_" -ForegroundColor Gray
        }
        Write-Host "  (non-fatal — Forge will work, but some skills won't show in /advisor)" -ForegroundColor Gray
    }
}

# .bat encoding audit — non-ASCII inside () blocks (v4.8+)
if (Test-Path "scripts/check-bat-encoding.mjs") {
    Write-Host ""
    Write-Host "Validating .bat files (cmd.exe parser safety)..."
    $batOutput = & node scripts/check-bat-encoding.mjs 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ .bat files clean (no non-ASCII inside parens)" -ForegroundColor Green
    } else {
        Write-Host "  ✗ .bat encoding violations (cmd.exe WILL crash):" -ForegroundColor Red
        $batOutput | Select-String -Pattern "\.bat:" | Select-Object -First 10 | ForEach-Object {
            Write-Host "    $_" -ForegroundColor Gray
        }
        Write-Host "  (this WILL break sync.bat / open-all.bat for Russian Windows users)" -ForegroundColor Gray
    }
}

# Skill kind audit — kind: architectural | tactical (v4.9+)
if (Test-Path "scripts/check-skill-kind.mjs") {
    Write-Host ""
    Write-Host "Validating skill categorization (architectural vs tactical)..."
    $kindOutput = & node scripts/check-skill-kind.mjs 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ all skills have kind: in frontmatter" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ skills missing kind:" -ForegroundColor Yellow
        $kindOutput | Select-String -Pattern "missing|invalid" | Select-Object -First 10 | ForEach-Object {
            Write-Host "    $_" -ForegroundColor Gray
        }
        Write-Host "  (advisor recommendations less precise without kind:)" -ForegroundColor Gray
    }
}

# Dashboard structure check — visual regression via structural diff (v4.9+)
if ((Test-Path "scripts/check-dashboard-structure.mjs") -and (Test-Path ".dashboard-structure-baseline.json")) {
    Write-Host ""
    Write-Host "Validating dashboard.html structure (visual regression check)..."
    $structOutput = & node scripts/check-dashboard-structure.mjs 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ dashboard structure matches baseline" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ dashboard.html changed since baseline:" -ForegroundColor Yellow
        $structOutput | Select-String -Pattern "Removed|Added|Changed|^    #" | Select-Object -First 10 | ForEach-Object {
            Write-Host "    $_" -ForegroundColor Gray
        }
        Write-Host "  (if intentional: scripts/check-dashboard-structure.mjs --baseline)" -ForegroundColor Gray
    }
}

# Counts
$skillsKb = (Get-ChildItem -Path "skills" -Filter "SKILL.md" -Recurse -ErrorAction SilentlyContinue).Count
$skillsCmd = (Get-ChildItem -Path ".claude/skills" -Filter "SKILL.md" -Recurse -ErrorAction SilentlyContinue).Count
$agents = (Get-ChildItem -Path ".claude/agents" -Filter "*.md" -ErrorAction SilentlyContinue).Count
$hooks = (Get-ChildItem -Path ".claude/hooks" -Filter "*.mjs" -ErrorAction SilentlyContinue | Where-Object { -not $_.FullName.Contains("lib") }).Count
$platformsCount = (Get-ChildItem -Path "platforms" -Directory -ErrorAction SilentlyContinue | Where-Object { -not $_.Name.StartsWith('_') }).Count

Write-Host ""
Write-Host "  ┌─────────────────────────────────────┐" -ForegroundColor DarkCyan
Write-Host "  │  Platforms:  $($platformsCount.ToString().PadLeft(3))  (release targets)    │" -ForegroundColor DarkCyan
Write-Host "  │  Skills KB:  $($skillsKb.ToString().PadLeft(3))  (domain knowledge)   │" -ForegroundColor DarkCyan
Write-Host "  │  Commands:   $($skillsCmd.ToString().PadLeft(3))  (slash commands)     │" -ForegroundColor DarkCyan
Write-Host "  │  Agents:     $($agents.ToString().PadLeft(3))  (subagents)          │" -ForegroundColor DarkCyan
Write-Host "  │  Hooks:      $($hooks.ToString().PadLeft(3))  (automation)         │" -ForegroundColor DarkCyan
Write-Host "  └─────────────────────────────────────┘" -ForegroundColor DarkCyan
Write-Host ""
Write-Host "  Platform matrix:" -ForegroundColor White
Write-Host "    yandex    — production (11 validators, 3-ZIP matrix)" -ForegroundColor Gray
Write-Host "    vk        — beta (VK Bridge + 3 validators: bridge-timing, pay, ads)" -ForegroundColor Gray
Write-Host "    telegram  — beta (WebApp SDK + 5 validators + runtime-test)" -ForegroundColor Gray
Write-Host "    ok        — beta (FAPI + runtime probe: sig, loaded, callbacks)" -ForegroundColor Gray
Write-Host "    max       — beta (MaxSDK + 5 validators — MAX messenger)" -ForegroundColor Gray
Write-Host "    rustore   — beta (Capacitor wrap)" -ForegroundColor Gray
Write-Host "    web       — beta (Docker + nginx)" -ForegroundColor Gray
Write-Host "    steam     — v4.7 (Electron + steamworks.js + 5 validators)" -ForegroundColor Gray
Write-Host "    vkplay    — v4.7 (vkplay.ru iframe + signed auth + 5 validators)" -ForegroundColor Gray
Write-Host ""
Write-Host "  Memory system:" -ForegroundColor White
Write-Host "    wiki/_current.md — active session (auto-injected)" -ForegroundColor Gray
Write-Host "    wiki/plan/*.md   — structured tasks (drift-checked)" -ForegroundColor Gray
Write-Host "    wiki/_map.md     — project map" -ForegroundColor Gray
Write-Host ""
Write-Host "  ═══════════════════════════════════════" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  WORKFLOW:" -ForegroundColor White
Write-Host "    1. New-Item -ItemType Directory GameIntegration\MyGame" -ForegroundColor Yellow
Write-Host "       Copy-Item -Recurse <sources> GameIntegration\MyGame\" -ForegroundColor Yellow
Write-Host "    2a. Claude Code: claude  -> /release yandex" -ForegroundColor Yellow
Write-Host '    2b. Codex:       codex   -> $release-yandex' -ForegroundColor Yellow
Write-Host ""
Write-Host "  DIAGNOSTICS:" -ForegroundColor White
Write-Host "    node scripts/build-all-platforms.mjs --list" -ForegroundColor Gray
Write-Host "    node .claude/hooks/wiki-audit.mjs" -ForegroundColor Gray
Write-Host "    node platforms/<platform>/scripts/pre-submit.mjs WorkProgress\<Project>\" -ForegroundColor Gray
Write-Host ""
Write-Host "  EMERGENCY BYPASS (logged):" -ForegroundColor White
Write-Host '    $env:FORGE_SKIP_AUDIT=1; claude' -ForegroundColor Gray
Write-Host ""
