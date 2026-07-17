'use strict';
const path = require('path');
const { TIPOS } = require('../moloni/documents');

function sanitizar(nome) {
    return String(nome).replace(/[/\\?%*:|"<>]/g, '-').trim();
}

// As datas do Moloni vêm em ISO com fuso: "2026-07-16T00:00:00+0100".
// Fatiar a string, em vez de usar new Date(), não é preguiça — é o que
// mantém o documento no mês que a contabilista vê no portal. Meia-noite de
// 1 de julho em Lisboa é ainda 30 de junho em UTC.
function bucketAnoMes(data) {
    return String(data).slice(0, 7);
}

function nomeFicheiro(doc, tipo) {
    // Verificado contra a API real (Task 6): o document_type devolvido pelo
    // getAll é { document_type_id, saft_code } — não traz `name`. O label do
    // TIPOS é a fonte de verdade, não um fallback.
    const etiqueta = TIPOS[tipo]?.label || 'Documento';
    const entidade = doc.entity_name || doc.entity_vat || doc.entity_number || 'sem-entidade';
    return sanitizar(`${etiqueta} ${doc.number} - ${entidade}.pdf`);
}

// Cada documento vai para a pasta do seu próprio mês — não do intervalo
// pedido. Assim um intervalo que atravessa meses arruma-se sozinho.
//
// A ordem tipo/data é escolhida por cada cliente na tab de Configuração — o
// primeiro cliente (ALLPRA) procura mais por tipo do que por mês; outro pode
// preferir o oposto. 'tipo-data' é o default: sem escolha explícita, uma
// instalação existente não pode mudar de comportamento sozinha.
function caminhoDestino(baseDir, doc, tipo, estrutura = 'tipo-data') {
    const pasta = TIPOS[tipo]?.pasta || 'Documentos';
    const mes = bucketAnoMes(doc.date);
    const partes = estrutura === 'data-tipo' ? [mes, pasta] : [pasta, mes];
    return path.join(baseDir, ...partes, nomeFicheiro(doc, tipo));
}

module.exports = { sanitizar, bucketAnoMes, nomeFicheiro, caminhoDestino };
