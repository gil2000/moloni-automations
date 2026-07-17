#!/bin/bash
# Atalho para a contabilista. Duplo-clique no Finder.
cd "$(dirname "$0")" || exit 1

# O Node vem primeiro: sem ele não há app, e não faz sentido avisá-la para não
# fechar uma janela que não vai descarregar nada.
# Sem isto, uma máquina sem Node dava "npm: command not found" — que para ela
# não quer dizer nada, e não sugere sequer a quem ligar.
if ! command -v npm > /dev/null 2>&1; then
    echo ""
    echo "  O Node.js não está instalado nesta máquina, e a aplicação precisa dele."
    echo "  Isto não é nada que tenhas feito mal — falta instalar uma peça."
    echo ""
    echo "  Liga ao Gil, ou instala em: https://nodejs.org (versão LTS)"
    echo ""
    echo "  Carrega em Enter para fechar."
    read -r _
    exit 1
fi

# Ela vai pensar que "a app é o browser" e fechar esta janela — e isso mata o
# servidor a meio do download, sem explicação nenhuma. Este aviso é a única
# coisa que o impede.
echo ""
echo "  +--------------------------------------------------+"
echo "  |  NAO FECHES ESTA JANELA enquanto descarregas.     |"
echo "  |  Fecha-la cancela o download a meio.              |"
echo "  |  No fim, fecha-a para terminar a aplicacao.       |"
echo "  +--------------------------------------------------+"
echo ""

echo "A verificar atualizações..."
# Esta máquina é um espelho só-de-leitura do repo, não um sítio onde se
# desenvolve. Nada aqui deve ter alterações locais — e se tiver, deitam-se fora.
#
# Porque "reset --hard" e não "git pull": o npm install reescreve o
# package-lock.json (ajusta-o às dependências opcionais de cada plataforma), o
# que suja a árvore. A partir daí o "git pull" recusa-se a funcionar — para
# sempre — com "local changes would be overwritten". Como o launcher engole o
# erro para não impedir o arranque, os updates morriam em SILÊNCIO em todas as
# máquinas de clientes. Apanhado num teste real em Windows.
#
# Um update falhado nunca impede a app de abrir: arranca-se com o que há.
if git fetch --quiet origin 2>/dev/null \
   && git reset --hard --quiet origin/main 2>/dev/null \
   && npm install --silent --no-audit --no-fund 2>/dev/null; then
    echo "Atualizado."
else
    echo "Não foi possível verificar atualizações. A abrir a versão instalada."
fi

# O browser é aberto pelo próprio servidor, quando está pronto (ver
# src/server/index.js). Quem sabe quando o servidor está pronto é o servidor —
# aqui só se conseguia adivinhar, e essa adivinhação tinha de ser escrita duas
# vezes, em bash e em PowerShell. A de Windows nunca funcionou.
npm start

# Se o npm start rebentar, a janela não deve desaparecer e levar o erro com ela
# — foi assim que um bug do launcher de Windows ficou invisível no primeiro
# teste. Ela tem de conseguir ler o que se passou, nem que seja para o repetir
# ao telefone.
echo ""
echo "A aplicação terminou. Carrega em Enter para fechar."
read -r _
