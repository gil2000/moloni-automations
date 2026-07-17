'use strict';
const fs = require('fs');
const path = require('path');

// Dois logos, com naturezas diferentes:
//
//   fornecedor — a ALLPRA. É sempre o mesmo, seja quem for o cliente, por isso
//                vive no repo (src/ui/) e chega a todas as instalações pelo
//                git pull. Não é configurável de propósito.
//   cliente    — varia por instalação. Vive em branding/, fora do repo, como o
//                .env. Sem ficheiro, não aparece.
//
// É esta divisão que permite um binário único quando isto for empacotado: o
// que muda por cliente são ficheiros ao lado, não o executável.
const EXTENSOES = ['.png', '.svg', '.jpg', '.jpeg', '.webp'];

function primeiroQueExiste(dir, base, urlBase, sistema) {
    for (const ext of EXTENSOES) {
        try {
            if (sistema.existsSync(path.join(dir, base + ext))) return `${urlBase}/${base}${ext}`;
        } catch {
            // Pasta inexistente ou sem permissões: o branding é decoração e
            // nunca pode impedir a contabilista de descarregar os recibos.
            return null;
        }
    }
    return null;
}

function encontrarLogos({ dirFornecedor, dirCliente }, sistema = fs) {
    return {
        fornecedor: primeiroQueExiste(dirFornecedor, 'logo-fornecedor', '', sistema),
        cliente: primeiroQueExiste(dirCliente, 'logo-cliente', '/branding', sistema),
    };
}

module.exports = { encontrarLogos, EXTENSOES };
