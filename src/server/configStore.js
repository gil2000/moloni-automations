'use strict';
const fsReal = require('fs');
const dotenv = require('dotenv');
const { carregarConfig } = require('../config');

// Campos de texto: substituem sempre que vêm definidos.
const CAMPOS_TEXTO = {
    clientId:    'MOLONI_CLIENT_ID',
    username:    'MOLONI_USERNAME',
    companyId:   'MOLONI_COMPANY_ID',
    downloadDir: 'DOWNLOAD_DIR',
    estrutura:   'ESTRUTURA_PASTAS',
};

// Campos secretos: nunca saem para o formulário, e um valor vazio no POST
// significa "não mexer", nunca "apagar" — só substituem se vier preenchido.
const CAMPOS_SECRETOS = {
    clientSecret: 'MOLONI_CLIENT_SECRET',
    password:     'MOLONI_PASSWORD',
};

function ler(caminho, sistema) {
    try {
        return dotenv.parse(sistema.readFileSync(caminho));
    } catch {
        // Sem .env ainda, ou sem permissões: começa-se de uma config vazia,
        // nunca se rebenta por causa disto — é o estado normal de uma
        // instalação nova, antes do cliente preencher a tab de Configuração.
        return {};
    }
}

// O que a tab de Configuração mostra. Os campos secretos só dizem SE estão
// preenchidos — o valor em si nunca atravessa esta fronteira.
function paraFormulario(caminho, sistema = fsReal) {
    const env = ler(caminho, sistema);
    const r = {};
    for (const [campo, chave] of Object.entries(CAMPOS_TEXTO)) r[campo] = env[chave] || '';
    for (const [campo, chave] of Object.entries(CAMPOS_SECRETOS)) r[campo + 'Preenchido'] = !!env[chave];
    if (!r.downloadDir) r.downloadDir = './downloads';
    if (r.estrutura !== 'data-tipo') r.estrutura = 'tipo-data';
    return r;
}

// Funde os novos valores com o que já está no ficheiro. Secretos vazios
// mantêm o valor antigo — nunca "apaga" por engano.
function fundir(caminho, novosValores, sistema) {
    const atual = ler(caminho, sistema);
    const fundido = { ...atual };

    for (const [campo, chave] of Object.entries(CAMPOS_TEXTO)) {
        if (novosValores[campo] !== undefined) fundido[chave] = String(novosValores[campo]).trim();
    }
    for (const [campo, chave] of Object.entries(CAMPOS_SECRETOS)) {
        if (novosValores[campo]) fundido[chave] = novosValores[campo];
    }
    return fundido;
}

// Para o botão "Testar ligação": funde e valida os valores do formulário,
// mas não escreve nada — só grava quando ela carregar em "Guardar".
function validar(caminho, novosValores, sistema = fsReal) {
    return carregarConfig(fundir(caminho, novosValores, sistema)); // lança se inválido
}

// Funde, valida (reaproveitando carregarConfig — a mesma regra que vale no
// arranque do servidor) e só então escreve. Se a validação falhar, o ficheiro
// não é tocado.
function gravar(caminho, novosValores, sistema = fsReal) {
    const fundido = fundir(caminho, novosValores, sistema);
    const config = carregarConfig(fundido); // lança se ficar inválido — de propósito

    const linhas = Object.entries(fundido)
        .filter(([, valor]) => valor !== undefined && valor !== '')
        .map(([chave, valor]) => `${chave}=${valor}`);
    sistema.writeFileSync(caminho, linhas.join('\n') + '\n');

    return config;
}

module.exports = { paraFormulario, gravar, validar };
