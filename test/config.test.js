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
