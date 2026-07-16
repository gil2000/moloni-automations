# Moloni Downloader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App web local que descarrega em massa PDFs de documentos Moloni (recibos, faturas, faturas-recibo) para um intervalo livre de datas, utilizável por quem não abre um terminal.

**Architecture:** Node + Express a servir uma página em `localhost`. Três camadas com fronteiras estritas: `src/moloni/` fala com a API e devolve dados/bytes (não sabe de ficheiros nem de HTTP-UI); `src/server/` arranca jobs e transmite progresso por SSE (não sabe nada de Moloni); `src/download/job.js` é o único que conhece os dois lados. Isto permite trocar o `server/` por um botão no painel admin do IziGO sem reescrever a lógica.

**Tech Stack:** Node 24 (CommonJS), Express 5, axios, axios-cookiejar-support + tough-cookie, dotenv. Testes com `node:test` (embutido) + `nock` para mockar HTTP.

**Spec:** `docs/superpowers/specs/2026-07-16-moloni-downloader-design.md`

## Global Constraints

- **Node 24, CommonJS** (`require`, não `import`) — segue o estilo de `izigo-backend`.
- **Português** em nomes de funções, mensagens de erro e UI. É o idioma do código existente e da utilizadora.
- **NUNCA enviar `signed: 1`** ao `documents/getPDFLink`. Ver Task 5.
- **Versões de dependências** iguais às de `izigo-backend` para consistência: `axios@^1.13.5`, `axios-cookiejar-support@^6.0.5`, `tough-cookie@^6.0.0`, `dotenv@^17.2.4`, `express@^5.2.1`.
- **Não usar `qs`** — usar `new URLSearchParams()` (built-in). O script original usava `qs`, mas era dependência fantasma (vinha de boleia do express).
- **O script de testes é exatamente `node --test`. Não lhe tocar.** Verificado empiricamente em 2026-07-16: `node --test test/` rebenta com `MODULE_NOT_FOUND` (o Node trata o caminho como módulo), e `node --test test/**/*.test.js` **sem aspas** larga em silêncio os testes na raiz de `test/` — o `npm` corre em `sh`, que não tem `globstar`, e expande o `**` para um só nível. O `node --test` sem argumentos descobre tudo recursivamente e não envolve o shell. Se mexeres nisto, prova com testes em `test/x.test.js` **e** `test/sub/y.test.js` ao mesmo tempo.
- **Nunca commitar** `.env` nem `downloads/` — já cobertos pelo `.gitignore`.
- **Datas** tratadas como strings `YYYY-MM-DD`, comparadas lexicograficamente. Sem objetos `Date`, sem aritmética de fusos.
- **Intervalos inclusivos** nas duas pontas.

---

### Task 1: Scaffolding + configuração

Arranca o projeto e o módulo que valida o `.env`. O `.env` real já existe na raiz (criado no onboarding); o `.env.example` também.

**Files:**
- Create: `package.json`
- Create: `src/config.js`
- Test: `test/config.test.js`

**Interfaces:**
- Consumes: nada (primeira task)
- Produces: `carregarConfig(env?) → { clientId, clientSecret, username, password, companyId: number, downloadDir: string }`. Lança `Error` se faltar variável obrigatória ou se `MOLONI_COMPANY_ID` não for inteiro positivo. Todas as tasks seguintes recebem este objeto como `config`.

- [ ] **Step 1: Criar o package.json**

```json
{
  "name": "moloni-automations",
  "version": "1.0.0",
  "private": true,
  "description": "Download em massa de documentos Moloni",
  "main": "src/server/index.js",
  "scripts": {
    "start": "node src/server/index.js",
    "test": "node --test"
  },
  "dependencies": {
    "axios": "^1.13.5",
    "axios-cookiejar-support": "^6.0.5",
    "dotenv": "^17.2.4",
    "express": "^5.2.1",
    "tough-cookie": "^6.0.0"
  },
  "devDependencies": {
    "nock": "^14.0.1"
  }
}
```

- [ ] **Step 2: Instalar dependências**

Run: `npm install`
Expected: cria `node_modules/` e `package-lock.json`, sem erros.

- [ ] **Step 3: Escrever o teste que falha**

Ficheiro `test/config.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { carregarConfig } = require('../src/config');

const envValido = {
  MOLONI_CLIENT_ID: 'id',
  MOLONI_CLIENT_SECRET: 'secret',
  MOLONI_USERNAME: 'user',
  MOLONI_PASSWORD: 'pass',
  MOLONI_COMPANY_ID: '331227',
};

test('devolve config normalizada com env válido', () => {
  const config = carregarConfig(envValido);
  assert.strictEqual(config.clientId, 'id');
  assert.strictEqual(config.companyId, 331227);
  assert.strictEqual(config.downloadDir, './downloads');
});

test('usa DOWNLOAD_DIR quando definido', () => {
  const config = carregarConfig({ ...envValido, DOWNLOAD_DIR: '/tmp/x' });
  assert.strictEqual(config.downloadDir, '/tmp/x');
});

test('diz quais as variáveis em falta', () => {
  const { MOLONI_PASSWORD, MOLONI_USERNAME, ...incompleto } = envValido;
  assert.throws(
    () => carregarConfig(incompleto),
    /MOLONI_USERNAME.*MOLONI_PASSWORD|MOLONI_PASSWORD.*MOLONI_USERNAME/s
  );
});

test('rejeita MOLONI_COMPANY_ID não numérico', () => {
  assert.throws(
    () => carregarConfig({ ...envValido, MOLONI_COMPANY_ID: 'abc' }),
    /MOLONI_COMPANY_ID/
  );
});
```

- [ ] **Step 4: Correr o teste para confirmar que falha**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/config'`.

- [ ] **Step 5: Implementar o config.js**

Ficheiro `src/config.js`:

```js
'use strict';
require('dotenv').config();

const OBRIGATORIAS = [
    'MOLONI_CLIENT_ID',
    'MOLONI_CLIENT_SECRET',
    'MOLONI_USERNAME',
    'MOLONI_PASSWORD',
    'MOLONI_COMPANY_ID',
];

// Recebe o env por parâmetro para ser testável sem mexer no process.env global.
function carregarConfig(env = process.env) {
    const faltam = OBRIGATORIAS.filter(chave => !env[chave]);
    if (faltam.length > 0) {
        throw new Error(
            `Faltam variáveis no .env: ${faltam.join(', ')}. Ver .env.example.`
        );
    }

    const companyId = Number(env.MOLONI_COMPANY_ID);
    if (!Number.isInteger(companyId) || companyId <= 0) {
        throw new Error(
            `MOLONI_COMPANY_ID inválido: "${env.MOLONI_COMPANY_ID}" — deve ser um inteiro positivo.`
        );
    }

    return {
        clientId:     env.MOLONI_CLIENT_ID,
        clientSecret: env.MOLONI_CLIENT_SECRET,
        username:     env.MOLONI_USERNAME,
        password:     env.MOLONI_PASSWORD,
        companyId,
        downloadDir:  env.DOWNLOAD_DIR || './downloads',
    };
}

module.exports = { carregarConfig };
```

- [ ] **Step 6: Correr os testes**

Run: `npm test`
Expected: PASS — 4 testes.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/config.js test/config.test.js
git commit -m "Scaffolding e validação de configuração"
```

---

### Task 2: Autenticação Moloni

OAuth2 password grant com cache de token. **Atípico:** os parâmetros vão na query string, não no body — é assim que o Moloni funciona.

**Files:**
- Create: `src/moloni/auth.js`
- Test: `test/moloni/auth.test.js`

**Interfaces:**
- Consumes: `config` da Task 1.
- Produces: `criarAuth(config, { agora? }) → { getToken(): Promise<string> }` e a constante `BASE = 'https://api.moloni.pt/v1'`. O parâmetro `agora` (default `() => Date.now()`) existe para os testes controlarem o tempo.

- [ ] **Step 1: Escrever o teste que falha**

Ficheiro `test/moloni/auth.test.js`:

```js
'use strict';
const { test, afterEach } = require('node:test');
const assert = require('node:assert');
const nock = require('nock');
const { criarAuth, BASE } = require('../../src/moloni/auth');

const config = {
    clientId: 'id', clientSecret: 'secret',
    username: 'user', password: 'pass', companyId: 1,
};

afterEach(() => nock.cleanAll());

test('obtém token e envia credenciais na query string', async () => {
    const scope = nock('https://api.moloni.pt')
        .post('/v1/grant/')
        .query({
            grant_type: 'password',
            client_id: 'id',
            client_secret: 'secret',
            username: 'user',
            password: 'pass',
        })
        .reply(200, { access_token: 'tok-1', expires_in: 3600 });

    const auth = criarAuth(config);
    assert.strictEqual(await auth.getToken(), 'tok-1');
    scope.done();
});

test('reutiliza o token em cache sem novo pedido', async () => {
    nock('https://api.moloni.pt').post('/v1/grant/').query(true)
        .reply(200, { access_token: 'tok-1', expires_in: 3600 });

    const auth = criarAuth(config);
    await auth.getToken();
    // Se pedisse outra vez, o nock não teria interceptor e rebentava.
    assert.strictEqual(await auth.getToken(), 'tok-1');
});

test('pede token novo depois de expirar', async () => {
    nock('https://api.moloni.pt').post('/v1/grant/').query(true)
        .reply(200, { access_token: 'tok-1', expires_in: 3600 });
    nock('https://api.moloni.pt').post('/v1/grant/').query(true)
        .reply(200, { access_token: 'tok-2', expires_in: 3600 });

    let t = 0;
    const auth = criarAuth(config, { agora: () => t });
    assert.strictEqual(await auth.getToken(), 'tok-1');
    t = 3600 * 1000; // passou a validade
    assert.strictEqual(await auth.getToken(), 'tok-2');
});

test('lança erro quando a resposta não traz access_token', async () => {
    nock('https://api.moloni.pt').post('/v1/grant/').query(true)
        .reply(200, { error: 'invalid_grant' });

    const auth = criarAuth(config);
    await assert.rejects(() => auth.getToken(), /auth falhou/);
});

test('BASE aponta para a v1 da API', () => {
    assert.strictEqual(BASE, 'https://api.moloni.pt/v1');
});
```

- [ ] **Step 2: Correr o teste para confirmar que falha**

Run: `npm test`
Expected: FAIL — `Cannot find module '../../src/moloni/auth'`.

- [ ] **Step 3: Implementar o auth.js**

Ficheiro `src/moloni/auth.js`:

```js
'use strict';
const axios = require('axios');

const BASE = 'https://api.moloni.pt/v1';

// Atípico mas correto: o Moloni quer as credenciais na query string do
// /grant/, não no body.
function criarAuth(config, { agora = () => Date.now() } = {}) {
    let token = null;
    let expiraEm = 0;

    async function getToken() {
        if (token && agora() < expiraEm) return token;

        const { data } = await axios.post(`${BASE}/grant/`, null, {
            params: {
                grant_type:    'password',
                client_id:     config.clientId,
                client_secret: config.clientSecret,
                username:      config.username,
                password:      config.password,
            },
        });

        if (!data.access_token) {
            throw new Error('Moloni auth falhou: ' + JSON.stringify(data));
        }

        token = data.access_token;
        // Margem de 60s para não usar um token que expira a meio do pedido.
        expiraEm = agora() + ((data.expires_in || 3600) - 60) * 1000;
        return token;
    }

    return { getToken };
}

module.exports = { criarAuth, BASE };
```

- [ ] **Step 4: Correr os testes**

Run: `npm test`
Expected: PASS — 9 testes no total.

- [ ] **Step 5: Commit**

```bash
git add src/moloni/auth.js test/moloni/auth.test.js
git commit -m "Autenticação Moloni com cache de token"
```

---

### Task 3: Cliente HTTP Moloni

Wrapper que injeta `company_id`, o `access_token` na query e o form-encoding em todos os pedidos.

**Files:**
- Create: `src/moloni/client.js`
- Test: `test/moloni/client.test.js`

**Interfaces:**
- Consumes: `config` (Task 1), `auth` (Task 2).
- Produces: `criarClient(config, auth) → { post(caminho: string, body?: object): Promise<any> }`. O `caminho` é sem barras nas pontas (ex.: `'receipts/getAll'`). O `company_id` é injetado automaticamente.

- [ ] **Step 1: Escrever o teste que falha**

Ficheiro `test/moloni/client.test.js`:

```js
'use strict';
const { test, afterEach } = require('node:test');
const assert = require('node:assert');
const nock = require('nock');
const { criarClient } = require('../../src/moloni/client');

const config = { companyId: 331227 };
const authFalso = { getToken: async () => 'tok-1' };

afterEach(() => nock.cleanAll());

test('injeta company_id e access_token, com form-encoding', async () => {
    let bodyRecebido = null;
    const scope = nock('https://api.moloni.pt')
        .post('/v1/receipts/getAll/', body => { bodyRecebido = body; return true; })
        .query({ access_token: 'tok-1' })
        .matchHeader('Content-Type', 'application/x-www-form-urlencoded')
        .reply(200, [{ document_id: 1 }]);

    const client = criarClient(config, authFalso);
    const data = await client.post('receipts/getAll', { year: 2026, qty: 50 });

    assert.deepStrictEqual(data, [{ document_id: 1 }]);
    assert.strictEqual(bodyRecebido.company_id, '331227');
    assert.strictEqual(bodyRecebido.year, '2026');
    assert.strictEqual(bodyRecebido.qty, '50');
    scope.done();
});

test('funciona sem body', async () => {
    nock('https://api.moloni.pt')
        .post('/v1/companies/getAll/')
        .query(true)
        .reply(200, { ok: true });

    const client = criarClient(config, authFalso);
    assert.deepStrictEqual(await client.post('companies/getAll'), { ok: true });
});
```

- [ ] **Step 2: Correr o teste para confirmar que falha**

Run: `npm test`
Expected: FAIL — `Cannot find module '../../src/moloni/client'`.

- [ ] **Step 3: Implementar o client.js**

Ficheiro `src/moloni/client.js`:

```js
'use strict';
const axios = require('axios');
const { BASE } = require('./auth');

function criarClient(config, auth) {
    async function post(caminho, body = {}) {
        const token = await auth.getToken();

        const params = new URLSearchParams();
        params.append('company_id', String(config.companyId));
        for (const [chave, valor] of Object.entries(body)) {
            params.append(chave, String(valor));
        }

        const { data } = await axios.post(
            `${BASE}/${caminho}/?access_token=${token}`,
            params.toString(),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        return data;
    }

    return { post };
}

module.exports = { criarClient };
```

- [ ] **Step 4: Correr os testes**

Run: `npm test`
Expected: PASS — 11 testes.

- [ ] **Step 5: Commit**

```bash
git add src/moloni/client.js test/moloni/client.test.js
git commit -m "Cliente HTTP Moloni com company_id e token automáticos"
```

---

### Task 4: Listagem paginada de documentos

O `getAll` do Moloni **não tem filtro de intervalo de datas** — só `year`. Daí puxar o ano inteiro e filtrar depois (o filtro é da Task 8).

**Files:**
- Create: `src/moloni/documents.js`
- Test: `test/moloni/documents.test.js`

**Interfaces:**
- Consumes: `client` (Task 3).
- Produces:
  - `TIPOS` — objeto `{ recibos, faturas, faturasRecibo }`, cada um `{ endpoint, label }`.
  - `QTY = 50`.
  - `criarDocuments(client) → { listarPorAno(tipo: string, ano: number, aoProgredir?): Promise<object[]> }`. O `aoProgredir` recebe `{ tipo, ano, verificados: number }` após cada página.

- [ ] **Step 1: Escrever o teste que falha**

Ficheiro `test/moloni/documents.test.js`:

```js
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
```

- [ ] **Step 2: Correr o teste para confirmar que falha**

Run: `npm test`
Expected: FAIL — `Cannot find module '../../src/moloni/documents'`.

- [ ] **Step 3: Implementar o documents.js**

Ficheiro `src/moloni/documents.js`:

```js
'use strict';

// Os três tipos partilham exatamente o mesmo padrão de paginação e de
// getPDFLink — por isso são configuração, não código.
// O `label` é só fallback: o nome do ficheiro usa o document_type.name que a
// API devolve por documento, que pode variar por empresa. Ver ficheiros.js.
const TIPOS = {
    recibos:       { endpoint: 'receipts/getAll',        label: 'Recibo' },
    faturas:       { endpoint: 'invoices/getAll',        label: 'Fatura' },
    faturasRecibo: { endpoint: 'invoiceReceipts/getAll', label: 'Fatura-Recibo' },
};

const QTY = 50; // máximo aceite pelo Moloni

function criarDocuments(client) {
    // O Moloni não tem filtro de intervalo de datas — só `year`. Puxa-se o ano
    // inteiro; o filtro do intervalo é feito pelo job.
    async function listarPorAno(tipo, ano, aoProgredir = () => {}) {
        const definicao = TIPOS[tipo];
        if (!definicao) throw new Error(`Tipo de documento desconhecido: ${tipo}`);

        const todos = [];
        let offset = 0;

        while (true) {
            const pagina = await client.post(definicao.endpoint, { year: ano, qty: QTY, offset });
            if (!Array.isArray(pagina) || pagina.length === 0) break;

            todos.push(...pagina);
            aoProgredir({ tipo, ano, verificados: todos.length });

            if (pagina.length < QTY) break; // última página
            offset += QTY;
        }

        return todos;
    }

    return { listarPorAno };
}

module.exports = { criarDocuments, TIPOS, QTY };
```

- [ ] **Step 4: Correr os testes**

Run: `npm test`
Expected: PASS — 17 testes.

- [ ] **Step 5: Commit**

```bash
git add src/moloni/documents.js test/moloni/documents.test.js
git commit -m "Listagem paginada de documentos por tipo e ano"
```

---

### Task 5: Download do PDF (as duas pegadinhas)

**O módulo mais importante do projeto.** Aqui vivem as duas pegadinhas descobertas por tentativa e erro no script original. Uma regressão aqui é silenciosa e cara: o download "funciona" mas grava HTML em vez de PDF, e só se descobre quando a contabilista abrir o ficheiro.

1. **NÃO enviar `signed: 1`.** Despoleta no Moloni um fluxo de assinatura assíncrono; a página fica presa num loop de "a preparar download" que nunca resolve. Sem `signed`, o PDF vem logo e já vem certificado pela Autoridade Tributária.
2. **A `url` devolvida não é o PDF** — é uma página HTML de preview. É preciso seguir o `id="downloadBtn"` com as mesmas cookies.

**Files:**
- Create: `src/moloni/pdf.js`
- Test: `test/moloni/pdf.test.js`

**Interfaces:**
- Consumes: `client` (Task 3).
- Produces: `criarPdf(client) → { obterBytes(documentId: number): Promise<Buffer> }`. Lança `Error` se não houver URL, se não encontrar o `downloadBtn`, ou se os bytes finais não começarem por `%PDF`.

- [ ] **Step 1: Escrever o teste que falha**

Ficheiro `test/moloni/pdf.test.js`:

```js
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
```

- [ ] **Step 2: Correr o teste para confirmar que falha**

Run: `npm test`
Expected: FAIL — `Cannot find module '../../src/moloni/pdf'`.

- [ ] **Step 3: Implementar o pdf.js**

Ficheiro `src/moloni/pdf.js`:

```js
'use strict';
const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

function criarPdf(client) {
    // Cookie jar partilhado: a página de preview abre a sessão que o pedido
    // final precisa para servir o PDF.
    const jar = new CookieJar();
    const web = wrapper(axios.create({ jar, withCredentials: true }));

    async function obterBytes(documentId) {
        // PEGADINHA 1: não passar signed:1 aqui. Despoleta um fluxo de
        // assinatura digital assíncrono que nunca resolve por HTTP simples —
        // a página reemite-se em loop com um token novo a cada pedido. Sem
        // signed, o PDF vem já certificado pela AT, com a mesma validade legal
        // do que se descarrega à mão no portal.
        const { url } = await client.post('documents/getPDFLink', { document_id: documentId });
        if (!url) throw new Error('Sem URL de PDF devolvida');

        // PEGADINHA 2: a url não é o PDF — é uma página HTML de preview.
        const preview = await web.get(url);
        const match = String(preview.data).match(/id="downloadBtn">\s*<a href="([^"]+)"/);
        if (!match) throw new Error('Botão de download não encontrado na página de preview');

        const urlFinal = new URL(match[1], url).toString();
        const resposta = await web.get(urlFinal, { responseType: 'arraybuffer' });
        const bytes = Buffer.from(resposta.data);

        // Última linha de defesa: sem isto, gravava-se HTML com extensão .pdf.
        if (bytes.subarray(0, 4).toString() !== '%PDF') {
            throw new Error('Resposta final não é um PDF válido');
        }

        return bytes;
    }

    return { obterBytes };
}

module.exports = { criarPdf };
```

- [ ] **Step 4: Correr os testes**

Run: `npm test`
Expected: PASS — 22 testes.

- [ ] **Step 5: Commit**

```bash
git add src/moloni/pdf.js test/moloni/pdf.test.js
git commit -m "Download de PDF: sem signed, seguindo o downloadBtn"
```

---

### Task 6: Validação contra a API real (spike)

**Esta task não escreve código de produção — valida a maior suposição do desenho antes de se construir por cima dela.**

Sabemos que o `getPDFLink` funciona para **recibos** (935 provados). Para **faturas** e **faturas-recibo** estamos a assumir que é igual. A cliente só pediu recibos, portanto se um destes falhar **corta-se e segue-se** — mas é preciso saber agora, não depois da UI construída.

Requer o `.env` real preenchido na raiz.

**Files:**
- Create: `scripts/validar-tipos.js`

**Interfaces:**
- Consumes: `carregarConfig` (T1), `criarAuth` (T2), `criarClient` (T3), `criarDocuments` + `TIPOS` (T4), `criarPdf` (T5).
- Produces: nada consumido por tasks seguintes. É uma ferramenta de diagnóstico que fica no repo.

- [ ] **Step 1: Escrever o script de validação**

Ficheiro `scripts/validar-tipos.js`:

```js
'use strict';
// Diagnóstico: confirma que os 3 tipos de documento listam e descarregam.
// Uso: node scripts/validar-tipos.js [ano]
const { carregarConfig } = require('../src/config');
const { criarAuth } = require('../src/moloni/auth');
const { criarClient } = require('../src/moloni/client');
const { criarDocuments, TIPOS } = require('../src/moloni/documents');
const { criarPdf } = require('../src/moloni/pdf');

(async () => {
    const ano = Number(process.argv[2]) || new Date().getFullYear();
    const config = carregarConfig();
    const client = criarClient(config, criarAuth(config));
    const documents = criarDocuments(client);
    const pdf = criarPdf(client);

    for (const tipo of Object.keys(TIPOS)) {
        try {
            const docs = await documents.listarPorAno(tipo, ano);
            const emitidos = docs.filter(d => d.status !== 0);
            if (emitidos.length === 0) {
                console.log(`AVISO  ${tipo}: 0 documentos emitidos em ${ano} — nada para validar`);
                continue;
            }
            const doc = emitidos[0];
            const bytes = await pdf.obterBytes(doc.document_id);
            console.log(
                `OK     ${tipo}: ${docs.length} docs em ${ano}; ` +
                `PDF de "${doc.document_type?.name} ${doc.number}" = ${bytes.length} bytes`
            );
        } catch (err) {
            console.log(`FALHOU ${tipo}: ${err.message}`);
        }
    }
})().catch(err => {
    console.error('Erro fatal:', err.message);
    process.exit(1);
});
```

- [ ] **Step 2: Correr contra a API real**

Run: `node scripts/validar-tipos.js 2026`
Expected: uma linha por tipo. `OK recibos` é **obrigatório** — se falhar, há uma regressão nas Tasks 2-5 e não se avança.

- [ ] **Step 3: Registar o resultado no spec**

Acrescentar ao fim da secção "Riscos" de `docs/superpowers/specs/2026-07-16-moloni-downloader-design.md` uma linha com o que se observou, por exemplo:

```markdown
**Validado em 2026-07-16** (`scripts/validar-tipos.js`): recibos OK, faturas OK,
faturas-recibo OK. A suposição do getPDFLink confirma-se para os três tipos.
```

Se algum tipo falhar: registar o erro observado, **remover esse tipo de `TIPOS` em `src/moloni/documents.js`** (e o teste correspondente na Task 4), e anotar no spec que ficou fora de âmbito e porquê. Não tentar arranjar — não é o que a cliente pediu.

- [ ] **Step 4: Commit**

```bash
git add scripts/validar-tipos.js docs/superpowers/specs/
git commit -m "Valida os 3 tipos de documento contra a API real"
```

---

### Task 7: Nomes e organização de ficheiros

**Files:**
- Create: `src/download/ficheiros.js`
- Test: `test/download/ficheiros.test.js`

**Interfaces:**
- Consumes: `TIPOS` (Task 4).
- Produces:
  - `sanitizar(nome: string): string`
  - `bucketAnoMes(data: string): string` — `'2026-06-15 00:00:00'` → `'2026-06'`
  - `nomeFicheiro(doc: object, tipo: string): string`
  - `caminhoDestino(baseDir: string, doc: object, tipo: string): string`

- [ ] **Step 1: Escrever o teste que falha**

Ficheiro `test/download/ficheiros.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { sanitizar, bucketAnoMes, nomeFicheiro, caminhoDestino } = require('../../src/download/ficheiros');

const doc = {
    document_id: 1,
    number: 'FT 2026/123',
    date: '2026-06-15 00:00:00',
    entity_name: 'ACME Lda.',
    document_type: { name: 'Fatura' },
};

test('sanitizar troca caracteres inválidos de nome de ficheiro', () => {
    assert.strictEqual(sanitizar('a/b\\c?d%e*f:g|h"i<j>k'), 'a-b-c-d-e-f-g-h-i-j-k');
});

test('sanitizar tira espaços das pontas', () => {
    assert.strictEqual(sanitizar('  nome  '), 'nome');
});

test('bucketAnoMes extrai ano-mês da data do Moloni', () => {
    assert.strictEqual(bucketAnoMes('2026-06-15 00:00:00'), '2026-06');
    assert.strictEqual(bucketAnoMes('2026-06-15'), '2026-06');
});

test('nomeFicheiro usa o document_type.name da API', () => {
    assert.strictEqual(nomeFicheiro(doc, 'faturas'), 'Fatura FT 2026-123 - ACME Lda..pdf');
});

test('nomeFicheiro cai no label do tipo se a API não der document_type', () => {
    const semTipo = { ...doc, document_type: undefined };
    assert.strictEqual(nomeFicheiro(semTipo, 'faturas'), 'Fatura FT 2026-123 - ACME Lda..pdf');
});

test('nomeFicheiro cai no NIF quando não há nome de entidade', () => {
    const semNome = { ...doc, entity_name: '' , entity_vat: '500123456' };
    assert.strictEqual(nomeFicheiro(semNome, 'faturas'), 'Fatura FT 2026-123 - 500123456.pdf');
});

test('caminhoDestino arruma na pasta do ano-mês do próprio documento', () => {
    assert.strictEqual(
        caminhoDestino('/saida', doc, 'faturas'),
        path.join('/saida', '2026-06', 'Fatura FT 2026-123 - ACME Lda..pdf')
    );
});
```

- [ ] **Step 2: Correr o teste para confirmar que falha**

Run: `npm test`
Expected: FAIL — `Cannot find module '../../src/download/ficheiros'`.

- [ ] **Step 3: Implementar o ficheiros.js**

Ficheiro `src/download/ficheiros.js`:

```js
'use strict';
const path = require('path');
const { TIPOS } = require('../moloni/documents');

function sanitizar(nome) {
    return String(nome).replace(/[/\\?%*:|"<>]/g, '-').trim();
}

// As datas do Moloni vêm "YYYY-MM-DD" ou "YYYY-MM-DD HH:mm:ss".
// Fatiar a string evita objetos Date e problemas de fuso.
function bucketAnoMes(data) {
    return String(data).slice(0, 7);
}

function nomeFicheiro(doc, tipo) {
    // O document_type.name da API é a fonte de verdade — pode variar por
    // empresa. O label do TIPOS é só rede de segurança.
    const etiqueta = doc.document_type?.name || TIPOS[tipo]?.label || 'Documento';
    const entidade = doc.entity_name || doc.entity_vat || doc.entity_number || 'sem-entidade';
    return sanitizar(`${etiqueta} ${doc.number} - ${entidade}.pdf`);
}

// Cada documento vai para a pasta do seu próprio mês, e não do intervalo
// pedido — assim um intervalo que atravessa meses arruma-se sozinho.
function caminhoDestino(baseDir, doc, tipo) {
    return path.join(baseDir, bucketAnoMes(doc.date), nomeFicheiro(doc, tipo));
}

module.exports = { sanitizar, bucketAnoMes, nomeFicheiro, caminhoDestino };
```

- [ ] **Step 4: Correr os testes**

Run: `npm test`
Expected: PASS — 29 testes.

- [ ] **Step 5: Commit**

```bash
git add src/download/ficheiros.js test/download/ficheiros.test.js
git commit -m "Nomes de ficheiro e organização por ano-mês"
```

---

### Task 8: Orquestração do job

O único módulo que conhece Moloni **e** ficheiros. Filtra o intervalo, faz retry, grava, emite progresso.

**Files:**
- Create: `src/download/job.js`
- Test: `test/download/job.test.js`

**Interfaces:**
- Consumes: `caminhoDestino` (Task 7); recebe `documents` (T4) e `pdf` (T5) por injeção.
- Produces:
  - `anosAbrangidos(inicio: string, fim: string): number[]`
  - `dentroDoIntervalo(data: string, inicio: string, fim: string): boolean`
  - `correrJob(opcoes, aoEvento?, deps?): Promise<{ total, sucesso, falhas: Array<{numero, documentId, motivo}> }>`
    - `opcoes`: `{ documents, pdf, baseDir, inicio, fim, tipos: string[] }`
    - `aoEvento`: recebe `{ fase: 'listar'|'listagem-concluida'|'descarregar', ... }`
    - `deps`: `{ esperar?, escrever? }` — injeção para testes não tocarem no disco nem esperar de verdade.

- [ ] **Step 1: Escrever o teste que falha**

Ficheiro `test/download/job.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { correrJob, anosAbrangidos, dentroDoIntervalo } = require('../../src/download/job');

const doc = (id, date, extra = {}) => ({
    document_id: id, number: `N${id}`, date, status: 1,
    entity_name: `Cliente ${id}`, document_type: { name: 'Recibo' }, ...extra,
});

// deps que não tocam no disco nem esperam de verdade.
function depsFalsas() {
    const escritos = [];
    return {
        escritos,
        esperar: async () => {},
        escrever: (caminho, bytes) => escritos.push({ caminho, bytes }),
    };
}

test('anosAbrangidos cobre o intervalo inteiro', () => {
    assert.deepStrictEqual(anosAbrangidos('2026-06-01', '2026-06-30'), [2026]);
    assert.deepStrictEqual(anosAbrangidos('2025-11-01', '2026-02-28'), [2025, 2026]);
    assert.deepStrictEqual(anosAbrangidos('2024-01-01', '2026-01-01'), [2024, 2025, 2026]);
});

test('dentroDoIntervalo é inclusivo nas duas pontas', () => {
    assert.ok(dentroDoIntervalo('2026-06-01 00:00:00', '2026-06-01', '2026-06-30'));
    assert.ok(dentroDoIntervalo('2026-06-30 23:59:59', '2026-06-01', '2026-06-30'));
    assert.ok(!dentroDoIntervalo('2026-05-31', '2026-06-01', '2026-06-30'));
    assert.ok(!dentroDoIntervalo('2026-07-01', '2026-06-01', '2026-06-30'));
});

test('descarrega só os documentos dentro do intervalo', async () => {
    const documents = { listarPorAno: async () => [
        doc(1, '2026-05-31'), doc(2, '2026-06-15'), doc(3, '2026-07-01'),
    ]};
    const pdf = { obterBytes: async () => Buffer.from('%PDF-x') };
    const deps = depsFalsas();

    const r = await correrJob(
        { documents, pdf, baseDir: '/saida', inicio: '2026-06-01', fim: '2026-06-30', tipos: ['recibos'] },
        () => {}, deps
    );

    assert.strictEqual(r.total, 1);
    assert.strictEqual(r.sucesso, 1);
    assert.strictEqual(deps.escritos.length, 1);
    assert.ok(deps.escritos[0].caminho.includes('2026-06'));
    assert.ok(deps.escritos[0].caminho.includes('N2'));
});

test('ignora rascunhos (status 0) — não têm PDF', async () => {
    const documents = { listarPorAno: async () => [
        doc(1, '2026-06-15', { status: 0 }), doc(2, '2026-06-16'),
    ]};
    const pdf = { obterBytes: async () => Buffer.from('%PDF-x') };
    const deps = depsFalsas();

    const r = await correrJob(
        { documents, pdf, baseDir: '/s', inicio: '2026-06-01', fim: '2026-06-30', tipos: ['recibos'] },
        () => {}, deps
    );
    assert.strictEqual(r.total, 1);
});

test('uma falha não mata o job e entra no relatório', async () => {
    const documents = { listarPorAno: async () => [doc(1, '2026-06-10'), doc(2, '2026-06-11')] };
    const pdf = {
        obterBytes: async id => {
            if (id === 1) throw new Error('boom');
            return Buffer.from('%PDF-x');
        },
    };
    const deps = depsFalsas();

    const r = await correrJob(
        { documents, pdf, baseDir: '/s', inicio: '2026-06-01', fim: '2026-06-30', tipos: ['recibos'] },
        () => {}, deps
    );

    assert.strictEqual(r.sucesso, 1);
    assert.strictEqual(r.falhas.length, 1);
    assert.deepStrictEqual(r.falhas[0], { numero: 'N1', documentId: 1, motivo: 'boom' });
});

test('faz retry 3x antes de desistir de um documento', async () => {
    let tentativas = 0;
    const documents = { listarPorAno: async () => [doc(1, '2026-06-10')] };
    const pdf = {
        obterBytes: async () => {
            tentativas++;
            if (tentativas < 3) throw new Error('rede');
            return Buffer.from('%PDF-x');
        },
    };
    const deps = depsFalsas();

    const r = await correrJob(
        { documents, pdf, baseDir: '/s', inicio: '2026-06-01', fim: '2026-06-30', tipos: ['recibos'] },
        () => {}, deps
    );

    assert.strictEqual(tentativas, 3);
    assert.strictEqual(r.sucesso, 1);
});

test('emite progresso de listagem e de download', async () => {
    const documents = { listarPorAno: async () => [doc(1, '2026-06-10')] };
    const pdf = { obterBytes: async () => Buffer.from('%PDF-x') };
    const eventos = [];

    await correrJob(
        { documents, pdf, baseDir: '/s', inicio: '2026-06-01', fim: '2026-06-30', tipos: ['recibos'] },
        e => eventos.push(e), depsFalsas()
    );

    assert.ok(eventos.some(e => e.fase === 'listar'));
    assert.ok(eventos.some(e => e.fase === 'listagem-concluida' && e.total === 1));
    assert.ok(eventos.some(e => e.fase === 'descarregar' && e.feitos === 1 && e.total === 1));
});
```

- [ ] **Step 2: Correr o teste para confirmar que falha**

Run: `npm test`
Expected: FAIL — `Cannot find module '../../src/download/job'`.

- [ ] **Step 3: Implementar o job.js**

Ficheiro `src/download/job.js`:

```js
'use strict';
const fs = require('fs');
const path = require('path');
const { caminhoDestino } = require('./ficheiros');

const DELAY_MS = 150;   // não sobrecarregar a API do Moloni
const TENTATIVAS = 3;

function anosAbrangidos(inicio, fim) {
    const primeiro = Number(inicio.slice(0, 4));
    const ultimo = Number(fim.slice(0, 4));
    const anos = [];
    for (let ano = primeiro; ano <= ultimo; ano++) anos.push(ano);
    return anos;
}

// Datas como strings YYYY-MM-DD comparadas lexicograficamente: ordena
// igual à ordem cronológica, e evita fusos horários.
function dentroDoIntervalo(data, inicio, fim) {
    const dia = String(data).slice(0, 10);
    return dia >= inicio && dia <= fim;
}

async function comRetry(fn, esperar) {
    let ultimoErro;
    for (let tentativa = 0; tentativa < TENTATIVAS; tentativa++) {
        try {
            return await fn();
        } catch (err) {
            ultimoErro = err;
            if (tentativa < TENTATIVAS - 1) await esperar(500 * 2 ** tentativa);
        }
    }
    throw ultimoErro;
}

function escreverEmDisco(caminho, bytes) {
    fs.mkdirSync(path.dirname(caminho), { recursive: true });
    fs.writeFileSync(caminho, bytes);
}

async function correrJob({ documents, pdf, baseDir, inicio, fim, tipos }, aoEvento = () => {}, deps = {}) {
    const esperar = deps.esperar || (ms => new Promise(r => setTimeout(r, ms)));
    const escrever = deps.escrever || escreverEmDisco;

    // Fase 1: listar. O Moloni só filtra por ano, por isso puxa-se o ano
    // inteiro de cada tipo e filtra-se aqui.
    const alvo = [];
    for (const tipo of tipos) {
        for (const ano of anosAbrangidos(inicio, fim)) {
            aoEvento({ fase: 'listar', tipo, ano, verificados: 0 });
            const docs = await documents.listarPorAno(tipo, ano, p => aoEvento({ fase: 'listar', ...p }));
            for (const doc of docs) {
                if (doc.status === 0) continue; // rascunho: não tem PDF
                if (!dentroDoIntervalo(doc.date, inicio, fim)) continue;
                alvo.push({ doc, tipo });
            }
        }
    }
    aoEvento({ fase: 'listagem-concluida', total: alvo.length });

    // Fase 2: descarregar. Uma falha não mata o job.
    let sucesso = 0;
    const falhas = [];
    for (const { doc, tipo } of alvo) {
        try {
            const bytes = await comRetry(() => pdf.obterBytes(doc.document_id), esperar);
            escrever(caminhoDestino(baseDir, doc, tipo), bytes);
            sucesso++;
        } catch (err) {
            falhas.push({ numero: doc.number, documentId: doc.document_id, motivo: err.message });
        }
        aoEvento({
            fase: 'descarregar',
            feitos: sucesso + falhas.length,
            total: alvo.length,
            falhas: falhas.length,
        });
        await esperar(DELAY_MS);
    }

    return { total: alvo.length, sucesso, falhas };
}

module.exports = { correrJob, anosAbrangidos, dentroDoIntervalo };
```

- [ ] **Step 4: Correr os testes**

Run: `npm test`
Expected: PASS — 36 testes.

- [ ] **Step 5: Commit**

```bash
git add src/download/job.js test/download/job.test.js
git commit -m "Orquestração do job com filtro de intervalo, retry e progresso"
```

---

### Task 9: Servidor e SSE

Express fino: serve a UI, arranca **um** job de cada vez, transmite progresso por Server-Sent Events.

**Files:**
- Create: `src/server/index.js`
- Create: `src/server/validar.js`
- Test: `test/server/validar.test.js`

O servidor em si é fino e não leva testes — é exercitado ponta-a-ponta na Task 11.
Mas as regras de validação do `POST /api/jobs` são lógica de negócio a sério e
extraem-se para `validar.js`, que se testa puro, sem arrancar servidor nenhum.

**Interfaces:**
- Consumes: tudo o que veio antes.
- Produces:
  - `GET /` → a UI (Task 10)
  - `GET /api/tipos` → `{ recibos: 'Recibo', faturas: 'Fatura', faturasRecibo: 'Fatura-Recibo' }`
  - `POST /api/jobs` body `{ inicio, fim, tipos: string[] }` → `202 { ok: true }`, ou `409` se já houver job a correr, ou `400` se os parâmetros forem inválidos
  - `GET /api/eventos` → stream SSE com os eventos do job + `{ fase: 'concluido', ... }` ou `{ fase: 'erro', motivo }`
  - `POST /api/abrir-pasta` → `200 { ok: true }`; abre a pasta no Finder/Explorer
  - `validarPedido({ inicio, fim, tipos }, tiposValidos): string | null` — devolve a
    mensagem de erro, ou `null` se o pedido for válido.

- [ ] **Step 1: Escrever o teste que falha**

Ficheiro `test/server/validar.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { validarPedido } = require('../../src/server/validar');

const TIPOS_VALIDOS = { recibos: {}, faturas: {} };
const valido = { inicio: '2026-06-01', fim: '2026-06-30', tipos: ['recibos'] };

test('aceita um pedido válido', () => {
    assert.strictEqual(validarPedido(valido, TIPOS_VALIDOS), null);
});

test('rejeita datas em falta ou mal formatadas', () => {
    assert.match(validarPedido({ ...valido, inicio: 'ontem' }, TIPOS_VALIDOS), /formato inválido/);
    assert.match(validarPedido({ ...valido, fim: undefined }, TIPOS_VALIDOS), /formato inválido/);
    assert.match(validarPedido({ ...valido, inicio: '2026-6-1' }, TIPOS_VALIDOS), /formato inválido/);
    assert.match(validarPedido(undefined, TIPOS_VALIDOS), /formato inválido/);
});

test('rejeita início posterior ao fim', () => {
    assert.match(
        validarPedido({ ...valido, inicio: '2026-06-30', fim: '2026-06-01' }, TIPOS_VALIDOS),
        /início é posterior/
    );
});

test('aceita início igual ao fim (intervalo de um dia)', () => {
    assert.strictEqual(
        validarPedido({ ...valido, inicio: '2026-06-15', fim: '2026-06-15' }, TIPOS_VALIDOS),
        null
    );
});

test('rejeita tipos em falta, vazios ou desconhecidos', () => {
    assert.match(validarPedido({ ...valido, tipos: [] }, TIPOS_VALIDOS), /tipo de documento/);
    assert.match(validarPedido({ ...valido, tipos: undefined }, TIPOS_VALIDOS), /tipo de documento/);
    assert.match(validarPedido({ ...valido, tipos: ['notasCredito'] }, TIPOS_VALIDOS), /tipo de documento/);
});
```

- [ ] **Step 2: Correr o teste para confirmar que falha**

Run: `npm test`
Expected: FAIL — `Cannot find module '../../src/server/validar'`.

- [ ] **Step 3: Implementar o validar.js**

Ficheiro `src/server/validar.js`:

```js
'use strict';

const DATA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;

// Devolve a mensagem de erro para mostrar à utilizadora, ou null se estiver tudo bem.
function validarPedido(pedido, tiposValidos) {
    const { inicio, fim, tipos } = pedido || {};

    if (!DATA_VALIDA.test(inicio || '') || !DATA_VALIDA.test(fim || '')) {
        return 'Datas em falta ou em formato inválido (YYYY-MM-DD).';
    }
    if (inicio > fim) {
        return 'A data de início é posterior à data de fim.';
    }
    if (!Array.isArray(tipos) || tipos.length === 0 || tipos.some(t => !tiposValidos[t])) {
        return 'Escolhe pelo menos um tipo de documento válido.';
    }
    return null;
}

module.exports = { validarPedido };
```

- [ ] **Step 4: Correr os testes**

Run: `npm test`
Expected: PASS — 41 testes.

- [ ] **Step 5: Implementar o servidor**

Ficheiro `src/server/index.js`:

```js
'use strict';
const path = require('path');
const express = require('express');
const { exec } = require('child_process');
const { carregarConfig } = require('../config');
const { criarAuth } = require('../moloni/auth');
const { criarClient } = require('../moloni/client');
const { criarDocuments, TIPOS } = require('../moloni/documents');
const { criarPdf } = require('../moloni/pdf');
const { correrJob } = require('../download/job');
const { validarPedido } = require('./validar');

const PORTA = Number(process.env.PORT) || 4711;

// Falhar já e com uma mensagem útil, e não a meio do primeiro job.
let config;
try {
    config = carregarConfig();
} catch (err) {
    console.error('\nConfiguração inválida:\n  ' + err.message + '\n');
    process.exit(1);
}

const baseDir = path.resolve(config.downloadDir);
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'ui')));

// Um job de cada vez: a contabilista não lança dois, e serializar poupa
// estado partilhado. `clientes` são as ligações SSE abertas.
let jobAtivo = false;
const clientes = new Set();

function emitir(evento) {
    const linha = `data: ${JSON.stringify(evento)}\n\n`;
    for (const res of clientes) res.write(linha);
}

app.get('/api/tipos', (req, res) => {
    const etiquetas = {};
    for (const [chave, def] of Object.entries(TIPOS)) etiquetas[chave] = def.label;
    res.json(etiquetas);
});

app.get('/api/eventos', (req, res) => {
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
    });
    res.flushHeaders();
    clientes.add(res);
    req.on('close', () => clientes.delete(res));
});

app.post('/api/jobs', async (req, res) => {
    const erro = validarPedido(req.body, TIPOS);
    if (erro) return res.status(400).json({ erro });

    if (jobAtivo) {
        return res.status(409).json({ erro: 'Já está um download a decorrer.' });
    }

    const { inicio, fim, tipos } = req.body;
    jobAtivo = true;
    res.status(202).json({ ok: true });

    // Corre em background; o progresso vai por SSE.
    (async () => {
        try {
            const client = criarClient(config, criarAuth(config));
            const resultado = await correrJob({
                documents: criarDocuments(client),
                pdf: criarPdf(client),
                baseDir, inicio, fim, tipos,
            }, emitir);
            emitir({ fase: 'concluido', ...resultado, pasta: baseDir });
        } catch (err) {
            emitir({ fase: 'erro', motivo: err.message });
        } finally {
            jobAtivo = false;
        }
    })();
});

app.post('/api/abrir-pasta', (req, res) => {
    const comando = process.platform === 'darwin' ? 'open'
        : process.platform === 'win32' ? 'explorer'
        : 'xdg-open';
    exec(`${comando} "${baseDir}"`);
    res.json({ ok: true });
});

app.listen(PORTA, () => {
    console.log(`\n  Moloni Downloader:  http://localhost:${PORTA}`);
    console.log(`  Empresa:            ${config.companyId}`);
    console.log(`  Guarda em:          ${baseDir}\n`);
});
```

- [ ] **Step 6: Confirmar que o servidor arranca e responde**

Run:
```bash
npm start & sleep 2
curl -s localhost:4711/api/tipos
curl -s -X POST localhost:4711/api/jobs -H 'Content-Type: application/json' -d '{"inicio":"ontem","fim":"2026-06-30","tipos":["recibos"]}'
kill %1
```
Expected: primeiro `{"recibos":"Recibo","faturas":"Fatura","faturasRecibo":"Fatura-Recibo"}`,
segundo `{"erro":"Datas em falta ou em formato inválido (YYYY-MM-DD)."}` — confirma que
o `validar.js` está de facto ligado ao endpoint, que é o que os testes unitários não provam.

- [ ] **Step 7: Commit**

```bash
git add src/server/index.js src/server/validar.js test/server/validar.test.js
git commit -m "Servidor Express com SSE de progresso e validação testada"
```

---

### Task 10: Interface

Uma página, sem framework. Formulário → SSE → resumo.

**Files:**
- Create: `src/ui/index.html`

**Interfaces:**
- Consumes: os endpoints da Task 9.
- Produces: nada.

- [ ] **Step 1: Escrever a página**

Ficheiro `src/ui/index.html`:

```html
<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Descarregar documentos Moloni</title>
<style>
  :root { --azul: #0b5fff; --cinza: #6b7280; --erro: #b91c1c; --ok: #15803d; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; max-width: 34rem;
         margin: 3rem auto; padding: 0 1.25rem; color: #111; line-height: 1.5; }
  h1 { font-size: 1.4rem; margin-bottom: 0.25rem; }
  p.sub { color: var(--cinza); margin-top: 0; }
  fieldset { border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem; margin: 0 0 1rem; }
  legend { padding: 0 0.4rem; font-weight: 600; font-size: 0.9rem; }
  .datas { display: flex; gap: 1rem; }
  .datas label { flex: 1; display: block; font-size: 0.85rem; color: var(--cinza); }
  input[type=date] { width: 100%; padding: 0.5rem; font-size: 1rem;
                     border: 1px solid #d1d5db; border-radius: 6px; }
  .tipo { display: block; margin: 0.35rem 0; }
  button { background: var(--azul); color: #fff; border: 0; border-radius: 6px;
           padding: 0.7rem 1.2rem; font-size: 1rem; cursor: pointer; }
  button:disabled { background: #9ca3af; cursor: default; }
  button.sec { background: #fff; color: var(--azul); border: 1px solid var(--azul); }
  #painel { margin-top: 1.5rem; display: none; }
  progress { width: 100%; height: 1rem; }
  #estado { font-variant-numeric: tabular-nums; }
  .erro { color: var(--erro); }
  .ok { color: var(--ok); font-weight: 600; }
  details { margin-top: 0.75rem; }
  li { font-size: 0.85rem; color: var(--cinza); }
</style>
</head>
<body>
<h1>Descarregar documentos Moloni</h1>
<p class="sub">Escolhe o período e os tipos de documento.</p>

<form id="form">
  <fieldset>
    <legend>Período</legend>
    <div class="datas">
      <label>De <input type="date" id="inicio" required></label>
      <label>Até <input type="date" id="fim" required></label>
    </div>
  </fieldset>

  <fieldset>
    <legend>Tipos de documento</legend>
    <div id="tipos"></div>
  </fieldset>

  <button type="submit" id="btn">Descarregar</button>
</form>

<div id="painel">
  <p id="estado">A preparar…</p>
  <progress id="barra" max="100" value="0"></progress>
  <div id="resumo"></div>
</div>

<script>
const $ = id => document.getElementById(id);

// Por defeito: o mês passado — o caso real é o fecho mensal da contabilidade.
(function preencherDatas() {
  const hoje = new Date();
  const primeiro = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const ultimo = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  $('inicio').value = iso(primeiro);
  $('fim').value = iso(ultimo);
})();

fetch('/api/tipos').then(r => r.json()).then(tipos => {
  $('tipos').innerHTML = Object.entries(tipos).map(([chave, etiqueta]) =>
    `<label class="tipo"><input type="checkbox" name="tipo" value="${chave}" checked> ${etiqueta}</label>`
  ).join('');
});

const fmt = n => n.toLocaleString('pt-PT');

new EventSource('/api/eventos').onmessage = e => {
  const ev = JSON.parse(e.data);

  if (ev.fase === 'listar') {
    $('barra').removeAttribute('value'); // indeterminada: ainda não se sabe o total
    $('estado').textContent = `A procurar ${ev.tipo} de ${ev.ano}… ${fmt(ev.verificados || 0)} verificados`;
  }
  if (ev.fase === 'listagem-concluida') {
    $('estado').textContent = `${fmt(ev.total)} documentos encontrados. A descarregar…`;
    $('barra').value = 0;
  }
  if (ev.fase === 'descarregar') {
    $('barra').value = ev.total ? (ev.feitos / ev.total) * 100 : 0;
    $('estado').textContent = `A descarregar ${fmt(ev.feitos)} de ${fmt(ev.total)}`
      + (ev.falhas ? ` — ${fmt(ev.falhas)} falhas` : '');
  }
  if (ev.fase === 'concluido') {
    $('barra').value = 100;
    $('estado').innerHTML = `<span class="ok">Concluído: ${fmt(ev.sucesso)} de ${fmt(ev.total)} guardados.</span>`;
    let html = '<p><button class="sec" onclick="fetch(\'/api/abrir-pasta\',{method:\'POST\'})">Abrir pasta</button></p>';
    if (ev.falhas?.length) {
      html += `<details><summary>${fmt(ev.falhas.length)} falharam</summary><ul>`
        + ev.falhas.map(f => `<li>${f.numero}: ${f.motivo}</li>`).join('') + '</ul></details>';
    }
    $('resumo').innerHTML = html;
    $('btn').disabled = false;
    $('btn').textContent = 'Descarregar';
  }
  if (ev.fase === 'erro') {
    $('estado').innerHTML = `<span class="erro">Erro: ${ev.motivo}</span>`;
    $('btn').disabled = false;
    $('btn').textContent = 'Descarregar';
  }
};

$('form').onsubmit = async e => {
  e.preventDefault();
  const tipos = [...document.querySelectorAll('input[name=tipo]:checked')].map(c => c.value);
  if (tipos.length === 0) return alert('Escolhe pelo menos um tipo de documento.');

  $('btn').disabled = true;
  $('btn').textContent = 'A descarregar…';
  $('painel').style.display = 'block';
  $('resumo').innerHTML = '';
  $('estado').textContent = 'A preparar…';

  const resposta = await fetch('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inicio: $('inicio').value, fim: $('fim').value, tipos }),
  });

  if (!resposta.ok) {
    const { erro } = await resposta.json();
    $('estado').innerHTML = `<span class="erro">${erro}</span>`;
    $('btn').disabled = false;
    $('btn').textContent = 'Descarregar';
  }
};
</script>
</body>
</html>
```

- [ ] **Step 2: Verificar a UI no browser**

Run: `npm start`, abrir `http://localhost:4711`
Expected: formulário com as datas já preenchidas com o mês passado e três checkboxes ligadas.

- [ ] **Step 3: Commit**

```bash
git add src/ui/index.html
git commit -m "Interface com formulário e progresso por SSE"
```

---

### Task 11: Launcher com auto-update, README e verificação ponta-a-ponta

O atalho que a contabilista clica. Faz `git pull` antes de arrancar — é fita-cola assumida, mas dá o auto-update a custo quase zero.

**Regra do launcher:** se o update falhar, **arranca na mesma** com a versão local. Nunca deixar a app sem abrir por causa de um update falhado.

**Files:**
- Create: `Descarregar Recibos.command` (macOS)
- Create: `Descarregar Recibos.bat` (Windows)
- Create: `README.md`

**Interfaces:**
- Consumes: `npm start` (Task 1), servidor (Task 9).
- Produces: nada.

- [ ] **Step 1: Escrever o launcher de macOS**

Ficheiro `Descarregar Recibos.command`:

```bash
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
```

- [ ] **Step 2: Torná-lo executável**

Run: `chmod +x "Descarregar Recibos.command"`
Expected: sem output.

- [ ] **Step 3: Escrever o launcher de Windows**

Ficheiro `Descarregar Recibos.bat`:

```bat
@echo off
REM Atalho para a contabilista. Duplo-clique no Explorador.
cd /d "%~dp0"

echo A verificar atualizacoes...
git pull --quiet 2>nul && npm install --silent --no-audit --no-fund 2>nul
if errorlevel 1 echo AVISO: nao foi possivel atualizar. A abrir a versao instalada.

echo A abrir no browser...
start "" /b cmd /c "timeout /t 2 >nul && start http://localhost:4711"
npm start
```

- [ ] **Step 4: Escrever o README**

Ficheiro `README.md`:

```markdown
# Moloni Downloader

Descarrega em massa os PDFs de documentos do Moloni (recibos, faturas,
faturas-recibo) para um intervalo de datas. O portal do Moloni só deixa
descarregar um de cada vez.

## Utilizar

Duplo-clique em **Descarregar Recibos.command** (macOS) ou
**Descarregar Recibos.bat** (Windows). Abre no browser: escolhe as datas, os
tipos, e carrega em Descarregar.

Os PDFs ficam em `downloads/<ano>-<mês>/`.

## Instalar num PC novo

Requer [Node.js](https://nodejs.org) 20+ e git.

```bash
git clone <repo> && cd moloni-automations
npm install
cp .env.example .env   # preencher com as credenciais Moloni do cliente
```

Confirmar que funciona antes de entregar:

```bash
node scripts/validar-tipos.js
```

Depois, criar um atalho do launcher no ambiente de trabalho.

## Atualizações

O launcher faz `git pull` no arranque. Basta fazer push — o cliente recebe da
próxima vez que abrir. Se o update falhar, a app abre à mesma com a versão
instalada.

## Desenvolver

```bash
npm test                       # testes unitários
node scripts/validar-tipos.js  # diagnóstico contra a API real
```

Desenho e decisões: `docs/superpowers/specs/2026-07-16-moloni-downloader-design.md`

**Aviso:** `downloads/` tem dados fiscais de clientes e `.env` tem credenciais.
Ambos estão no `.gitignore` — nunca os commitar.
```

- [ ] **Step 5: Correr a suite completa**

Run: `npm test`
Expected: PASS — 41 testes, 0 falhas.

- [ ] **Step 6: Verificação ponta-a-ponta contra a API real**

Arrancar com o launcher (`./"Descarregar Recibos.command"`), e no browser pedir **junho de 2026, só recibos** — o caso já provado (935 recibos, 0 falhas no script original).

Confirmar, por esta ordem:
1. A barra mostra a fase de listagem e depois a de download
2. `ls downloads/2026-06/ | wc -l` → **935**
3. `file downloads/2026-06/*.pdf | grep -c "PDF document"` → **935** (e não HTML — é aqui que a pegadinha nº2 se apanharia)
4. Abrir um PDF à mão e confirmar que é o recibo certo
5. O botão "Abrir pasta" abre o Finder

Se o número não bater com 935, **parar e investigar** antes de commitar: ou o filtro de intervalo está errado, ou a paginação está a perder documentos.

- [ ] **Step 7: Commit**

```bash
git add "Descarregar Recibos.command" "Descarregar Recibos.bat" README.md
git commit -m "Launcher com auto-update e README"
```

---

## Notas para quem executar

- **Task 6 é um portão.** Se `recibos` falhar aí, há uma regressão nas Tasks 2-5 — não avançar. Se `faturas` ou `faturasRecibo` falharem, cortar esse tipo e registar no spec; a cliente só pediu recibos.
- **Os testes da Task 5 são inegociáveis.** São a única coisa que impede as duas pegadinhas de voltarem, e o modo de falha é silencioso: grava HTML com extensão `.pdf` e ninguém dá por isso até a contabilista abrir o ficheiro.
- **Fora de âmbito, decidido:** ZIP no fim, folha de resumo CSV/Excel, subpastas por entidade, notas de crédito, UI de credenciais, multi-empresa, agendamento. Não acrescentar sem falar com o Gil.
- **Lentidão conhecida:** a listagem de um intervalo de 2 anos são ~1300 pedidos (3-5 min antes do primeiro PDF). Decisão consciente. Se doer, a mitigação é cache local das listagens de anos passados — o passado não muda.
