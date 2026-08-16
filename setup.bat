@echo off
REM ============================================================================
REM Forge initial setup launcher for Windows
REM
REM Same pattern as upgrade.bat: .bat does not't get MotW blocked, allowing
REM -ExecutionPolicy Bypass for running unsigned setup.ps1 on fresh install.
REM
REM Run this ONCE после first extracting Forge zip к target folder.
REM ============================================================================

setlocal

set "FORGE_DIR=%~dp0"
if "%FORGE_DIR:~-1%"=="\" set "FORGE_DIR=%FORGE_DIR:~0,-1%"

echo.
echo === Project Forge initial setup ===
echo Folder: %FORGE_DIR%
echo.

if not exist "%FORGE_DIR%\setup.ps1" (
    echo [X] setup.ps1 not found in %FORGE_DIR%
    echo     Make sure you extracted ALL files from Forge zip.
    echo.
    pause
    exit /b 2
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%FORGE_DIR%\setup.ps1"
set EXIT_CODE=%ERRORLEVEL%

echo.
if %EXIT_CODE% EQU 0 (
    echo === Setup completed successfully ===
    echo.
    echo Next steps:
    echo   1. Open dashboard.html to see projects
    echo   2a. Claude Code: claude, then /game ^<idea^>
    echo   2b. Codex:       codex, then $game ^<idea^>
    echo   3. Or work on existing project in sibling folder
) else (
    echo === Setup exited with code %EXIT_CODE% ===
)

echo.
if /i not "%1"=="/noprompt" pause

exit /b %EXIT_CODE%
