'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { encontrarLogos } = require('../../src/server/branding');

const DIRS = { dirFornecedor: '/app/ui', dirCliente: '/app/branding' };

// fs falso: diz que existem só os ficheiros desta lista.
function fsFalso(existentes) {
    return { existsSync: p => existentes.includes(path.basename(p)) };
}

test('encontra os dois logos', () => {
    const r = encontrarLogos(DIRS, fsFalso(['logo-fornecedor.png', 'logo-cliente.png']));
    assert.deepStrictEqual(r, {
        fornecedor: '/logo-fornecedor.png',
        cliente: '/branding/logo-cliente.png',
    });
});

// O da ALLPRA viaja no repo; o do cliente é que pode não estar instalado.
test('sem logo do cliente, o do fornecedor aparece na mesma', () => {
    const r = encontrarLogos(DIRS, fsFalso(['logo-fornecedor.png']));
    assert.strictEqual(r.fornecedor, '/logo-fornecedor.png');
    assert.strictEqual(r.cliente, null);
});

test('sem logos nenhuns, não rebenta', () => {
    assert.deepStrictEqual(encontrarLogos(DIRS, fsFalso([])), { fornecedor: null, cliente: null });
});

test('aceita svg, jpg e webp além de png', () => {
    assert.strictEqual(encontrarLogos(DIRS, fsFalso(['logo-fornecedor.svg'])).fornecedor, '/logo-fornecedor.svg');
    assert.strictEqual(encontrarLogos(DIRS, fsFalso(['logo-cliente.webp'])).cliente, '/branding/logo-cliente.webp');
});

// O branding é decoração: uma pasta sem permissões não pode impedir a
// contabilista de descarregar os recibos dela.
test('um fs que rebenta não derruba a app', () => {
    const fsMau = { existsSync: () => { throw new Error('EACCES'); } };
    assert.deepStrictEqual(encontrarLogos(DIRS, fsMau), { fornecedor: null, cliente: null });
});
