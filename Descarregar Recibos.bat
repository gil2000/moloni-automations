@echo off
REM Atalho para a contabilista. Duplo-clique no Explorador.
cd /d "%~dp0"

REM Ver o comentario equivalente no launcher de macOS: fechar esta janela mata
REM o servidor a meio do download.
echo.
echo   +--------------------------------------------------+
echo   ^|  NAO FECHES ESTA JANELA enquanto descarregas.     ^|
echo   ^|  Fecha-la cancela o download a meio.              ^|
echo   ^|  No fim, fecha-a para terminar a aplicacao.       ^|
echo   +--------------------------------------------------+
echo.

echo A verificar atualizacoes...
git pull --quiet 2>nul && npm install --silent --no-audit --no-fund 2>nul
if errorlevel 1 echo Nao foi possivel verificar atualizacoes. A abrir a versao instalada.

REM Espera que o servidor responda em vez de dormir 3 segundos as cegas: num
REM computador lento o browser abria antes de haver quem servisse a pagina,
REM e ela via um erro de ligacao recusada logo a entrada. Mesmo padrao do
REM launcher de macOS (curl + sleep), aqui com PowerShell por estar sempre
REM disponivel no Windows 10+.
echo A abrir no browser...
start "" /b powershell -NoProfile -Command "for ($i=0; $i -lt 60; $i++) { try { Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:4711/api/tipos' -TimeoutSec 1 | Out-Null; Start-Process 'http://localhost:4711'; exit } catch {}; Start-Sleep -Milliseconds 500 }; Write-Host 'A aplicacao esta a demorar. Abre a mao: http://localhost:4711'"

npm start
