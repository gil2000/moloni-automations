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
# Um update falhado nunca impede a app de abrir — arranca-se com o que há.
# Nada de "AVISO": para ela não há aqui nada a fazer, e a palavra só assusta.
if git pull --quiet 2>/dev/null && npm install --silent --no-audit --no-fund 2>/dev/null; then
    echo "Atualizado."
else
    echo "Não foi possível verificar atualizações. A abrir a versão instalada."
fi

# Espera que o servidor responda em vez de dormir 2 segundos às cegas: num
# computador lento o browser abria antes de haver quem servisse a página, e
# ela via um erro de ligação recusada logo à entrada.
echo "A abrir no browser..."
(
    for _ in $(seq 1 60); do
        if curl -s -o /dev/null "http://localhost:4711/api/tipos" 2>/dev/null; then
            open "http://localhost:4711"
            exit 0
        fi
        sleep 0.5
    done
    echo "A aplicação está a demorar. Abre à mão: http://localhost:4711"
) &

npm start
