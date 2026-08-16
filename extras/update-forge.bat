@echo off
setlocal EnableExtensions EnableDelayedExpansion
REM ============================================================================
REM Project Forge one-click updater (v4.66.7+)
REM
REM PUT THIS FILE NEXT TO project-forge, NOT INSIDE IT:
REM   F:\ProjectForgeUniversal\update-forge.bat
REM   F:\ProjectForgeUniversal\project-forge\
REM
REM It selects the HIGHEST SEMVER package (not the newest file timestamp),
REM backs up user data, extracts it, rebuilds generated Claude/Codex/dashboard
REM surfaces, synchronizes every sibling project, and aborts on any failed gate.
REM ============================================================================

set "ROOT=%~dp0"
set "PROJ=%ROOT%project-forge"
set "DL=%USERPROFILE%\Downloads"
set "ZIP="
set "PKG_VER="
set "CUR_VER=unknown"
set "PROJECTS=0"

if not exist "%PROJ%\.claude-plugin\plugin.json" (
  echo [X] Project Forge not found: %PROJ%
  echo     Put this BAT next to the project-forge folder.
  pause
  exit /b 1
)

REM --- Find highest semantic version from updater folder + Downloads. ---
REM v4.66.7: write discovery result to a temp file instead of capturing a long
REM PowerShell pipeline through FOR /F. The old command could return no rows on
REM some Windows shells even when the ZIP was sitting next to this BAT.
set "PF_ROOT=%ROOT%"
set "PF_DL=%DL%"
set "PF_DISC=%TEMP%\forge-package-%RANDOM%-%RANDOM%.txt"
if exist "!PF_DISC!" del /q "!PF_DISC!" >nul 2>nul
powershell.exe -NoProfile -Command "$roots=@($env:PF_ROOT,$env:PF_DL);$c=@();foreach($r in $roots){if(Test-Path -LiteralPath $r){foreach($f in Get-ChildItem -LiteralPath $r -File -Filter 'project-forge-v*.zip' -ErrorAction SilentlyContinue){if($f.Name -match '^project-forge-v(?<v>\d+\.\d+\.\d+).*\.zip$'){$c += [pscustomobject]@{V=[version]$Matches.v;P=$f.FullName}}}}};if($c.Count -gt 0){$x=$c|Sort-Object V -Descending|Select-Object -First 1;[IO.File]::WriteAllText($env:PF_DISC,$x.V.ToString()+'|'+$x.P)}"
if errorlevel 1 (
  echo [X] Package discovery failed.
  if exist "!PF_DISC!" del /q "!PF_DISC!" >nul 2>nul
  pause
  exit /b 1
)
if exist "!PF_DISC!" (
  set /p "FOUND="<"!PF_DISC!"
  del /q "!PF_DISC!" >nul 2>nul
)
if defined FOUND for /f "tokens=1,* delims=|" %%A in ("!FOUND!") do (
  set "PKG_VER=%%A"
  set "ZIP=%%B"
)
if not defined ZIP (
  echo [X] No project-forge-vX.Y.Z*.zip found next to this BAT or in Downloads.
  pause
  exit /b 1
)

for /f "usebackq delims=" %%V in (`powershell.exe -NoProfile -Command "try{(Get-Content -Raw -LiteralPath '%PROJ%\.claude-plugin\plugin.json'|ConvertFrom-Json).version}catch{'unknown'}"`) do set "CUR_VER=%%V"

for /d %%D in ("%ROOT%*") do (
  if /I not "%%~fD"=="%PROJ%" (
    if exist "%%~fD\.claude" set /a PROJECTS+=1
    if not exist "%%~fD\.claude" if exist "%%~fD\.forge-managed.json" set /a PROJECTS+=1
  )
)

echo.
echo ============================================================
echo  Project Forge updater
echo  Current:  !CUR_VER!
echo  Package:  !PKG_VER!
echo  ZIP:       !ZIP!
echo  Projects:  !PROJECTS! sibling project^(s^)
echo ============================================================

REM Detect downgrade using System.Version.
set "REL=upgrade"
for /f "usebackq delims=" %%R in (`powershell.exe -NoProfile -Command "try{$a=[version]'!CUR_VER!';$b=[version]'!PKG_VER!';if($b -lt $a){'downgrade'}elseif($b -eq $a){'same'}else{'upgrade'}}catch{'upgrade'}"`) do set "REL=%%R"
if /I "!REL!"=="downgrade" (
  echo.
  echo [!] DOWNGRADE requested: !CUR_VER! --^> !PKG_VER!
  choice /c YN /m "Allow downgrade"
  if errorlevel 2 exit /b 0
) else if /I "!REL!"=="same" (
  echo [i] Package version equals installed version; this will repair/re-sync it.
)
choice /c YN /m "Continue"
if errorlevel 2 exit /b 0

REM --- Backup user data before touching engine files. ---
echo.
echo [1/6] Backing up user data...
if exist "%PROJ%\scripts\backup-data.mjs" (
  pushd "%PROJ%" || goto :fail
  node scripts\backup-data.mjs
  set "RC=!ERRORLEVEL!"
  popd
  if not "!RC!"=="0" (
    echo [X] Backup failed with code !RC!. Update aborted.
    goto :fail
  )
) else (
  if not exist "%ROOT%forge-data" mkdir "%ROOT%forge-data" || goto :fail
  if exist "%PROJ%\asset-library.json" copy /Y "%PROJ%\asset-library.json" "%ROOT%forge-data\asset-library.json" >nul || goto :fail
)

REM --- Extract. ---
echo [2/6] Extracting package...
where tar.exe >nul 2>nul
if not errorlevel 1 (
  tar.exe -xf "!ZIP!" -C "%PROJ%"
) else (
  powershell.exe -NoProfile -Command "$ProgressPreference='SilentlyContinue';$ErrorActionPreference='Stop';Expand-Archive -LiteralPath '!ZIP!' -DestinationPath '%PROJ%' -Force"
)
if errorlevel 1 (
  echo [X] Extract failed.
  goto :fail
)

REM Verify package actually changed engine metadata to expected filename version.
set "INSTALLED_AFTER=unknown"
for /f "usebackq delims=" %%V in (`powershell.exe -NoProfile -Command "try{(Get-Content -Raw -LiteralPath '%PROJ%\.claude-plugin\plugin.json'|ConvertFrom-Json).version}catch{'unknown'}"`) do set "INSTALLED_AFTER=%%V"
if /I not "!INSTALLED_AFTER!"=="!PKG_VER!" (
  echo [X] Package/version mismatch after extract: expected !PKG_VER!, got !INSTALLED_AFTER!.
  echo     Check that the ZIP has Forge files at archive root, not inside an extra folder.
  goto :fail
)

REM --- Upgrade generated surfaces + cleanup. ---
echo [3/6] Running upgrade...
pushd "%PROJ%" || goto :fail
call upgrade.bat /noprompt
set "RC=!ERRORLEVEL!"
if not "!RC!"=="0" (
  popd
  echo [X] upgrade.bat failed with code !RC!.
  goto :fail
)

REM --- Sync every sibling. ---
echo [4/6] Synchronizing sibling projects...
call sync.bat
set "RC=!ERRORLEVEL!"
if not "!RC!"=="0" (
  popd
  echo [X] sync.bat failed with code !RC!.
  goto :fail
)

REM --- Hard integrity gates. ---
echo [5/6] Running integrity gates...
node scripts\check-dashboard-meta.mjs
if errorlevel 1 (popd & echo [X] Dashboard integrity failed. & goto :fail)
node scripts\check-codex-compat.mjs
if errorlevel 1 (popd & echo [X] Codex compatibility failed. & goto :fail)
node scripts\check-drift.mjs
if errorlevel 1 (popd & echo [X] Forge drift check failed. & goto :fail)

REM --- Verify sibling payload after sync. ---
echo [6/6] Verifying sibling synchronization...
node scripts\check-sync-status.mjs
if errorlevel 1 (popd & echo [X] One or more sibling projects are out of sync. & goto :fail)
node scripts\bump-version.mjs --current
popd

echo.
echo ============================================================
echo  SUCCESS: Project Forge !PKG_VER! installed and synchronized.
echo  Sibling projects checked: !PROJECTS!
echo  User data remains outside engine: %ROOT%forge-data
echo ============================================================
echo.
pause
exit /b 0

:fail
echo.
echo ============================================================
echo  UPDATE FAILED. Do not treat this install as clean.
echo  Fix the first [X] above, then rerun this updater.
echo ============================================================
echo.
pause
exit /b 1
