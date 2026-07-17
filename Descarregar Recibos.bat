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

echo A abrir no browser...
start "" /b cmd /c "timeout /t 3 >nul && start http://localhost:4711"
npm start
