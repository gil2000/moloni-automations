'use strict';
// Verifica que esta máquina consegue mesmo correr a app, por ordem, parando no
// primeiro problema. Para o Gil correr no onboarding de um cliente, antes de sair
// de lá: se isto passa, a contabilista pode usar a app.
//
// Uso: npm run verificar [ano]
//
// Deliberadamente sem sintaxe moderna no topo: se o Node for velho de mais, este
// ficheiro tem de conseguir dizê-lo em vez de rebentar com um erro de sintaxe.

var requisitos = require('../src/requisitos');

var falhou = false;

function ok(msg)    { console.log('  OK     ' + msg); }
function erro(msg, comoResolver) {
    console.log('  FALHOU ' + msg);
    if (comoResolver) console.log('         -> ' + comoResolver);
    falhou = true;
}

console.log('\nVerificação da instalação — Moloni Downloader\n');

// 1. Versão do Node
if (requisitos.versaoNodeSuficiente(process.version)) {
    ok('Node ' + process.version);
} else {
    erro(
        'Node ' + process.version + ' é demasiado antigo (precisa de ' + requisitos.NODE_MINIMO + '+)',
        'Instalar a versão LTS em https://nodejs.org e correr isto outra vez'
    );
    console.log('\nParei aqui — o resto não faz sentido sem um Node recente.\n');
    process.exit(1);
}

// 2. Dependências instaladas
try {
    require('axios');
    require('express');
    require('tough-cookie');
    require('axios-cookiejar-support');
    require('dotenv');
    ok('Dependências instaladas');
} catch (err) {
    erro('Faltam dependências (' + err.message + ')', 'Correr: npm install');
    console.log('\nParei aqui — sem dependências não dá para falar com o Moloni.\n');
    process.exit(1);
}

// 3. Configuração — o carregarConfig já diz QUAIS as variáveis em falta
var config;
try {
    config = require('../src/config').carregarConfig();
    ok('Ficheiro .env completo (empresa ' + config.companyId + ')');
} catch (err) {
    erro(err.message, 'Copiar o .env.example para .env e preencher com as credenciais Moloni do cliente');
    console.log('\nParei aqui — sem credenciais não dá para testar a ligação.\n');
    process.exit(1);
}

// 4. Ligação ao Moloni e os 3 tipos de documento — o teste que interessa.
// A lógica vive em src/moloni/diagnostico.js, partilhada com o botão
// "Testar ligação" da tab de Configuração — uma só verdade, dois consumidores.
var criarAuth    = require('../src/moloni/auth').criarAuth;
var criarClient  = require('../src/moloni/client').criarClient;
var documentsMod = require('../src/moloni/documents');
var criarPdf     = require('../src/moloni/pdf').criarPdf;
var testarLigacao = require('../src/moloni/diagnostico').testarLigacao;

(async function () {
    var ano = Number(process.argv[2]) || new Date().getFullYear();
    var auth = criarAuth(config);
    var client = criarClient(config, auth);
    var pdf = criarPdf(client);

    console.log('\n  A testar a ligação ao Moloni (ano ' + ano + ')...\n');

    var relatorio = await testarLigacao({ auth, client, pdf, tipos: documentsMod.TIPOS, ano });

    for (var r of relatorio.resultados) {
        if (r.ok === true) ok(r.mensagem);
        else if (r.ok === false) erro(r.mensagem, 'Corrigir o .env e correr isto outra vez');
        else console.log('  AVISO  ' + r.mensagem);
    }

    if (!relatorio.ok) {
        console.log('\nHá problemas por resolver — ver acima. A app não vai funcionar assim.\n');
        process.exit(1);
    }
    console.log('\nEstá tudo pronto. A app pode ser usada.\n');
})().catch(function (err) {
    erro('Erro inesperado: ' + err.message);
    process.exit(1);
});
