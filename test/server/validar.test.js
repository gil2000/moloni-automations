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
