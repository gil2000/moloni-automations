'use strict';
require('dotenv').config({ quiet: true });

const OBRIGATORIAS = [
    'MOLONI_CLIENT_ID',
    'MOLONI_CLIENT_SECRET',
    'MOLONI_USERNAME',
    'MOLONI_PASSWORD',
    'MOLONI_COMPANY_ID',
];

// Recebe o env por parâmetro para ser testável sem mexer no process.env global.
function carregarConfig(env = process.env) {
    const faltam = OBRIGATORIAS.filter(chave => !env[chave]);
    if (faltam.length > 0) {
        throw new Error(
            `Faltam variáveis no .env: ${faltam.join(', ')}. Ver .env.example.`
        );
    }

    const companyId = Number(env.MOLONI_COMPANY_ID);
    if (!Number.isInteger(companyId) || companyId <= 0) {
        throw new Error(
            `MOLONI_COMPANY_ID inválido: "${env.MOLONI_COMPANY_ID}" — deve ser um inteiro positivo.`
        );
    }

    return {
        clientId:     env.MOLONI_CLIENT_ID,
        clientSecret: env.MOLONI_CLIENT_SECRET,
        username:     env.MOLONI_USERNAME,
        password:     env.MOLONI_PASSWORD,
        companyId,
        downloadDir:  env.DOWNLOAD_DIR || './downloads',
    };
}

module.exports = { carregarConfig };
