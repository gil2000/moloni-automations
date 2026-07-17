'use strict';
const axios = require('axios');

const BASE = 'https://api.moloni.pt/v1';

// Sem timeout, um pedido pendurado nunca rejeita e o job fica preso para
// sempre — o retry do job.js só apanha erros, não apanha silêncio.
const TIMEOUT_MS = 30000;

// O Moloni responde 400 com um corpo estruturado que diz qual das credenciais
// está errada. Sem traduzir isto, quem instala — e a contabilista, na UI — via
// só "Request failed with status code 400", que não diz onde procurar.
// Erros de rede passam intactos: é deles que o retry do job.js vive.
function traduzirErroDeAuth(err) {
    const corpo = err.response?.data;
    if (!corpo?.error) return err;

    if (corpo.error === 'invalid_grant') {
        return new Error(
            'Credenciais Moloni inválidas: MOLONI_USERNAME ou MOLONI_PASSWORD estão errados.'
        );
    }
    if (corpo.error === 'invalid_client') {
        return new Error(
            'Aplicação Moloni inválida: MOLONI_CLIENT_ID ou MOLONI_CLIENT_SECRET estão errados.'
        );
    }
    return new Error(
        'O Moloni recusou a autenticação: ' + (corpo.error_description || corpo.error)
    );
}

// Atípico mas correto: o Moloni quer as credenciais na query string do
// /grant/, não no body.
function criarAuth(config, { agora = () => Date.now() } = {}) {
    let token = null;
    let expiraEm = 0;

    async function getToken() {
        if (token && agora() < expiraEm) return token;

        let data;
        try {
            ({ data } = await axios.post(`${BASE}/grant/`, null, {
                params: {
                    grant_type:    'password',
                    client_id:     config.clientId,
                    client_secret: config.clientSecret,
                    username:      config.username,
                    password:      config.password,
                },
                timeout: TIMEOUT_MS,
            }));
        } catch (err) {
            throw traduzirErroDeAuth(err);
        }

        if (!data.access_token) {
            throw new Error('Moloni auth falhou: ' + JSON.stringify(data));
        }

        token = data.access_token;
        // Margem de 60s para não usar um token que expira a meio do pedido.
        expiraEm = agora() + ((data.expires_in || 3600) - 60) * 1000;
        return token;
    }

    return { getToken };
}

module.exports = { criarAuth, BASE, TIMEOUT_MS };
