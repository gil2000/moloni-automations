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

// 4. Ligação ao Moloni e os 3 tipos de documento — o teste que interessa
var criarAuth      = require('../src/moloni/auth').criarAuth;
var criarClient    = require('../src/moloni/client').criarClient;
var documentsMod   = require('../src/moloni/documents');
var criarPdf       = require('../src/moloni/pdf').criarPdf;

(async function () {
    var ano = Number(process.argv[2]) || new Date().getFullYear();
    var client = criarClient(config, criarAuth(config));
    var pdf = criarPdf(client);

    console.log('\n  A testar a ligação ao Moloni (ano ' + ano + ')...\n');

    // A autenticação é testada primeiro e à parte: credenciais erradas são o erro
    // mais provável de um onboarding, e sem isto apareciam três vezes seguidas
    // disfarçadas de "este tipo de documento falhou".
    try {
        await criarAuth(config).getToken();
        ok('Autenticação no Moloni');
    } catch (err) {
        erro(err.message, 'Corrigir o .env e correr isto outra vez');
        console.log('\nParei aqui — sem autenticação não dá para testar mais nada.\n');
        process.exit(1);
    }

    for (var tipo of Object.keys(documentsMod.TIPOS)) {
        var etiqueta = documentsMod.TIPOS[tipo].label;
        try {
            // Pede-se UMA página pequena, não o ano inteiro. O listarPorAno pagina
            // tudo (5000+ documentos = ~100 pedidos por tipo), e aqui só é preciso
            // um documento para provar que o fluxo do PDF funciona — quem corre isto
            // está de pé em casa de um cliente à espera.
            var pagina = await client.post(documentsMod.TIPOS[tipo].endpoint, {
                year: ano, qty: 5, offset: 0,
            });

            if (!Array.isArray(pagina)) {
                erro(etiqueta + ': resposta inesperada do Moloni', 'Confirmar que esta conta tem acesso à API');
                continue;
            }

            var emitidos = pagina.filter(function (d) { return d.status !== 0; });
            if (emitidos.length === 0) {
                console.log('  AVISO  ' + etiqueta + ': sem documentos emitidos em ' + ano + ' — nada para testar');
                continue;
            }

            var bytes = await pdf.obterBytes(emitidos[0].document_id);
            ok(etiqueta + ': PDF de "' + etiqueta + ' ' + emitidos[0].number + '" = '
                + bytes.length + ' bytes');
        } catch (err) {
            erro(etiqueta + ': ' + err.message, 'Confirmar que esta conta Moloni tem acesso a este tipo de documento');
        }
    }

    if (falhou) {
        console.log('\nHá problemas por resolver — ver acima. A app não vai funcionar assim.\n');
        process.exit(1);
    }
    console.log('\nEstá tudo pronto. A app pode ser usada.\n');
})().catch(function (err) {
    erro('Erro inesperado: ' + err.message);
    process.exit(1);
});
