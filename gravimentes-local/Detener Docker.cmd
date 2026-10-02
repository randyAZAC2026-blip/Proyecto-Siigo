@echo off
title Gravimentes - Detener Docker
docker compose --project-directory "%~dp0." -f "%~dp0compose.yaml" down
if errorlevel 1 (
  pause
  exit /b 1
)
echo.
echo Aplicacion detenida. Los datos se conservan en conversor\datos.
pause
