'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { sanitizar, bucketAnoMes, nomeFicheiro, caminhoDestino } = require('../../src/download/ficheiros');

// Forma REAL de um documento devolvido pelo getAll, observada contra a API em
// 2026-07-16 (ver Task 6). Não inventar formatos aqui: `date` vem em ISO com
// fuso, `number` é numérico, e `document_type` NÃO tem `name` — só
// `{ document_type_id, saft_code }`.
const doc = {
    document_id: 1,
    number: 2652,
    date: '2026-06-15T00:00:00+0100',
    entity_name: 'ACME Lda.',
    entity_vat: '500123456',
    entity_number: '500123456',
    document_type: { document_type_id: 1, saft_code: 'FT' },
    status: 1,
};

test('sanitizar troca caracteres inválidos de nome de ficheiro', () => {
    assert.strictEqual(sanitizar('a/b\\c?d%e*f:g|h"i<j>k'), 'a-b-c-d-e-f-g-h-i-j-k');
});

test('sanitizar tira espaços das pontas', () => {
    assert.strictEqual(sanitizar('  nome  '), 'nome');
});

test('bucketAnoMes extrai ano-mês do formato real do Moloni', () => {
    assert.strictEqual(bucketAnoMes('2026-06-15T00:00:00+0100'), '2026-06');
});

// Este teste guarda a razão de não usarmos objetos Date em lado nenhum.
test('bucketAnoMes não é enganado pelo fuso horário do Moloni', () => {
    // "2026-07-01T00:00:00+0100" é ainda 30 de junho em UTC. Fatiar a string
    // dá julho — o mês que a contabilista vê no portal. new Date(...) daria
    // junho e arrumava o documento na pasta errada.
    assert.strictEqual(bucketAnoMes('2026-07-01T00:00:00+0100'), '2026-07');
});

test('nomeFicheiro usa o label do tipo', () => {
    assert.strictEqual(nomeFicheiro(doc, 'faturas'), 'Fatura 2652 - ACME Lda..pdf');
});

test('nomeFicheiro cai no NIF quando não há nome de entidade', () => {
    const semNome = { ...doc, entity_name: '' };
    assert.strictEqual(nomeFicheiro(semNome, 'faturas'), 'Fatura 2652 - 500123456.pdf');
});

test('caminhoDestino arruma na pasta do ano-mês do próprio documento', () => {
    assert.strictEqual(
        caminhoDestino('/saida', doc, 'faturas'),
        path.join('/saida', '2026-06', 'Fatura 2652 - ACME Lda..pdf')
    );
});
