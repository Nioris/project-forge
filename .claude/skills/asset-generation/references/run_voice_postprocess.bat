@echo off
REM Постпроцесс голосовых mp3 через ffmpeg.
REM Находит новые файлы в web\audio\voice\ (которых ещё нет в voice_orig\),
REM делает бэкап оригинала в voice_orig\ и прогоняет через фильтр:
REM   highpass=f=80         — срезает гул < 80 Гц
REM   afftdn=nr=12:nf=-25   — спектральный шумодав
REM   dynaudnorm=p=0.95     — выравнивание громкости
REM
REM Запускать ПОСЛЕ run_voice_chN.bat — он догонит только свежие 16 (или сколько ты сгенерил).
REM Безопасно: уже обработанные файлы пропускаются.

cd /d "%~dp0\.."

if not exist "audio\voice_orig" mkdir "audio\voice_orig"

set "FILTER=highpass=f=80,afftdn=nr=12:nf=-25,dynaudnorm=p=0.95"
set "DONE=0"
set "SKIP=0"

for %%F in (audio\voice\*.mp3) do call :process "%%F"

echo.
echo === Готово: обработано %DONE%, пропущено (уже было) %SKIP% ===
pause
exit /b 0

:process
set "FILE=%~1"
set "NAME=%~nx1"
if exist "audio\voice_orig\%NAME%" (
    set /a SKIP+=1
    exit /b 0
)
echo [+] %NAME%
REM Перенесём сырой mp3 в voice_orig, оттуда прогоним через ffmpeg обратно в voice
move /Y "%FILE%" "audio\voice_orig\%NAME%" >nul
ffmpeg -y -hide_banner -loglevel error -i "audio\voice_orig\%NAME%" -af "%FILTER%" -c:a libmp3lame -q:a 4 "%FILE%"
if errorlevel 1 (
    echo     !! ffmpeg error - restoring original
    move /Y "audio\voice_orig\%NAME%" "%FILE%" >nul
    exit /b 1
)
set /a DONE+=1
exit /b 0
