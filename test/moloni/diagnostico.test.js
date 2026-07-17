'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { testarLigacao } = require('../../src/moloni/diagnostico');

const TIPOS_FALSOS = {
    recibos: { endpoint: 'receipts/getAll', label: 'Recibo' },
    faturas: { endpoint: 'invoices/getAll', label: 'Fatura' },
};

function doc(id, status = 1) {
    return { document_id: id, number: 1000 + id, status };
}

test('auth falha primeiro e sozinha — não tenta os tipos', async () => {
    const auth = { getToken: async () => { throw new Error('Credenciais Moloni inválidas: ...'); } };
    const client = { post: async () => { throw new Error('não devia ser chamado'); } };
    const pdf = { obterBytes: async () => { throw new Error('não devia ser chamado'); } };

    const r = await testarLigacao({ auth, client, pdf, tipos: TIPOS_FALSOS, ano: 2026 });

    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.resultados.length, 1);
    assert.strictEqual(r.resultados[0].tipo, 'auth');
    assert.strictEqual(r.resultados[0].ok, false);
    assert.match(r.resultados[0].mensagem, /Credenciais Moloni inválidas/);
});

test('com auth ok, testa cada tipo e descarrega um PDF de amostra', async () => {
    const auth = { getToken: async () => 'tok' };
    const client = { post: async (endpoint) =>
        endpoint === 'receipts/getAll' ? [doc(1)] : [doc(2)] };
    const pdf = { obterBytes: async () => Buffer.from('%PDF-x') };

    const r = await testarLigacao({ auth, client, pdf, tipos: TIPOS_FALSOS, ano: 2026 });

    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.resultados.length, 3); // auth + 2 tipos
    const recibos = r.resultados.find(x => x.tipo === 'recibos');
    assert.strictEqual(recibos.ok, true);
    assert.match(recibos.mensagem, /1001/);
});

test('um tipo sem documentos emitidos dá aviso, não falha', async () => {
    const auth = { getToken: async () => 'tok' };
    const client = { post: async () => [doc(1, 0)] }; // só rascunhos
    const pdf = { obterBytes: async () => { throw new Error('não devia ser chamado'); } };

    const r = await testarLigacao({ auth, client, pdf, tipos: TIPOS_FALSOS, ano: 2026 });

    assert.strictEqual(r.ok, true); // aviso não é falha
    const recibos = r.resultados.find(x => x.tipo === 'recibos');
    assert.strictEqual(recibos.ok, null); // nem sucesso nem falha: aviso
});

test('resposta inesperada da API num tipo falha só esse tipo', async () => {
    const auth = { getToken: async () => 'tok' };
    const client = { post: async (endpoint) =>
        endpoint === 'receipts/getAll' ? { erro: 'algo' } : [doc(2)] };
    const pdf = { obterBytes: async () => Buffer.from('%PDF-x') };

    const r = await testarLigacao({ auth, client, pdf, tipos: TIPOS_FALSOS, ano: 2026 });

    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.resultados.find(x => x.tipo === 'recibos').ok, false);
    assert.strictEqual(r.resultados.find(x => x.tipo === 'faturas').ok, true);
});

test('falha ao descarregar o PDF de amostra falha esse tipo, sem parar os outros', async () => {
    const auth = { getToken: async () => 'tok' };
    const client = { post: async () => [doc(1)] };
    const pdf = { obterBytes: async () => { throw new Error('sem acesso a este tipo'); } };

    const r = await testarLigacao({ auth, client, pdf, tipos: TIPOS_FALSOS, ano: 2026 });

    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.resultados.length, 3);
    assert.ok(r.resultados.every(x => x.tipo === 'auth' || x.ok === false));
});
