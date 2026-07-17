'use strict';
const { test, afterEach } = require('node:test');
const assert = require('node:assert');
const nock = require('nock');
const { criarAuth, BASE, TIMEOUT_MS } = require('../../src/moloni/auth');

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

test('pede token novo dentro da margem de 60 segundos antes de expirar', async () => {
    nock('https://api.moloni.pt').post('/v1/grant/').query(true)
        .reply(200, { access_token: 'tok-1', expires_in: 3600 });
    nock('https://api.moloni.pt').post('/v1/grant/').query(true)
        .reply(200, { access_token: 'tok-2', expires_in: 3600 });

    let t = 0;
    const auth = criarAuth(config, { agora: () => t });
    assert.strictEqual(await auth.getToken(), 'tok-1');
    // Avança para 30s antes da validade nominal (dentro da margem de 60s)
    // expiraEm foi calculado como: 0 + (3600 - 60) * 1000 = 3540 * 1000
    // Agora t = 3570 * 1000, que é > 3540 * 1000, então token expirou
    t = (3600 - 30) * 1000;
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

// Sem timeout, um pedido de grant/ pendurado nunca rejeita e prende o job
// para sempre. Este teste falha se `timeout: TIMEOUT_MS` desaparecer do
// axios.post em auth.js.
test('envia timeout na configuração do pedido de grant', async () => {
    nock('https://api.moloni.pt').post('/v1/grant/').query(true)
        .reply(200, { access_token: 'tok-1', expires_in: 3600 });

    const axios = require('axios');
    let axiosConfigRecebida = null;
    const interceptorId = axios.interceptors.request.use(cfg => {
        axiosConfigRecebida = cfg;
        return cfg;
    });

    try {
        const auth = criarAuth(config);
        await auth.getToken();

        assert.strictEqual(axiosConfigRecebida.timeout, TIMEOUT_MS,
            `Esperava timeout=${TIMEOUT_MS} mas recebi ${axiosConfigRecebida.timeout}`);
    } finally {
        axios.interceptors.request.eject(interceptorId);
    }
});
