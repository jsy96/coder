@echo off
setlocal enabledelayedexpansion

REM ============================================================
REM  1git.bat - One-shot stage + commit + push for this repo
REM  Usage:
REM    1git.bat                  -> auto commit with timestamp
REM    1git.bat fix login bug    -> commit with custom message
REM ============================================================

REM Switch to the folder where this script lives
cd /d "%~dp0"

REM Make sure we are inside a git repository
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Not a git repository. Place and run this script in the project root.
    exit /b 1
)

REM Build the commit message: use args if given, otherwise a timestamp
set "MSG=%*"

REM Strip surrounding double quotes that some shells (e.g. git-bash) inject
set Q="
set "FIRST=!MSG:~0,1!"
set "LAST=!MSG:~-1!"
if "!FIRST!"=="!Q!" set "MSG=!MSG:~1!"
if "!LAST!"=="!Q!" set "MSG=!MSG:~0,-1!"

if not defined MSG (
    for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm-ss"') do set "TS=%%i"
    set "MSG=Auto commit at !TS!"
)

echo.
echo === Step 1/3: Staging changes ===
git add -A
if errorlevel 1 (
    echo [ERROR] git add failed.
    exit /b 1
)

REM Skip everything if there is nothing staged
git diff --cached --quiet
if not errorlevel 1 (
    echo [INFO] Nothing to commit. Working tree is clean.
    exit /b 0
)

echo.
echo === Step 2/3: Committing ===
echo Message: !MSG!

REM Write the message to a temp file and commit with -F, so that spaces
REM and special characters in the message never break the command line.
set "TMPMSG=%TEMP%\1git_commit_msg_%RANDOM%.txt"
> "%TMPMSG%" echo !MSG!
git commit -F "%TMPMSG%"
set "COMMIT_RC=!errorlevel!"
del "%TMPMSG%" >nul 2>&1
if not "!COMMIT_RC!"=="0" (
    echo [ERROR] git commit failed.
    exit /b 1
)

echo.
echo === Step 3/3: Pushing to remote ===
git push
if errorlevel 1 (
    echo [ERROR] git push failed. Check credentials or network, then retry.
    exit /b 1
)

echo.
echo [DONE] Commit and push finished successfully.
endlocal
git status
pause