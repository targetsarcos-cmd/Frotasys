@echo off
echo.
echo  ╔══════════════════════════════════════╗
echo  ║        FROTASYS — Iniciando...       ║
echo  ╚══════════════════════════════════════╝
echo.

:: Check if Node is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  [ERRO] Node.js nao encontrado!
    echo  Baixe em: https://nodejs.org
    pause
    exit /b 1
)

:: Install dependencies if needed
if not exist "node_modules" (
    echo  Instalando dependencias pela primeira vez...
    npm install
    echo.
)

echo  Servidor iniciando...
echo  Aguarde o endereco de rede aparecer abaixo.
echo  ─────────────────────────────────────────
echo.
node server.js
pause
