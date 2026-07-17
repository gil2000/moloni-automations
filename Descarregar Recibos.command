#!/bin/bash
# Atalho para a contabilista. Duplo-clique no Finder.
cd "$(dirname "$0")" || exit 1

echo "A verificar atualizações..."
# Um update falhado nunca impede a app de abrir — arranca-se com o que há.
if git pull --quiet 2>/dev/null && npm install --silent --no-audit --no-fund 2>/dev/null; then
    echo "Atualizado."
else
    echo "AVISO: não foi possível atualizar. A abrir a versão instalada."
fi

echo "A abrir no browser..."
(sleep 2 && open "http://localhost:4711") &
npm start
