@echo off
setlocal EnableExtensions

cd /d "%~dp0"

if /i "%~1"=="--no-pause" set "FORGE_VALIDATE_NO_PAUSE=1"
if /i "%~1"=="/no-pause" set "FORGE_VALIDATE_NO_PAUSE=1"
if /i "%~1"=="--ci" set "FORGE_VALIDATE_NO_PAUSE=1"

echo.
echo ==============================
echo   Forge Code - Local Validate
echo ==============================
echo.
if "%FORGE_VALIDATE_NO_PAUSE%"=="1" echo [INFO] Non-interactive mode: pause disabled.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  echo Please install Node.js first, then run this file again.
  echo https://nodejs.org/
  echo.
  pause
  exit /b 1
)

echo [INFO] Syntax check...
node --check server.js || goto :failed
node --check app.js || goto :failed

echo.
echo [INFO] Capability audit CLI...
node server.js --capability-audit || goto :failed
node server.js --capabilities-json >nul || goto :failed
node server.js --capability-audit --json | findstr /c:"api smoke section queued task" >nul
if not errorlevel 1 (
  echo [ERROR] Capability audit is polluted by smoke goal state.
  goto :failed
)

echo.
echo [INFO] Project doctor CLI...
node server.js --doctor || goto :failed
node server.js --doctor --json >nul || goto :failed

echo.
echo [INFO] CLI argument guard...
node server.js --definitely-unknown-cli-flag >nul 2>nul
if not errorlevel 1 (
  echo [ERROR] Unknown CLI flag unexpectedly started or succeeded.
  goto :failed
)

echo.
echo [INFO] External authorization status CLI...
node server.js --external-authorization-status || goto :failed

echo.
echo [INFO] Workspace readiness CLI...
node server.js --workspace-readiness || goto :failed

echo.
echo [INFO] Port conflict retry smoke...
node server.js --port-conflict-smoke-test || goto :failed

echo.
echo [INFO] External readiness dry-run...
node server.js --external-readiness --dry-run || goto :failed

echo.
echo [INFO] External authorization action dry-run...
node server.js --external-authorization-action --dry-run || goto :failed

echo.
echo [INFO] Integration readiness dry-run...
node server.js --integration-readiness --dry-run || goto :failed

echo.
echo [INFO] UI smoke...
node server.js --ui-smoke-test || goto :failed

echo.
echo [INFO] Fast API smoke...
node server.js --api-smoke-section=fast || goto :failed

echo.
echo [INFO] Debug API smoke...
node server.js --api-smoke-section=debug || goto :failed

echo.
echo [INFO] Browser API smoke...
node server.js --api-smoke-section=browser || goto :failed

echo.
echo [INFO] Assets API smoke...
node server.js --api-smoke-section=assets || goto :failed

echo.
echo [INFO] Integration API smoke...
node server.js --api-smoke-section=integrations || goto :failed

echo.
echo [INFO] Patch whitespace check...
git diff --check -- .gitignore .mcp.json server.js app.js README.md package.json start.bat validate.bat scripts/mcp-local-workspace.js extensions/plugins/local-readonly-helper/manifest.json || goto :failed

echo.
echo [INFO] Publish API smoke...
node server.js --api-smoke-section=publish || goto :failed

echo.
echo [OK] Validation passed.
if not "%FORGE_VALIDATE_NO_PAUSE%"=="1" pause
exit /b 0

:failed
echo.
echo [ERROR] Validation failed.
if not "%FORGE_VALIDATE_NO_PAUSE%"=="1" pause
exit /b 1
