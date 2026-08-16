# @file sync-to-obsidian.ps1
# @description Scan all project folders next to Project-forge, mirror the
#              v3 wiki structure (_current.md, _map.md, plan/, features/,
#              decisions/, sessions/YYYY/MM/DD.md) into a single Obsidian
#              vault for unified search and graph view.
#
# Read-only mirror for humans — Claude never reads from the vault.
#
# Usage:
#   .\scripts\sync-to-obsidian.ps1 -VaultPath "F:\ObsidianVault"
#   .\scripts\sync-to-obsidian.ps1 -VaultPath "F:\ObsidianVault" -Watch
#   .\scripts\sync-to-obsidian.ps1 -VaultPath "F:\ObsidianVault" -Watch -IntervalSeconds 30
#
# Vault layout:
#   _dashboard.md                   <- all projects overview
#   01-Projects/
#     my-app/
#       _index.md                   <- [[wikilinks]] to everything
#       CLAUDE.md                   <- copy
#       wiki/                       <- mirror of project's wiki (all .md files)

param(
    [Parameter(Mandatory=$true)]
    [string]$VaultPath,

    [switch]$Watch,
    [int]$IntervalSeconds = 60
)

$ErrorActionPreference = 'Stop'

$ForgeRoot    = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ProjectsRoot = Split-Path -Parent $ForgeRoot

function Copy-Wiki {
    param([string]$Src, [string]$Dst)
    # Mirror the whole wiki/ tree as-is. robocopy /MIR or xcopy would work,
    # but we avoid them to keep this script simple and cross-PS.
    if (-not (Test-Path $Src)) { return }
    if (-not (Test-Path $Dst)) { New-Item -ItemType Directory -Path $Dst -Force | Out-Null }
    Get-ChildItem $Src -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
        $rel = $_.FullName.Substring($Src.Length).TrimStart('\','/')
        $target = Join-Path $Dst $rel
        $targetDir = Split-Path -Parent $target
        if (-not (Test-Path $targetDir)) {
            New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        }
        # Only copy if source is newer or target missing
        if ((-not (Test-Path $target)) -or ($_.LastWriteTime -gt (Get-Item $target).LastWriteTime)) {
            Copy-Item $_.FullName -Destination $target -Force
        }
    }
}

function Read-VisionFromMap {
    param([string]$MapPath)
    if (-not (Test-Path $MapPath)) { return '' }
    $lines = Get-Content $MapPath -ErrorAction SilentlyContinue
    $inVision = $false
    $out = @()
    foreach ($line in $lines) {
        if ($line -match '^##\s*Vision') { $inVision = $true; continue }
        if ($inVision -and $line -match '^##') { break }
        if ($inVision -and $line.Trim() -and -not $line.StartsWith('>')) {
            $out += $line.Trim()
            if ($out.Count -ge 2) { break }
        }
    }
    return ($out -join ' ')
}

function Read-GoalFromCurrent {
    param([string]$CurrentPath)
    if (-not (Test-Path $CurrentPath)) { return '' }
    $lines = Get-Content $CurrentPath -ErrorAction SilentlyContinue
    $inGoal = $false
    foreach ($line in $lines) {
        if ($line -match '^##\s*Session goal') { $inGoal = $true; continue }
        if ($inGoal -and $line -match '^##') { break }
        $t = $line.Trim()
        if ($inGoal -and $t -and -not $t.StartsWith('_') -and -not $t.StartsWith('<!') -and -not $t.StartsWith('>')) {
            return $t
        }
    }
    return ''
}

function Find-LastSession {
    param([string]$WikiDir)
    $sessRoot = Join-Path $WikiDir 'sessions'
    if (-not (Test-Path $sessRoot)) { return $null }
    $candidates = @()

    # Nested: wiki/sessions/YYYY/MM/DD.md
    Get-ChildItem $sessRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        if ($_.Name -match '^\d{4}$') {
            Get-ChildItem $_.FullName -Directory -ErrorAction SilentlyContinue | ForEach-Object {
                if ($_.Name -match '^\d{2}$') {
                    Get-ChildItem $_.FullName -Filter '*.md' -File -ErrorAction SilentlyContinue | ForEach-Object {
                        if ($_.BaseName -match '^\d{2}$') {
                            $y = Split-Path -Leaf (Split-Path -Parent $_.DirectoryName)
                            $m = Split-Path -Leaf $_.DirectoryName
                            $d = $_.BaseName
                            $candidates += "$y-$m-$d"
                        }
                    }
                }
            }
        }
    }

    # Flat: wiki/sessions/YYYY-MM-DD.md
    Get-ChildItem $sessRoot -Filter '*.md' -File -ErrorAction SilentlyContinue | ForEach-Object {
        if ($_.BaseName -match '^\d{4}-\d{2}-\d{2}$') {
            $candidates += $_.BaseName
        }
    }

    if ($candidates.Count -eq 0) { return $null }
    return ($candidates | Sort-Object -Descending | Select-Object -First 1)
}

function Count-InProgress {
    param([string]$WikiDir)
    $planDir = Join-Path $WikiDir 'plan'
    if (-not (Test-Path $planDir)) { return 0 }
    $count = 0
    Get-ChildItem $planDir -Filter '*.md' -File -ErrorAction SilentlyContinue | ForEach-Object {
        if ($_.BaseName.StartsWith('_') -or $_.BaseName -eq 'README') { return }
        $content = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue
        if ($content -match '(?m)^\s*status:\s*in_progress\s*$') { $count++ }
    }
    return $count
}

function Sync-Once {
    param([string]$Vault, [string]$Root, [string]$ForgeAbsolute)

    $projectsDir = Join-Path $Vault '01-Projects'
    if (-not (Test-Path $projectsDir)) {
        New-Item -ItemType Directory -Path $projectsDir -Force | Out-Null
    }

    $synced = @()

    Get-ChildItem $Root -Directory | ForEach-Object {
        $dir = $_
        # v4.6+: skip the template folder by path equality, not by name
        if ($ForgeAbsolute) {
            $childAbs = (Resolve-Path $dir.FullName).Path
            if ($childAbs -eq $ForgeAbsolute) { return }
        }
        if ($dir.Name -eq 'Project-forge')  { return }  # legacy fallback
        if ($dir.Name.StartsWith('.'))      { return }

        # Project qualifies if it has wiki/ or .claude/
        $hasProject = (Test-Path (Join-Path $dir.FullName 'wiki')) -or
                      (Test-Path (Join-Path $dir.FullName '.claude'))
        if (-not $hasProject) { return }

        $name = $dir.Name
        $dest = Join-Path $projectsDir $name
        if (-not (Test-Path $dest)) {
            New-Item -ItemType Directory -Path $dest -Force | Out-Null
        }

        # CLAUDE.md + README.md — copy if present
        foreach ($f in 'CLAUDE.md','README.md') {
            $src = Join-Path $dir.FullName $f
            if (Test-Path $src) {
                Copy-Item -Path $src -Destination (Join-Path $dest $f) -Force
            }
        }

        # Mirror wiki/ tree
        $srcWiki = Join-Path $dir.FullName 'wiki'
        $dstWiki = Join-Path $dest 'wiki'
        if (Test-Path $srcWiki) {
            Copy-Wiki -Src $srcWiki -Dst $dstWiki
        }

        # Collect status for dashboard
        $vision = Read-VisionFromMap (Join-Path $srcWiki '_map.md')
        $goal   = Read-GoalFromCurrent (Join-Path $srcWiki '_current.md')
        $lastSession = Find-LastSession $srcWiki
        $activeCount = Count-InProgress $srcWiki
        $status = if ($activeCount -gt 0) { 'active' }
                  elseif ($lastSession) { 'idle' }
                  else { 'new' }

        # Generate _index.md
        $wikiLinks = @()
        if (Test-Path (Join-Path $dstWiki '_current.md')) { $wikiLinks += '- [[wiki/_current]]' }
        if (Test-Path (Join-Path $dstWiki '_map.md'))     { $wikiLinks += '- [[wiki/_map]]' }
        if (Test-Path (Join-Path $dstWiki 'plan'))        { $wikiLinks += '- Plan tasks under wiki/plan/' }
        if (Test-Path (Join-Path $dest 'CLAUDE.md'))       { $wikiLinks += '- [[CLAUDE]]' }

        $index = @"
---
project: $name
status: $status
active_tasks: $activeCount
last_session: $lastSession
updated: $(Get-Date -Format 'yyyy-MM-dd HH:mm')
---

# $name

**Vision:** $vision

**Current goal:** $goal

$($wikiLinks -join "`n")

Source: ``$($dir.FullName)``
"@
        Set-Content -Path (Join-Path $dest '_index.md') -Value $index -Encoding UTF8

        $synced += [pscustomobject]@{
            Name = $name
            Status = $status
            LastSession = $lastSession
            ActiveTasks = $activeCount
            Vision = $vision
            Goal = $goal
        }
    }

    # Generate _dashboard.md
    if ($synced.Count -gt 0) {
        $rows = $synced | ForEach-Object {
            $v = if ($_.Goal) { $_.Goal } else { $_.Vision }
            if ($v.Length -gt 60) { $v = $v.Substring(0, 60) + '...' }
            "| [[01-Projects/$($_.Name)/_index\|$($_.Name)]] | $($_.Status) | $($_.ActiveTasks) | $($_.LastSession) | $v |"
        }
        $dashboard = @"
---
updated: $(Get-Date -Format 'yyyy-MM-dd HH:mm')
---

# Project Dashboard

| Project | Status | Active tasks | Last session | Focus |
|---------|--------|--------------|--------------|-------|
$($rows -join "`n")

---
*Auto-generated by sync-to-obsidian.ps1 (v3)*
"@
        Set-Content -Path (Join-Path $Vault '_dashboard.md') -Value $dashboard -Encoding UTF8
    }

    Write-Host "[OK] Synced $($synced.Count) project(s) to $projectsDir" -ForegroundColor Green
}

# --- Main ---

if (-not (Test-Path $VaultPath)) {
    New-Item -ItemType Directory -Path $VaultPath -Force | Out-Null
    Write-Host "[..] Created vault at $VaultPath" -ForegroundColor Cyan
}

if ($Watch) {
    Write-Host "[..] Watching $ProjectsRoot — syncing every ${IntervalSeconds}s. Ctrl+C to stop." -ForegroundColor Cyan
    while ($true) {
        Sync-Once -Vault $VaultPath -Root $ProjectsRoot -ForgeAbsolute (Resolve-Path $ForgeRoot).Path
        Start-Sleep -Seconds $IntervalSeconds
    }
} else {
    Sync-Once -Vault $VaultPath -Root $ProjectsRoot -ForgeAbsolute (Resolve-Path $ForgeRoot).Path
}
