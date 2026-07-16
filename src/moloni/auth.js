'use strict';
const axios = require('axios');

const BASE = 'https://api.moloni.pt/v1';

// Sem timeout, um pedido pendurado nunca rejeita e o job fica preso para
// sempre — o retry do job.js só apanha erros, não apanha silêncio.
const TIMEOUT_MS = 30000;

// Atípico mas correto: o Moloni quer as credenciais na query string do
// /grant/, não no body.
function criarAuth(config, { agora = () => Date.now() } = {}) {
    let token = null;
    let expiraEm = 0;

    async function getToken() {
        if (token && agora() < expiraEm) return token;

        const { data } = await axios.post(`${BASE}/grant/`, null, {
            params: {
                grant_type:    'password',
                client_id:     config.clientId,
                client_secret: config.clientSecret,
                username:      config.username,
                password:      config.password,
            },
            timeout: TIMEOUT_MS,
        });

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
