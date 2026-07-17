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

test('caminhoDestino separa por tipo e depois pelo ano-mês do próprio documento', () => {
    assert.strictEqual(
        caminhoDestino('/saida', doc, 'faturas'),
        path.join('/saida', 'Faturas', '2026-06', 'Fatura 2652 - ACME Lda..pdf')
    );
});

// Descarregar recibos e faturas do mesmo mês despejava tudo na mesma pasta.
// Cada tipo tem de ficar no seu ramo, mesmo partilhando o mês.
test('tipos diferentes do mesmo mês não se misturam', () => {
    const recibo = { ...doc, document_type: { document_type_id: 2, saft_code: 'RE' } };
    const cRecibo = caminhoDestino('/saida', recibo, 'recibos');
    const cFatura = caminhoDestino('/saida', doc, 'faturas');

    assert.ok(cRecibo.includes(path.join('Recibos', '2026-06')));
    assert.ok(cFatura.includes(path.join('Faturas', '2026-06')));
    assert.notStrictEqual(path.dirname(cRecibo), path.dirname(cFatura));
});

test('os três tipos têm pasta própria', () => {
    const caminhos = ['recibos', 'faturas', 'faturasRecibo']
        .map(t => caminhoDestino('/saida', doc, t));
    const pastas = caminhos.map(c => c.split(path.sep)[2]);
    assert.deepStrictEqual(pastas, ['Recibos', 'Faturas', 'Faturas-Recibo']);
});

// Escolha do cliente, feita na tab de Configuração: 'tipo-data' (default) ou
// 'data-tipo'. Sem o 4º argumento mantém-se 'tipo-data' — não pode partir
// nenhuma instalação já a funcionar.
test('estrutura por defeito continua tipo depois data', () => {
    assert.strictEqual(
        caminhoDestino('/saida', doc, 'faturas'),
        caminhoDestino('/saida', doc, 'faturas', 'tipo-data')
    );
});

test('estrutura data-tipo inverte a ordem', () => {
    assert.strictEqual(
        caminhoDestino('/saida', doc, 'faturas', 'data-tipo'),
        path.join('/saida', '2026-06', 'Faturas', 'Fatura 2652 - ACME Lda..pdf')
    );
});

test('um valor de estrutura desconhecido cai no default tipo-data', () => {
    assert.strictEqual(
        caminhoDestino('/saida', doc, 'faturas', 'isto-nao-existe'),
        caminhoDestino('/saida', doc, 'faturas', 'tipo-data')
    );
});
