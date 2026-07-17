@echo off
REM Atalho para a contabilista. Duplo-clique no Explorador.
cd /d "%~dp0"

echo A verificar atualizacoes...
git pull --quiet 2>nul && npm install --silent --no-audit --no-fund 2>nul
if errorlevel 1 echo AVISO: nao foi possivel atualizar. A abrir a versao instalada.

echo A abrir no browser...
start "" /b cmd /c "timeout /t 2 >nul && start http://localhost:4711"
npm start
