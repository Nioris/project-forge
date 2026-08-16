@echo off
:: open-all.bat - open all sibling projects in Windows Terminal
:: Pure ASCII only - cmd.exe parser breaks on multi-byte chars in if/for blocks.

setlocal EnableDelayedExpansion

cd /d "%~dp0"

echo.
echo   === PROJECT FORGE - Open All Sibling Projects ===
echo.

set FORGE=%~dp0..
pushd "%FORGE%"
set FORGE_ABS=%CD%
popd

set WT_ARGS=
set FIRST=1
set FOUND=0

for /d %%P in ("%FORGE%\..\*") do (
  set SKIP=0
  pushd "%%P"
  set CHILD_ABS=!CD!
  popd
  if /I "!CHILD_ABS!"=="%FORGE_ABS%" set SKIP=1
  if /I "%%~nxP"=="Project-forge" set SKIP=1
  if /I "%%~nxP"=="project-forge" set SKIP=1

  if !SKIP!==0 (
    if exist "%%P\wiki\_map.md" (
      set /a FOUND+=1
      if !FIRST!==1 (
        set WT_ARGS=-d "%%P" --title "%%~nxP"
        set FIRST=0
      ) else (
        set WT_ARGS=!WT_ARGS! ; new-tab -d "%%P" --title "%%~nxP"
      )
      echo   [+] %%~nxP
    )
  )
)

if !FOUND!==0 (
  echo   No sibling projects found with wiki\_map.md
  echo   Create one with: new-project.bat MyProject --type game
  echo.
  pause
  exit /b 1
)

echo.
echo   Found !FOUND! project^(s^). Opening Windows Terminal...
wt !WT_ARGS!

echo.
echo   In each tab run: cf
echo   Then: /continue   ^(or /start if new project^)
