# forge.ps1 - Project Forge CLI for Windows
# Manage multiple isolated projects
#
# Usage:
#   .\scripts\forge.ps1 new <name> [description]
#   .\scripts\forge.ps1 list
#   .\scripts\forge.ps1 open <name>
#   .\scripts\forge.ps1 remove <name>
#   .\scripts\forge.ps1 status

param(
    [Parameter(Position=0)]
    [string]$Command = "help",

    [Parameter(Position=1)]
    [string]$ProjectName,

    [Parameter(Position=2)]
    [string]$Description
)

$ForgeRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

switch ($Command) {
    "new" {
        Write-Host "[!] forge.ps1 new is a compatibility wrapper. Canonical creator: new-project.bat" -ForegroundColor Yellow
        if (-not $ProjectName) {
            Write-Host "Usage: forge.ps1 new <project-name> [description]"
            Write-Host "Preferred: .\new-project.bat <project-name> --type game|app --title `"Title`""
            exit 1
        }
        $creator = Join-Path $ForgeRoot 'scripts\new-project.mjs'
        $nodeArgs = @($creator, $ProjectName, '--type', 'game')
        if ($Description) { $nodeArgs += @('--title', $Description) }
        & node @nodeArgs
        exit $LASTEXITCODE
    }

    "list" {
        Write-Host ""
        Write-Host "  === ACTIVE PROJECTS ===" -ForegroundColor Cyan
        Write-Host ""

        Push-Location $ForgeRoot
        $worktrees = git worktree list 2>$null
        $count = 0

        foreach ($line in $worktrees) {
            if ($line -match '\[project/(.+?)\]') {
                $name = $Matches[1]
                $path = ($line -split '\s+')[0]
                $count++

                $status = if (Test-Path "$path\wiki\_map.md") { "[active] has wiki" } elseif (Test-Path "$path\CONTEXT.md") { "[active] has CONTEXT.md" } else { "[new] not started" }
                Write-Host "  > $name" -ForegroundColor White
                Write-Host "     Path: $path" -ForegroundColor Gray
                Write-Host "     Status: $status" -ForegroundColor Gray
                Write-Host ""
            }
        }

        Pop-Location
        Write-Host "  Total: $count project(s)" -ForegroundColor DarkGray
        Write-Host ""
    }

    "open" {
        if (-not $ProjectName) {
            Write-Host "Usage: forge.ps1 open <project-name>"
            exit 1
        }

        $WorktreePath = Join-Path (Split-Path $ForgeRoot) $ProjectName

        if (-not (Test-Path $WorktreePath)) {
            Write-Host "[!!] Project '$ProjectName' not found." -ForegroundColor Red
            exit 1
        }

        Write-Host "[..] Opening $ProjectName..." -ForegroundColor Cyan
        Set-Location $WorktreePath
        cf
    }

    "remove" {
        if (-not $ProjectName) {
            Write-Host "Usage: forge.ps1 remove <project-name>"
            exit 1
        }

        $WorktreePath = Join-Path (Split-Path $ForgeRoot) $ProjectName
        $Branch = "project/$ProjectName"

        if (-not (Test-Path $WorktreePath)) {
            Write-Host "[!!] Project '$ProjectName' not found." -ForegroundColor Red
            exit 1
        }

        $confirm = Read-Host "Remove '$ProjectName'? (y/N)"
        if ($confirm -eq 'y') {
            Push-Location $ForgeRoot
            git worktree remove $WorktreePath --force
            git branch -D $Branch 2>$null
            Pop-Location
            Write-Host "[OK] Project '$ProjectName' removed." -ForegroundColor Green
        }
    }

    "status" {
        Write-Host ""
        Write-Host "  === ALL PROJECTS STATUS ===" -ForegroundColor Cyan
        Write-Host ""

        Push-Location $ForgeRoot
        $worktrees = git worktree list 2>$null

        foreach ($line in $worktrees) {
            if ($line -match '\[project/(.+?)\]') {
                $name = $Matches[1]
                $path = ($line -split '\s+')[0]

                if (Test-Path "$path\wiki\_map.md") {
                    $done = (Select-String -Path "$path\wiki\_map.md" -Pattern "^\- \[x\]" -ErrorAction SilentlyContinue).Count
                    $todo = (Select-String -Path "$path\wiki\_map.md" -Pattern "^\- \[ \]" -ErrorAction SilentlyContinue).Count
                    $total = $done + $todo
                    Write-Host "  > ${name}: ${done}/${total} features" -ForegroundColor White
                } elseif (Test-Path "$path\CONTEXT.md") {
                    $done = (Select-String -Path "$path\CONTEXT.md" -Pattern "^\- \[x\]" -ErrorAction SilentlyContinue).Count
                    $todo = (Select-String -Path "$path\CONTEXT.md" -Pattern "^\- \[ \]" -ErrorAction SilentlyContinue).Count
                    $total = $done + $todo
                    Write-Host "  > ${name}: ${done}/${total} features (legacy)" -ForegroundColor Yellow
                } else {
                    Write-Host "  > ${name}: not started" -ForegroundColor Gray
                }
            }
        }

        Pop-Location
        Write-Host ""
    }

    default {
        Write-Host ""
        Write-Host "  Project Forge CLI" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "  Usage:"
        Write-Host "    forge.ps1 new <name> [desc]    Create new isolated project"
        Write-Host "    forge.ps1 list                 List all active projects"
        Write-Host "    forge.ps1 open <name>          Open project in Claude"
        Write-Host "    forge.ps1 remove <name>        Remove project worktree"
        Write-Host "    forge.ps1 status               Show all projects status"
        Write-Host ""
    }
}
