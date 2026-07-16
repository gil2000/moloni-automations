'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { criarDocuments, TIPOS, QTY } = require('../../src/moloni/documents');

// Cliente falso que devolve páginas pré-programadas e regista as chamadas.
function clientFalso(paginas) {
    const chamadas = [];
    return {
        chamadas,
        post: async (caminho, body) => {
            chamadas.push({ caminho, body });
            return paginas.shift() ?? [];
        },
    };
}

const paginaCheia = () => Array.from({ length: QTY }, (_, i) => ({ document_id: i }));

test('os três tipos apontam para os endpoints certos', () => {
    assert.strictEqual(TIPOS.recibos.endpoint, 'receipts/getAll');
    assert.strictEqual(TIPOS.faturas.endpoint, 'invoices/getAll');
    assert.strictEqual(TIPOS.faturasRecibo.endpoint, 'invoiceReceipts/getAll');
});

test('para na página incompleta e avança o offset', async () => {
    const client = clientFalso([paginaCheia(), [{ document_id: 99 }]]);
    const docs = await criarDocuments(client).listarPorAno('recibos', 2026);

    assert.strictEqual(docs.length, QTY + 1);
    assert.strictEqual(client.chamadas.length, 2);
    assert.deepStrictEqual(client.chamadas[0].body, { year: 2026, qty: QTY, offset: 0 });
    assert.deepStrictEqual(client.chamadas[1].body, { year: 2026, qty: QTY, offset: QTY });
});

test('para na página vazia', async () => {
    const client = clientFalso([paginaCheia(), []]);
    const docs = await criarDocuments(client).listarPorAno('recibos', 2026);
    assert.strictEqual(docs.length, QTY);
});

test('trata resposta não-array como fim da paginação', async () => {
    const client = clientFalso([{ errors: 'qualquer coisa' }]);
    const docs = await criarDocuments(client).listarPorAno('recibos', 2026);
    assert.deepStrictEqual(docs, []);
});

test('reporta progresso por página', async () => {
    const client = clientFalso([paginaCheia(), [{ document_id: 99 }]]);
    const eventos = [];
    await criarDocuments(client).listarPorAno('faturas', 2025, e => eventos.push(e));

    assert.deepStrictEqual(eventos, [
        { tipo: 'faturas', ano: 2025, verificados: QTY },
        { tipo: 'faturas', ano: 2025, verificados: QTY + 1 },
    ]);
});

test('rejeita tipo desconhecido', async () => {
    const client = clientFalso([]);
    await assert.rejects(
        () => criarDocuments(client).listarPorAno('notasCredito', 2026),
        /Tipo de documento desconhecido/
    );
});
