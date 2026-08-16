@echo off
REM ============================================================================
REM Forge upgrade launcher for Windows
REM
REM .bat files don't get Mark-of-the-Web blocked when extracted from zip,
REM unlike .ps1. This wrapper launches upgrade.ps1 with -ExecutionPolicy Bypass
REM so unsigned scripts work on a fresh install without manual Unblock-File.
REM
REM Usage: Double-click upgrade.bat OR run from cmd/PowerShell.
REM
REM v4.10.33+ - chicken-egg fix: upgrade.ps1 cannot unblock itself if MotW
REM blocks it loading. This .bat bootstraps the unblock process.
REM ============================================================================

if /i "%~1"=="/selftest" (
    echo FORGE_UPGRADE_BAT_OK
    exit /b 0
)

setlocal

REM Resolve directory of this script (handles spaces in paths)
set "FORGE_DIR=%~dp0"

REM Strip trailing backslash for cleaner output
if "%FORGE_DIR:~-1%"=="\" set "FORGE_DIR=%FORGE_DIR:~0,-1%"

echo.
echo === Project Forge upgrade ===
echo Folder: %FORGE_DIR%
echo.

REM Check that upgrade.ps1 exists
if not exist "%FORGE_DIR%\upgrade.ps1" (
    echo [X] upgrade.ps1 not found in %FORGE_DIR%
    echo     Make sure you extracted ALL files from Forge zip.
    echo.
    pause
    exit /b 2
)

REM Run PowerShell with Bypass - even unsigned .ps1 will execute
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%FORGE_DIR%\upgrade.ps1"

REM Capture exit code
set EXIT_CODE=%ERRORLEVEL%

echo.
if %EXIT_CODE% EQU 0 (
    echo === Upgrade completed successfully ===
) else (
    echo === Upgrade exited with code %EXIT_CODE% ===
)

echo.
echo Next step: run sync to propagate changes to sibling projects:
echo   sync.bat                  ^& rem canonical Claude + Codex sibling sync
echo.

REM Pause if launched by double-click (so the window does not auto-close).
REM Detecting explorer.exe as the parent is fragile, so use /noprompt for automation.
REM always pause unless invoked with /noprompt argument
if /i not "%1"=="/noprompt" pause

exit /b %EXIT_CODE%
