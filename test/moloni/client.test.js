'use strict';
const { test, afterEach } = require('node:test');
const assert = require('node:assert');
const nock = require('nock');
const { criarClient } = require('../../src/moloni/client');
const { TIMEOUT_MS } = require('../../src/moloni/auth');

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

test('envia timeout na configuração do pedido', async () => {
    nock('https://api.moloni.pt')
        .post('/v1/test/endpoint/')
        .query(true)
        .reply(200, { ok: true });

    const client = criarClient(config, authFalso);

    // Interceptar axios para verificar a config
    const axios = require('axios');
    let axiosConfigRecebida = null;
    const interceptorId = axios.interceptors.request.use(cfg => {
        axiosConfigRecebida = cfg;
        return cfg;
    });

    try {
        await client.post('test/endpoint');

        // Verificar que timeout foi passado à config do axios
        assert.strictEqual(axiosConfigRecebida.timeout, TIMEOUT_MS,
            `Esperava timeout=${TIMEOUT_MS} mas recebi ${axiosConfigRecebida.timeout}`);
    } finally {
        axios.interceptors.request.eject(interceptorId);
    }
});
