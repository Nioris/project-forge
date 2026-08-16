# upgrade.ps1 - Cleans up obsolete files after copy-with-replace upgrade
#
# v4.10.18: now uses MANIFEST.txt for catch-all orphan detection.
# MANIFEST.txt lists all files SHIPPED in this version. Any file on disk
# NOT in manifest (and not in protected paths) gets removed.
#
# USAGE:
#   1. Copy new zip contents over project-forge\ (replace all when prompted)
#   2. Open the folder, right-click upgrade.ps1, "Run with PowerShell"
#   3. Done - orphans cleaned, sync ready
#
# IDEMPOTENT - safe to run multiple times.
# ASCII-only on purpose (see check-ps1-encoding.mjs).

$ErrorActionPreference = 'Continue'

$ForgeRoot = $PSScriptRoot
Set-Location $ForgeRoot

Write-Host ""
Write-Host "=== Forge Upgrade - cleaning up obsolete files ===" -ForegroundColor Cyan
Write-Host ""

# [1] Unblock files (Mark-of-the-Web)
Write-Host "[1/8] Unblocking files (Mark-of-the-Web)..." -ForegroundColor Yellow
Get-ChildItem -Path $ForgeRoot -Recurse -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue
Write-Host "      Done." -ForegroundColor DarkGray

# [2] Legacy orphan list (hand-maintained for things removed before manifest era)
$LegacyOrphans = @(
    '.claude\commands\analyze-game.md'
    '.claude\commands\analyze-project.md'
    '.claude\commands\info-hierarchy.md'
    '.claude\commands\layout-system.md'
    '.claude\commands\pipeline.md'
    '.claude\commands\start.md'
    '.claude\commands\ui-pipeline.md'
    '.claude\commands\ui-review.md'
)

Write-Host "[2/8] Removing legacy orphan files..." -ForegroundColor Yellow
$removed = 0
$kept = 0
foreach ($orphan in $LegacyOrphans) {
    $full = Join-Path $ForgeRoot $orphan
    if (Test-Path $full) {
        try {
            # данные пользователя (json в корне, не из дистрибутива) — переносим, не удаляем
            if ($rel -match '^[^\\]+\.json$' -and $rel -notmatch 'seed|example|baseline') {
                $dataDir = Join-Path (Split-Path $ForgeRoot -Parent) 'forge-data'
                New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
                Move-Item $full (Join-Path $dataDir (Split-Path $rel -Leaf)) -Force -ErrorAction SilentlyContinue
                Write-Host "      → $rel перенесён в forge-data (данные пользователя)" -ForegroundColor Yellow
                $removed++
                continue
            }
            Remove-Item $full -Force -ErrorAction Stop
            Write-Host "      [-] $orphan" -ForegroundColor DarkGreen
            $removed++
        } catch {
            Write-Host "      [ERR] $orphan : $($_.Exception.Message)" -ForegroundColor Red
        }
    } else {
        $kept++
    }
}
Write-Host "      Removed $removed, $kept already absent." -ForegroundColor DarkGray

# [3] Manifest-based catch-all
Write-Host "[3/8] Manifest-based orphan detection..." -ForegroundColor Yellow
$ManifestPath = Join-Path $ForgeRoot "MANIFEST.txt"
if (-not (Test-Path $ManifestPath)) {
    Write-Host "      MANIFEST.txt not found - skipping (older version?)" -ForegroundColor DarkGray
} else {
    $ExpectedFiles = [System.Collections.Generic.HashSet[string]]::new()
    # Windows PowerShell 5.1 defaults UTF-8-without-BOM text to the active ANSI
    # code page. MANIFEST contains Cyrillic paths, so encoding must be explicit.
    Get-Content -LiteralPath $ManifestPath -Encoding UTF8 | ForEach-Object {
        $line = $_.Trim()
        if ($line.Length -gt 0) {
            $null = $ExpectedFiles.Add($line.Replace('/', '\'))
        }
    }
    Write-Host "      Manifest has $($ExpectedFiles.Count) expected files." -ForegroundColor DarkGray
    
    # Protected: never touched by manifest cleanup
    $ProtectedPathPrefixes = @(
        'node_modules\',
        '.git\',
        '.context-backups\',
        'output\',
        'dist\',
        'build\',
        'wiki\sessions\'
    )
    # ПОЛЬЗОВАТЕЛЬСКИЕ ДАННЫЕ: не в манифесте по определению — удалять НЕЛЬЗЯ.
    # Полевой инцидент 31.07.2026: asset-library.json (294 источника) был вычищен
    # как «сирота» после того, как его убрали из дистрибутива.
    $ProtectedFileNames = @(
        'asset-library.json',
        'forge-data.json',
        'MANIFEST.txt',
        '.dashboard-structure-baseline.json',
        '.DS_Store',
        'Thumbs.db',
        'desktop.ini'
    )
    $ProtectedExtensions = @('.tmp', '.bak', '.swp', '.zip')
    
    $actualFiles = Get-ChildItem -Path $ForgeRoot -Recurse -File -Force -ErrorAction SilentlyContinue
    $manifestOrphans = @()
    foreach ($file in $actualFiles) {
        $rel = $file.FullName.Substring($ForgeRoot.Length + 1)
        
        $isProtected = $false
        foreach ($pp in $ProtectedPathPrefixes) {
            if ($rel.StartsWith($pp)) { $isProtected = $true; break }
        }
        if ($isProtected) { continue }
        if ($ProtectedFileNames -contains $file.Name) { continue }
        if ($ProtectedExtensions -contains $file.Extension) { continue }
        
        if (-not $ExpectedFiles.Contains($rel)) {
            $manifestOrphans += $rel
        }
    }
    
    if ($manifestOrphans.Count -eq 0) {
        Write-Host "      No manifest orphans found." -ForegroundColor DarkGray
    } else {
        Write-Host "      Found $($manifestOrphans.Count) file(s) not in manifest:" -ForegroundColor Yellow
        foreach ($orphan in $manifestOrphans) {
            try {
                Remove-Item (Join-Path $ForgeRoot $orphan) -Force -ErrorAction Stop
                Write-Host "      [-] $orphan" -ForegroundColor DarkGreen
            } catch {
                Write-Host "      [ERR] $orphan : $($_.Exception.Message)" -ForegroundColor Red
            }
        }
    }
}

# [4] Obsolete skill directories that survived file-only manifest cleanup in older builds.
# v4.66.7: the phase-3 construct insertion shifted phase numbers; old empty directories
# could remain on disk and inflate filesystem-based skill counts. If an obsolete directory
# unexpectedly contains files, preserve it under sibling forge-data before removing it.
$LegacyOrphanDirs = @(
    '.claude\skills\phase-3-visual'
    '.claude\skills\phase-4-tech'
    '.claude\skills\phase-5-listing'
    '.claude\skills\phase-6-test'
    '.claude\skills\phase-7-release'
    '.claude\skills\phase-8-live'
)

Write-Host "[4/8] Removing obsolete skill directories..." -ForegroundColor Yellow
$dirRemoved = 0
$dirAbsent = 0
$obsoleteBackupRoot = $null
foreach ($orphanDir in $LegacyOrphanDirs) {
    $full = Join-Path $ForgeRoot $orphanDir
    if (-not (Test-Path -LiteralPath $full -PathType Container)) {
        $dirAbsent++
        continue
    }

    try {
        $children = @(Get-ChildItem -LiteralPath $full -Force -ErrorAction SilentlyContinue)
        if ($children.Count -gt 0) {
            if (-not $obsoleteBackupRoot) {
                $stamp = Get-Date -Format 'yyyy-MM-dd-HH-mm-ss'
                $obsoleteBackupRoot = Join-Path (Split-Path $ForgeRoot -Parent) "forge-data\backups\obsolete-skill-dirs-$stamp"
                New-Item -ItemType Directory -Force -Path $obsoleteBackupRoot | Out-Null
            }
            $safeName = $orphanDir.Replace('\','__').Replace('/','__')
            Copy-Item -LiteralPath $full -Destination (Join-Path $obsoleteBackupRoot $safeName) -Recurse -Force -ErrorAction Stop
            Write-Host "      [backup] $orphanDir -> $obsoleteBackupRoot" -ForegroundColor DarkYellow
        }
        Remove-Item -LiteralPath $full -Recurse -Force -ErrorAction Stop
        Write-Host "      [-] $orphanDir" -ForegroundColor DarkGreen
        $dirRemoved++
    } catch {
        Write-Host "      [ERR] $orphanDir : $($_.Exception.Message)" -ForegroundColor Red
        throw
    }
}
Write-Host "      Removed $dirRemoved, $dirAbsent already absent." -ForegroundColor DarkGray

# [5] Nested directories
Write-Host "[5/8] Checking nested duplicate directories..." -ForegroundColor Yellow
if (Test-Path "$ForgeRoot\scripts\check-nested-dirs.mjs") {
    $nestedOutput = & node "$ForgeRoot\scripts\check-nested-dirs.mjs" 2>&1 | Out-String
    if ($nestedOutput -match 'No nested') {
        Write-Host "      No nested dupes." -ForegroundColor DarkGray
    } else {
        Write-Host "      Found nested dupes - auto-fixing..." -ForegroundColor Yellow
        & node "$ForgeRoot\scripts\check-nested-dirs.mjs" --fix
    }
} else {
    Write-Host "      Skipped." -ForegroundColor DarkGray
}

# [6] Advisor catalog
Write-Host "[6/8] Syncing advisor catalog..." -ForegroundColor Yellow
if (Test-Path "$ForgeRoot\scripts\update-advisor-catalog.mjs") {
    & node "$ForgeRoot\scripts\update-advisor-catalog.mjs" 2>&1 | Out-Null
    Write-Host "      Done." -ForegroundColor DarkGray
} else {
    Write-Host "      Skipped." -ForegroundColor DarkGray
}

# [7] Unified agent adapters
Write-Host "[7/8] Rebuilding Claude/Codex generated adapters..." -ForegroundColor Yellow
& node "$ForgeRoot\scripts\generate-agents-md.mjs"
if ($LASTEXITCODE -ne 0) { throw "AGENTS.md generation failed with code $LASTEXITCODE" }
& node "$ForgeRoot\scripts\sync-codex-adapter.mjs"
if ($LASTEXITCODE -ne 0) { throw "Codex adapter sync failed with code $LASTEXITCODE" }
Write-Host "      Done." -ForegroundColor DarkGray

# [8] Dashboard command/version metadata
Write-Host "[8/8] Refreshing dashboard metadata..." -ForegroundColor Yellow
& node "$ForgeRoot\scripts\sync-dashboard-meta.mjs"
if ($LASTEXITCODE -ne 0) { throw "Dashboard metadata sync failed with code $LASTEXITCODE" }
& node "$ForgeRoot\scripts\check-dashboard-meta.mjs"
if ($LASTEXITCODE -ne 0) { throw "Dashboard integrity check failed with code $LASTEXITCODE" }
Write-Host "      Done." -ForegroundColor DarkGray

Write-Host ""
Write-Host "=== Upgrade complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  .\setup.ps1                  # one-time setup (idempotent)"
Write-Host "  .\sync.bat                   # canonical sibling sync (Claude + Codex)"
Write-Host ""

# Pause if launched by double-click
if ($Host.Name -eq 'ConsoleHost' -and -not $MyInvocation.PSCommandPath -eq $null) {
    if (-not [Environment]::UserInteractive -or $env:TERM_PROGRAM) {
        # parent terminal - don't pause
    } else {
        Write-Host "Press any key to close..." -ForegroundColor DarkGray
        $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
    }
}
