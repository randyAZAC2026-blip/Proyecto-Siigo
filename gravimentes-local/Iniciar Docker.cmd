@echo off
title Gravimentes - Docker
docker compose --project-directory "%~dp0." -f "%~dp0compose.yaml" up -d --build
if errorlevel 1 (
  echo.
  echo No se pudo iniciar. Comprueba que Docker Desktop este instalado y abierto.
  pause
  exit /b 1
)
echo.
echo Gravimentes iniciado: http://localhost:8765
echo Si cambiaste GRAVIMENTES_PUERTO en .env, utiliza ese puerto.
pause
