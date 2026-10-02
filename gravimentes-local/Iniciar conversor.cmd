@echo off
title Gravimentes - Aplicacion local CMD
echo Gravimentes - Aplicacion local del plan
echo Carpeta: %~dp0
echo Navegador: http://127.0.0.1:8765
echo Mantenga esta ventana abierta mientras usa la aplicacion.
echo.
python -u "%~dp0conversor\servidor.py" --host 127.0.0.1 --puerto 8765 --db "%~dp0conversor\datos\gravimentes.sqlite3"
if errorlevel 1 pause
