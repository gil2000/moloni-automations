'use strict';
const { test, afterEach } = require('node:test');
const assert = require('node:assert');
const nock = require('nock');
const { criarPdf } = require('../../src/moloni/pdf');

function clientFalso(resposta) {
    const chamadas = [];
    return { chamadas, post: async (caminho, body) => { chamadas.push({ caminho, body }); return resposta; } };
}

const URL_PREVIEW = 'https://www.moloni.pt/downloads/?h=jwt-abc';
const HTML_PREVIEW = `
  <html><body>
    <div id="downloadBtn"><a href="index.php?action=getDownload&h=abc&d=1&e=&i=1">Descarregar</a></div>
  </body></html>`;

afterEach(() => nock.cleanAll());

// A pegadinha nº1. Se este teste desaparecer, o bug volta.
test('NUNCA envia signed no getPDFLink', async () => {
    const client = clientFalso({ url: URL_PREVIEW });
    nock('https://www.moloni.pt').get('/downloads/').query(true).reply(200, HTML_PREVIEW);
    nock('https://www.moloni.pt').get('/downloads/index.php').query(true)
        .reply(200, Buffer.from('%PDF-1.4 conteúdo'), { 'content-type': 'application/pdf' });

    await criarPdf(client).obterBytes(123);

    assert.strictEqual(client.chamadas[0].caminho, 'documents/getPDFLink');
    assert.deepStrictEqual(client.chamadas[0].body, { document_id: 123 });
    assert.ok(!('signed' in client.chamadas[0].body), 'signed despoleta o loop de assinatura');
});

// A pegadinha nº2.
test('segue o downloadBtn e devolve os bytes do PDF', async () => {
    const client = clientFalso({ url: URL_PREVIEW });
    nock('https://www.moloni.pt').get('/downloads/').query(true).reply(200, HTML_PREVIEW);
    nock('https://www.moloni.pt')
        .get('/downloads/index.php')
        .query({ action: 'getDownload', h: 'abc', d: '1', e: '', i: '1' })
        .reply(200, Buffer.from('%PDF-1.4 conteúdo'), { 'content-type': 'application/pdf' });

    const bytes = await criarPdf(client).obterBytes(123);
    assert.ok(Buffer.isBuffer(bytes));
    assert.strictEqual(bytes.subarray(0, 4).toString(), '%PDF');
});

test('rejeita resposta final que não seja PDF', async () => {
    const client = clientFalso({ url: URL_PREVIEW });
    nock('https://www.moloni.pt').get('/downloads/').query(true).reply(200, HTML_PREVIEW);
    nock('https://www.moloni.pt').get('/downloads/index.php').query(true)
        .reply(200, Buffer.from('<html>a preparar download</html>'));

    await assert.rejects(() => criarPdf(client).obterBytes(123), /não é um PDF válido/);
});

test('erro claro quando não há downloadBtn na página', async () => {
    const client = clientFalso({ url: URL_PREVIEW });
    nock('https://www.moloni.pt').get('/downloads/').query(true).reply(200, '<html>vazio</html>');

    await assert.rejects(() => criarPdf(client).obterBytes(123), /Botão de download não encontrado/);
});

test('erro claro quando o getPDFLink não devolve url', async () => {
    const client = clientFalso({});
    await assert.rejects(() => criarPdf(client).obterBytes(123), /Sem URL de PDF/);
});
