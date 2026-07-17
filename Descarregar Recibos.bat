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

REM Esta maquina e um espelho so-de-leitura do repo, nao um sitio onde se
REM desenvolve. Nada aqui deve ter alteracoes locais — e se tiver, deitam-se fora.
REM
REM Porque "reset --hard" e nao "git pull": o npm install reescreve o
REM package-lock.json (ajusta-o as dependencias opcionais de cada plataforma), o
REM que suja a arvore. A partir dai o "git pull" recusa-se a funcionar — para
REM sempre — com "local changes would be overwritten". Como o launcher engole o
REM erro para nao impedir o arranque, os updates morriam em SILENCIO em todas as
REM maquinas de clientes. Apanhado num teste real em Windows.
echo A verificar atualizacoes...
git fetch --quiet origin >nul 2>nul
if errorlevel 1 (
    echo Nao foi possivel verificar atualizacoes. A abrir a versao instalada.
) else (
    git reset --hard --quiet origin/main >nul 2>nul
    call npm install --silent --no-audit --no-fund >nul 2>nul
    echo Atualizado.
)

REM O browser e aberto pelo proprio servidor, quando esta pronto (ver
REM src/server/index.js). A versao anterior tentava adivinhar aqui, com
REM PowerShell e polling dentro de um start /b — aspas dentro de aspas dentro
REM do cmd — e nunca funcionou num Windows a serio.
call npm start

REM Se o npm start rebentar, a janela fechava-se e levava o erro com ela — que
REM foi exatamente o que aconteceu no primeiro teste em Windows. Nunca deixar
REM esta janela desaparecer sem ela poder ler o que se passou.
echo.
echo A aplicacao terminou.
pause
