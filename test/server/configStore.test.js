'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { paraFormulario, gravar, validar, tentarCarregarConfig } = require('../../src/server/configStore');

const ENV_COMPLETO = `MOLONI_CLIENT_ID=id-real
MOLONI_CLIENT_SECRET=segredo-real
MOLONI_USERNAME=user@allpra.pt
MOLONI_PASSWORD=password-real
MOLONI_COMPANY_ID=331227
DOWNLOAD_DIR=/Users/gil/downloads
ESTRUTURA_PASTAS=data-tipo
`;

// fs falso: um único ficheiro em memória, para testar leitura e escrita sem
// tocar em disco.
function fsFalso(conteudoInicial) {
    let conteudo = conteudoInicial;
    return {
        existsSync: () => conteudo !== undefined,
        readFileSync: () => { if (conteudo === undefined) throw new Error('ENOENT'); return conteudo; },
        writeFileSync: (caminho, dados) => { conteudo = dados; },
        _ler: () => conteudo,
    };
}

test('paraFormulario nunca devolve o secret nem a password em texto', () => {
    const r = paraFormulario('/x/.env', fsFalso(ENV_COMPLETO));
    assert.strictEqual(r.clientId, 'id-real');
    assert.strictEqual(r.username, 'user@allpra.pt');
    assert.strictEqual(r.companyId, '331227');
    assert.ok(!('clientSecret' in r), 'o secret não pode sair daqui, nem mascarado por engano');
    assert.ok(!('password' in r), 'a password não pode sair daqui');
    assert.strictEqual(r.clientSecretPreenchido, true);
    assert.strictEqual(r.passwordPreenchido, true);
});

test('paraFormulario sem .env devolve tudo vazio, sem rebentar', () => {
    const r = paraFormulario('/x/.env', fsFalso(undefined));
    assert.strictEqual(r.clientId, '');
    assert.strictEqual(r.clientSecretPreenchido, false);
    assert.strictEqual(r.passwordPreenchido, false);
    assert.strictEqual(r.downloadDir, './downloads');
    assert.strictEqual(r.estrutura, 'tipo-data');
});

test('paraFormulario devolve downloadDir e estrutura do ficheiro', () => {
    const r = paraFormulario('/x/.env', fsFalso(ENV_COMPLETO));
    assert.strictEqual(r.downloadDir, '/Users/gil/downloads');
    assert.strictEqual(r.estrutura, 'data-tipo');
});

test('gravar campos de texto substitui sempre', () => {
    const fs = fsFalso(ENV_COMPLETO);
    gravar('/x/.env', { clientId: 'id-novo' }, fs);
    assert.match(fs._ler(), /MOLONI_CLIENT_ID=id-novo/);
});

// O coração do pedido do Gil: campo vazio no formulário significa "não mexas",
// nunca "apaga". Só substitui quando vem preenchido.
test('gravar com secret/password vazios mantém os valores antigos', () => {
    const fs = fsFalso(ENV_COMPLETO);
    gravar('/x/.env', { clientId: 'id-novo', clientSecret: '', password: '' }, fs);
    assert.match(fs._ler(), /MOLONI_CLIENT_SECRET=segredo-real/);
    assert.match(fs._ler(), /MOLONI_PASSWORD=password-real/);
});

test('gravar com secret/password preenchidos substitui', () => {
    const fs = fsFalso(ENV_COMPLETO);
    gravar('/x/.env', { clientSecret: 'segredo-novo', password: 'password-nova' }, fs);
    assert.match(fs._ler(), /MOLONI_CLIENT_SECRET=segredo-novo/);
    assert.match(fs._ler(), /MOLONI_PASSWORD=password-nova/);
    assert.doesNotMatch(fs._ler(), /segredo-real/);
});

test('gravar devolve a config carregada e validada', () => {
    const fs = fsFalso(ENV_COMPLETO);
    const config = gravar('/x/.env', { companyId: '999999' }, fs);
    assert.strictEqual(config.companyId, 999999);
});

// Não pode ser possível gravar uma config que fica inválida — nem por um
// campo em branco nem por um valor absurdo. Falhar aqui é melhor do que
// falhar silenciosamente no primeiro download.
test('gravar rejeita um companyId inválido e não escreve nada', () => {
    const fs = fsFalso(ENV_COMPLETO);
    assert.throws(() => gravar('/x/.env', { companyId: 'abc' }, fs), /MOLONI_COMPANY_ID/);
    assert.match(fs._ler(), /MOLONI_COMPANY_ID=331227/, 'o ficheiro tem de ficar como estava');
});

test('gravar pela primeira vez, sem .env prévio, funciona com tudo preenchido', () => {
    const fs = fsFalso(undefined);
    const config = gravar('/x/.env', {
        clientId: 'id', clientSecret: 'sec', username: 'u', password: 'p', companyId: '1',
    }, fs);
    assert.strictEqual(config.clientId, 'id');
});

test('gravar pela primeira vez sem secret/password falha — não há valor antigo para manter', () => {
    const fs = fsFalso(undefined);
    assert.throws(
        () => gravar('/x/.env', { clientId: 'id', username: 'u', companyId: '1' }, fs),
        /MOLONI_CLIENT_SECRET.*MOLONI_PASSWORD|MOLONI_PASSWORD.*MOLONI_CLIENT_SECRET/s
    );
});

// validar() é o que o botão "Testar ligação" usa: quer saber se as
// credenciais que ela está a escrever agora funcionam, sem as gravar ainda —
// só grava quando ela carregar em "Guardar".
test('validar funde e devolve a config, mas não escreve nada', () => {
    const fs = fsFalso(ENV_COMPLETO);
    const config = validar('/x/.env', { clientId: 'id-a-testar' }, fs);
    assert.strictEqual(config.clientId, 'id-a-testar');
    assert.strictEqual(fs._ler(), ENV_COMPLETO, 'o ficheiro não pode mudar');
});

test('validar também funde secrets vazios com os já gravados', () => {
    const fs = fsFalso(ENV_COMPLETO);
    const config = validar('/x/.env', { clientId: 'id-a-testar', clientSecret: '', password: '' }, fs);
    assert.strictEqual(config.clientSecret, 'segredo-real');
    assert.strictEqual(config.password, 'password-real');
});

test('validar lança se ficar inválido, sem escrever nada', () => {
    const fs = fsFalso(ENV_COMPLETO);
    assert.throws(() => validar('/x/.env', { companyId: 'abc' }, fs), /MOLONI_COMPANY_ID/);
    assert.strictEqual(fs._ler(), ENV_COMPLETO);
});

// Usada pelo arranque do servidor: precisa de ler config dum ficheiro
// específico (não de process.env), porque o Electron vai ter o .env fora da
// raiz do projeto — na pasta de dados do utilizador. Nunca lança: uma
// instalação nova, sem .env ainda, tem de arrancar na mesma.
test('tentarCarregarConfig devolve a config quando o ficheiro é válido', () => {
    const { config, erro } = tentarCarregarConfig('/x/.env', fsFalso(ENV_COMPLETO));
    assert.strictEqual(erro, null);
    assert.strictEqual(config.clientId, 'id-real');
    assert.strictEqual(config.companyId, 331227);
});

test('tentarCarregarConfig devolve o erro em vez de lançar quando falta o ficheiro', () => {
    const { config, erro } = tentarCarregarConfig('/x/.env', fsFalso(undefined));
    assert.strictEqual(config, null);
    assert.match(erro, /MOLONI_CLIENT_ID/);
});

test('tentarCarregarConfig devolve o erro quando o ficheiro está incompleto', () => {
    const parcial = 'MOLONI_CLIENT_ID=id\n';
    const { config, erro } = tentarCarregarConfig('/x/.env', fsFalso(parcial));
    assert.strictEqual(config, null);
    assert.match(erro, /MOLONI_CLIENT_SECRET/);
});
