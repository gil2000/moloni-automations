'use strict';
const axios = require('axios');
const { BASE, TIMEOUT_MS } = require('./auth');

function criarClient(config, auth) {
    async function post(caminho, body = {}) {
        const token = await auth.getToken();

        const params = new URLSearchParams();
        params.append('company_id', String(config.companyId));
        for (const [chave, valor] of Object.entries(body)) {
            params.append(chave, String(valor));
        }

        const { data } = await axios.post(
            `${BASE}/${caminho}/?access_token=${token}`,
            params.toString(),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: TIMEOUT_MS,
            }
        );
        return data;
    }

    return { post };
}

module.exports = { criarClient };
