'use strict';
const { test, afterEach } = require('node:test');
const assert = require('node:assert');
const nock = require('nock');
const http = require('node:http');
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

// A sessão (cookie) devolvida na preview tem de ser reenviada no pedido
// final — é isso que faz o Moloni servir o PDF em vez da preview outra vez.
// Se o jar deixar de ser partilhado entre os dois pedidos, este teste falha.
//
// NOTA: este teste usa um servidor HTTP real em 127.0.0.1 em vez do nock.
// O nock 14 (via @mswjs/interceptors) intercepta o pedido antes de chegar
// ao http(s).Agent — e é exatamente o Agent que o axios-cookiejar-support
// substitui para ler o Set-Cookie e escrever o Cookie. Com o nock ativo
// (mesmo sem mockar este host), o jar nunca é tocado (nem lido nem
// escrito), pelo que um teste baseado em `.matchHeader('Cookie', ...)`
// "passaria a falhar sempre", mesmo com o código original correto — não
// distingue jar partilhado de jar quebrado. Por isso desligamos o nock
// (nock.restore()) só durante este teste, para o pedido passar pelo
// Agent verdadeiro, e voltamos a ligá-lo (nock.activate()) no fim para
// não afetar os restantes testes do ficheiro.
test('envia no pedido final o cookie de sessão recebido na preview', async () => {
    let cookieRecebidoNoPedidoFinal;

    const servidor = http.createServer((req, res) => {
        if (req.url.startsWith('/downloads/index.php')) {
            cookieRecebidoNoPedidoFinal = req.headers.cookie;
            res.writeHead(200, { 'content-type': 'application/pdf' });
            res.end(Buffer.from('%PDF-1.4 conteúdo'));
            return;
        }
        res.writeHead(200, { 'set-cookie': 'PHPSESSID=abc123; Path=/', 'content-type': 'text/html' });
        res.end(HTML_PREVIEW);
    });

    await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
    nock.restore();
    try {
        const { port } = servidor.address();
        const urlPreviewLocal = `http://127.0.0.1:${port}/downloads/?h=jwt-abc`;
        const client = clientFalso({ url: urlPreviewLocal });

        const bytes = await criarPdf(client).obterBytes(123);

        assert.ok(Buffer.isBuffer(bytes));
        assert.strictEqual(bytes.subarray(0, 4).toString(), '%PDF');
        assert.ok(
            cookieRecebidoNoPedidoFinal && cookieRecebidoNoPedidoFinal.includes('PHPSESSID=abc123'),
            `o cookie da preview não chegou ao pedido final (recebido: ${cookieRecebidoNoPedidoFinal})`
        );
    } finally {
        nock.activate();
        await new Promise((resolve) => servidor.close(resolve));
    }
});
