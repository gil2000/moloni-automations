'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { versaoNodeSuficiente, NODE_MINIMO } = require('../src/requisitos');

test('aceita a versão mínima e acima', () => {
    assert.ok(versaoNodeSuficiente('v20.0.0'));
    assert.ok(versaoNodeSuficiente('v24.16.0'));
    assert.ok(versaoNodeSuficiente('v100.0.0'));
});

test('rejeita versões abaixo do mínimo', () => {
    assert.ok(!versaoNodeSuficiente('v18.20.4'));
    assert.ok(!versaoNodeSuficiente('v16.0.0'));
    assert.ok(!versaoNodeSuficiente('v8.11.1'));
});

// Comparar versões como texto daria "v8" > "v20", que é o erro clássico aqui:
// deixaria passar exatamente as versões velhas que isto existe para apanhar.
test('compara números, não texto', () => {
    assert.ok(!versaoNodeSuficiente('v9.0.0'));
    assert.ok(versaoNodeSuficiente('v20.0.0'));
});

test('aceita a versão sem o v à frente', () => {
    assert.ok(versaoNodeSuficiente('20.1.0'));
});

test('rejeita lixo em vez de rebentar', () => {
    assert.ok(!versaoNodeSuficiente(''));
    assert.ok(!versaoNodeSuficiente('desconhecido'));
    assert.ok(!versaoNodeSuficiente(undefined));
});

test('o mínimo é configurável', () => {
    assert.ok(versaoNodeSuficiente('v18.0.0', 16));
    assert.ok(!versaoNodeSuficiente('v18.0.0', 22));
});

test('o mínimo por defeito é 20', () => {
    assert.strictEqual(NODE_MINIMO, 20);
});
