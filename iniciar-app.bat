@echo off
cd /d "%~dp0"
echo Iniciando Inventario...
echo.
echo La app va a estar disponible en: http://localhost:3000
echo Para cerrar, apreta Ctrl+C dos veces y cerra esta ventana.
echo.
start "" http://localhost:3000
npm run dev
pause
