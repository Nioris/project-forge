# open-all.ps1 - Auto-detect and open all active projects in Windows Terminal
#
# Usage:
#   .\scripts\open-all.ps1             open all projects with wiki/_map.md
#   .\scripts\open-all.ps1 -DryRun     show what would open

param(
    [switch]$DryRun,
    [string[]]$Projects
)

$ForgeRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ProjectsRoot = Split-Path -Parent $ForgeRoot

Write-Host ""
Write-Host "  === PROJECT FORGE - Open All ===" -ForegroundColor Cyan
Write-Host ""

$found = @()

if ($Projects) {
    foreach ($p in $Projects) {
        $path = Join-Path $ProjectsRoot $p
        if (Test-Path $path) { $found += @{ Name = $p; Path = $path } }
        else { Write-Host "  [!] Not found: $p" -ForegroundColor Yellow }
    }
} else {
    # v4.6+: detect template by path equality, not folder name
    $ForgeAbsolute = (Resolve-Path $ForgeRoot).Path
    Get-ChildItem $ProjectsRoot -Directory | ForEach-Object {
        $childAbs = (Resolve-Path $_.FullName).Path
        if ($childAbs -eq $ForgeAbsolute) { return }
        if ($_.Name -eq "Project-forge") { return }  # legacy fallback
        if (Test-Path (Join-Path $_.FullName "wiki/_map.md")) {
            $found += @{ Name = $_.Name; Path = $_.FullName }
        }
    }

    Push-Location $ForgeRoot
    try {
        $worktrees = git worktree list 2>$null
        foreach ($line in $worktrees) {
            if ($line -match '(\S+)\s+\w+\s+\[project/(.+?)\]') {
                $wtPath = $Matches[1]
                $wtName = $Matches[2]
                $exists = $found | Where-Object { $_.Name -eq $wtName }
                if (-not $exists -and (Test-Path $wtPath)) {
                    $found += @{ Name = $wtName; Path = $wtPath }
                }
            }
        }
    } catch {}
    Pop-Location
}

if ($found.Count -eq 0) {
    Write-Host "  No active projects found." -ForegroundColor Yellow
    Write-Host "  Create one: .\new-project.bat my-app --type app" -ForegroundColor Gray
    Write-Host ""
    exit
}

Write-Host "  Found $($found.Count) project(s):" -ForegroundColor Green
foreach ($p in $found) {
    $status = if (Test-Path (Join-Path $p.Path "wiki/_map.md")) { "active" } else { "new" }
    Write-Host "    * $($p.Name) ($status)" -ForegroundColor White
}
Write-Host ""

if ($DryRun) {
    Write-Host "  (dry run)" -ForegroundColor Gray
    exit
}

$wtArgs = @()
for ($i = 0; $i -lt $found.Count; $i++) {
    $p = $found[$i]
    if ($i -eq 0) {
        $wtArgs += "-d `"$($p.Path)`" --title `"$($p.Name)`""
    } else {
        $wtArgs += "; new-tab -d `"$($p.Path)`" --title `"$($p.Name)`""
    }
}

$cmd = "wt " + ($wtArgs -join " ")

try {
    Invoke-Expression $cmd
    Write-Host "  Opened $($found.Count) tabs in Windows Terminal" -ForegroundColor Green
    Write-Host ""
    Write-Host "  In each tab run:" -ForegroundColor Gray
    Write-Host "    cf" -ForegroundColor Yellow
    Write-Host "    /continue" -ForegroundColor Yellow
    Write-Host ""
} catch {
    Write-Host "  Windows Terminal (wt) not found." -ForegroundColor Red
    Write-Host "  Install: winget install Microsoft.WindowsTerminal" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Open manually:" -ForegroundColor Yellow
    foreach ($p in $found) {
        Write-Host "    cd $($p.Path)" -ForegroundColor Gray
        Write-Host "    cf" -ForegroundColor Gray
    }
}
Write-Host ""
