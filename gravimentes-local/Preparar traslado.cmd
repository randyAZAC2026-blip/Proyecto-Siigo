@echo off
title Gravimentes - Preparar traslado
python "%~dp0preparar_traslado.py"
if errorlevel 1 (
  pause
  exit /b 1
)
echo.
echo Copia distribucion\Gravimentes-trabajo.zip a tu equipo de trabajo.
pause
