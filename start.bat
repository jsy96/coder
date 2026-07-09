@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

echo.
echo ==============================
echo   Forge Code - Local Startup
echo ==============================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  echo Please install Node.js first, then run this file again.
  echo https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist "%CD%\server.js" (
  echo [ERROR] server.js was not found in:
  echo %CD%
  echo.
  pause
  exit /b 1
)

if not defined DEEPSEEK_API_KEY (
  echo [INFO] DEEPSEEK_API_KEY is not set.
  set /p "DEEPSEEK_API_KEY=Enter your DeepSeek API Key, or press Enter to start without it: "
)

if not defined FORGE_MODELS set "FORGE_MODELS=deepseek-v4-pro,deepseek-chat"
if not defined FORGE_MODEL_API_URL set "FORGE_MODEL_API_URL=https://api.deepseek.com/chat/completions"
if not defined FORGE_WORKSPACE set "FORGE_WORKSPACE=%CD%"
if not defined FORGE_PORT (
  if defined PORT (
    set "FORGE_PORT=%PORT%"
  ) else (
    set "FORGE_PORT=4173"
  )
)
if not defined FORGE_PORT_RETRY_LIMIT set "FORGE_PORT_RETRY_LIMIT=50"
if not defined FORGE_PORT_AUTO_RETRY set "FORGE_PORT_AUTO_RETRY=1"
if not defined FORGE_START_RETRY_ON_EADDRINUSE set "FORGE_START_RETRY_ON_EADDRINUSE=1"

set "FORGE_PREFERRED_PORT=%FORGE_PORT%"
set /a "FORGE_PORT_SCAN_END=%FORGE_PREFERRED_PORT%+%FORGE_PORT_RETRY_LIMIT%" >nul 2>nul
if errorlevel 1 (
  echo [ERROR] FORGE_PORT must be a number. Current value: %FORGE_PORT%
  echo.
  pause
  exit /b 1
)

:select_start_port
call :find_free_port "%FORGE_PREFERRED_PORT%" "%FORGE_PORT_SCAN_END%"
if errorlevel 1 (
  echo [ERROR] Could not find a free local port from %FORGE_PREFERRED_PORT% to %FORGE_PORT_SCAN_END%.
  echo Close an existing server or set another port, for example:
  echo        set FORGE_PORT=4174
  echo        start.bat
  echo.
  pause
  exit /b 1
)

if not "%FORGE_PORT%"=="%FORGE_PREFERRED_PORT%" (
  echo [INFO] Port %FORGE_PREFERRED_PORT% is busy. Using free port %FORGE_PORT%.
  call :print_port_owner "%FORGE_PREFERRED_PORT%"
)

echo [INFO] Workspace: %FORGE_WORKSPACE%
set "FORGE_URL=http://127.0.0.1:%FORGE_PORT%"
echo [INFO] URL: %FORGE_URL%
echo [INFO] If server.js auto-retries again, open the final FORGE_URL it prints.
echo [INFO] If this port becomes busy during startup, server.js will print and use the next free port.
echo.
echo [INFO] Starting server on port %FORGE_PORT%...
echo.

node "%CD%\server.js" "--port=%FORGE_PORT%"
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if "%EXIT_CODE%"=="0" (
  echo [INFO] Server stopped.
) else (
  echo [ERROR] Server stopped with exit code %EXIT_CODE%.
  echo [HINT] If you saw EADDRINUSE, an older server.js may still be running or another app grabbed the port.
  echo        Run start.bat again, or set another port:
  echo        set FORGE_PORT=4174
  echo        start.bat
  echo        You can also check the owner with:
  echo        netstat -ano -p tcp ^| findstr :%FORGE_PREFERRED_PORT%
)
pause
exit /b %EXIT_CODE%

:find_free_port
setlocal EnableDelayedExpansion
set "PORT_SCAN_RESULT="

for /l %%P in (%~1,1,%~2) do (
  if %%P GTR 65535 goto :port_scan_done
  netstat -ano -p tcp | findstr /r /c:":%%P .*LISTENING" >nul 2>nul
  if errorlevel 1 (
    set "PORT_SCAN_RESULT=%%P"
    goto :port_scan_done
  )
)

:port_scan_done
if not defined PORT_SCAN_RESULT (
  endlocal
  exit /b 1
)

endlocal & set "FORGE_PORT=%PORT_SCAN_RESULT%" & set "PORT=%PORT_SCAN_RESULT%"
exit /b 0

:print_port_owner
setlocal
set "BUSY_PORT=%~1"
set "OWNER_FOUND="
for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr /r /c:":%BUSY_PORT% .*LISTENING"') do (
  if not defined OWNER_FOUND (
    set "OWNER_FOUND=1"
    echo [INFO] Existing listener on port %BUSY_PORT% has PID %%P.
  )
)
endlocal
exit /b 0
