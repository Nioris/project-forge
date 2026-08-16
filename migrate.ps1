# @file migrate.ps1
# @description Migrates existing Project Forge projects to v2.1 (unified hooks + wiki)
#
# Usage:
#   .\migrate.ps1                     - migrate all projects
#   .\migrate.ps1 -Project C:\path    - migrate one specific project

param(
    [string]$Project
)

$ForgeRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

function Migrate-Project {
    param([string]$ProjectPath)

    $Name = Split-Path -Leaf $ProjectPath

    if (-not (Test-Path "$ProjectPath\.claude")) {
        Write-Host "  [skip] $Name - no .claude/ directory" -ForegroundColor Yellow
        return
    }

    Write-Host "  [...] Migrating: $Name" -ForegroundColor Cyan

    # --- 1. HOOKS ---
    Remove-Item "$ProjectPath\.claude\hooks\ps" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item "$ProjectPath\.claude\hooks\*.sh" -Force -ErrorAction SilentlyContinue

    New-Item -ItemType Directory -Path "$ProjectPath\.claude\hooks" -Force -ErrorAction SilentlyContinue | Out-Null
    Copy-Item "$ForgeRoot\.claude\hooks\*.mjs" "$ProjectPath\.claude\hooks\" -Force
    Copy-Item "$ForgeRoot\.claude\settings.json" "$ProjectPath\.claude\settings.json" -Force

    Write-Host "    + hooks updated (5 x .mjs)" -ForegroundColor Green

    # --- 2. STALE WORKTREES ---
    if (Test-Path "$ProjectPath\.claude\worktrees") {
        Remove-Item "$ProjectPath\.claude\worktrees" -Recurse -Force
        Write-Host "    + stale worktree configs removed" -ForegroundColor Green
    }

    # --- 3. AGENTS ---
    if (Test-Path "$ForgeRoot\.claude\agents") {
        New-Item -ItemType Directory -Path "$ProjectPath\.claude\agents" -Force -ErrorAction SilentlyContinue | Out-Null
        Copy-Item "$ForgeRoot\.claude\agents\*.md" "$ProjectPath\.claude\agents\" -Force
        Write-Host "    + agents updated (wiki references)" -ForegroundColor Green
    }

    # --- 4. CONTEXT ESSENTIALS ---
    if (Test-Path "$ForgeRoot\.claude\context-essentials.md") {
        Copy-Item "$ForgeRoot\.claude\context-essentials.md" "$ProjectPath\.claude\" -Force
    }

    # --- 5. WIKI STRUCTURE ---
    $wikiDirs = @('wiki','wiki\sessions','wiki\decisions','wiki\features','wiki\bugs','wiki\architecture')
    foreach ($d in $wikiDirs) {
        New-Item -ItemType Directory -Path (Join-Path $ProjectPath $d) -Force -ErrorAction SilentlyContinue | Out-Null
    }

    $templates = @(
        'wiki\pitfalls.md','wiki\changelog.md','wiki\deploy-log.md','wiki\tech-debt.md',
        'wiki\testing.md','wiki\i18n-status.md','wiki\performance.md','wiki\api.md',
        'wiki\requests.md','wiki\architecture\stack.md','wiki\architecture\data-flow.md',
        'wiki\decisions\_template.md','wiki\features\_template.md','wiki\bugs\_template.md'
    )
    foreach ($t in $templates) {
        $src = Join-Path $ForgeRoot $t
        $dst = Join-Path $ProjectPath $t
        if ((Test-Path $src) -and -not (Test-Path $dst)) {
            Copy-Item $src $dst -Force
        }
    }

    # --- 6. MIGRATE CONTEXT.MD -> WIKI/_MAP.MD ---
    $mapFile = Join-Path $ProjectPath 'wiki\_map.md'
    $ctxFile = Join-Path $ProjectPath 'CONTEXT.md'

    if (-not (Test-Path $mapFile)) {
        if (Test-Path $ctxFile) {
            $today = Get-Date -Format 'yyyy-MM-dd'
            $ctxContent = Get-Content $ctxFile -Raw -Encoding UTF8
            $lines = @(
                '---',
                'tags: [project-map]',
                '---',
                '',
                '# Project Map',
                '',
                "> Migrated from CONTEXT.md on $today",
                '',
                $ctxContent
            )
            $migrated = $lines -join "`n"
            Set-Content -Path $mapFile -Value $migrated -Encoding UTF8

            Move-Item $ctxFile "$ctxFile.bak" -Force
            Write-Host "    + CONTEXT.md -> wiki/_map.md (backup: CONTEXT.md.bak)" -ForegroundColor Green
        } else {
            $forgeMap = Join-Path $ForgeRoot 'wiki\_map.md'
            if (Test-Path $forgeMap) {
                Copy-Item $forgeMap $mapFile -Force
            }
            Write-Host "    ! wiki/_map.md created (empty template)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "    + wiki/_map.md already exists" -ForegroundColor Green
    }

    Write-Host "  [OK] $Name migrated" -ForegroundColor Green
    Write-Host ""
}

# --- MAIN ---

Write-Host ""
Write-Host "  +======================================+" -ForegroundColor Cyan
Write-Host "  |   PROJECT FORGE - MIGRATION v2.1     |" -ForegroundColor Cyan
Write-Host "  |   Unified hooks + wiki system        |" -ForegroundColor Cyan
Write-Host "  +======================================+" -ForegroundColor Cyan
Write-Host ""

if ($Project) {
    if (Test-Path $Project) {
        Migrate-Project $Project
    } else {
        Write-Host "Error: '$Project' not found" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "  Scanning for projects..." -ForegroundColor Gray
    Write-Host ""

    Push-Location $ForgeRoot
    $worktrees = git worktree list 2>$null
    Pop-Location

    foreach ($line in $worktrees) {
        $wtPath = ($line -split '\s+')[0]
        if ($wtPath -and ($wtPath -ne $ForgeRoot) -and (Test-Path $wtPath)) {
            Migrate-Project $wtPath
        }
    }

    $parent = Split-Path -Parent $ForgeRoot
    Get-ChildItem $parent -Directory | Where-Object {
        $_.FullName -ne $ForgeRoot -and (Test-Path (Join-Path $_.FullName '.claude'))
    } | ForEach-Object {
        Migrate-Project $_.FullName
    }

    Write-Host "  Migration complete." -ForegroundColor Green
    Write-Host ""
    Write-Host "  Next steps:"
    Write-Host "    1. Open each project: cd <project>; claude"
    Write-Host "    2. Run /continue - hooks will auto-inject wiki context"
    Write-Host "    3. If wiki/_map.md was migrated from CONTEXT.md, review it"
    Write-Host "    4. Delete .bak files when satisfied"
    Write-Host ""
}
