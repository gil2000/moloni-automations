'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { encontrarLogos } = require('../../src/server/branding');

// fs falso: diz que existem só os ficheiros desta lista.
function fsFalso(existentes) {
    return { existsSync: p => existentes.includes(path.basename(p)) };
}

test('encontra os dois logos', () => {
    const r = encontrarLogos('/b', fsFalso(['logo-esquerda.png', 'logo-direita.png']));
    assert.deepStrictEqual(r, {
        esquerda: '/branding/logo-esquerda.png',
        direita: '/branding/logo-direita.png',
    });
});

test('devolve null para o que não existe', () => {
    const r = encontrarLogos('/b', fsFalso(['logo-esquerda.png']));
    assert.strictEqual(r.esquerda, '/branding/logo-esquerda.png');
    assert.strictEqual(r.direita, null);
});

test('sem pasta de branding, não há logos e não rebenta', () => {
    assert.deepStrictEqual(encontrarLogos('/b', fsFalso([])), { esquerda: null, direita: null });
});

test('aceita svg, jpg e webp além de png', () => {
    assert.strictEqual(encontrarLogos('/b', fsFalso(['logo-esquerda.svg'])).esquerda, '/branding/logo-esquerda.svg');
    assert.strictEqual(encontrarLogos('/b', fsFalso(['logo-direita.webp'])).direita, '/branding/logo-direita.webp');
});

// O branding é decoração: uma pasta sem permissões não pode impedir a
// contabilista de descarregar os recibos dela.
test('um fs que rebenta não derruba a app', () => {
    const fsMau = { existsSync: () => { throw new Error('EACCES'); } };
    assert.deepStrictEqual(encontrarLogos('/b', fsMau), { esquerda: null, direita: null });
});
