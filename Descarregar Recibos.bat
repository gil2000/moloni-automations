@echo off
REM Atalho para a contabilista. Duplo-clique no Explorador.
cd /d "%~dp0"

REM ATENCAO: no Windows o npm e um ficheiro batch (npm.cmd). Um .bat que chama
REM outro .bat SEM "call" transfere o controlo e nunca volta — as linhas
REM seguintes nunca correm. Sem os "call" abaixo, o npm install corria, o
REM script acabava ali, e o npm start nunca chegava a arrancar: a janela
REM fechava-se e o browser abria em nada. Nao tirar os "call".

REM Sem isto, uma maquina sem Node dava "npm nao e reconhecido" — que para ela
REM nao quer dizer nada, e nao sugere sequer a quem ligar.
where npm >nul 2>nul
if errorlevel 1 (
    echo.
    echo   O Node.js nao esta instalado nesta maquina, e a aplicacao precisa dele.
    echo   Isto nao e nada que tenhas feito mal — falta instalar uma peca.
    echo.
    echo   Liga ao Gil, ou instala em: https://nodejs.org ^(versao LTS^)
    echo.
    pause
    exit /b 1
)

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
git pull --quiet >nul 2>nul
if errorlevel 1 (
    echo Nao foi possivel verificar atualizacoes. A abrir a versao instalada.
) else (
    call npm install --silent --no-audit --no-fund >nul 2>nul
    echo Atualizado.
)

REM Espera que o servidor responda em vez de dormir as cegas: num computador
REM lento o browser abria antes de haver quem servisse a pagina, e ela via um
REM erro de ligacao recusada logo a entrada. Mesmo padrao do launcher de macOS,
REM aqui com PowerShell por estar sempre disponivel no Windows 10+.
echo A abrir no browser...
start "" /b powershell -NoProfile -Command "for ($i=0; $i -lt 60; $i++) { try { Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:4711/api/tipos' -TimeoutSec 1 | Out-Null; Start-Process 'http://localhost:4711'; exit } catch {}; Start-Sleep -Milliseconds 500 }; Write-Host 'A aplicacao esta a demorar. Abre a mao: http://localhost:4711'"

call npm start

REM Se o npm start rebentar, a janela fechava-se e levava o erro com ela — que
REM foi exatamente o que aconteceu no primeiro teste em Windows. Nunca deixar
REM esta janela desaparecer sem ela poder ler o que se passou.
echo.
echo A aplicacao terminou.
pause
