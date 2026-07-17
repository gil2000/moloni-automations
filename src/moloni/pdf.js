'use strict';
const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const { TIMEOUT_MS } = require('./auth');

function criarPdf(client) {
    // Cookie jar partilhado: a página de preview abre a sessão que o pedido
    // final precisa para servir o PDF.
    const jar = new CookieJar();
    const web = wrapper(axios.create({ jar, withCredentials: true, timeout: TIMEOUT_MS }));

    async function obterBytes(documentId) {
        // PEGADINHA 1: não passar signed:1 aqui. Despoleta um fluxo de
        // assinatura digital assíncrono que nunca resolve por HTTP simples —
        // a página reemite-se em loop com um token novo a cada pedido. Sem
        // signed, o PDF vem já certificado pela AT, com a mesma validade legal
        // do que se descarrega à mão no portal.
        const { url } = await client.post('documents/getPDFLink', { document_id: documentId });
        if (!url) throw new Error('Sem URL de PDF devolvida');

        // PEGADINHA 2: a url não é o PDF — é uma página HTML de preview.
        const preview = await web.get(url);
        const match = String(preview.data).match(/id="downloadBtn">\s*<a href="([^"]+)"/);
        if (!match) throw new Error('Botão de download não encontrado na página de preview');

        const urlFinal = new URL(match[1], url).toString();
        const resposta = await web.get(urlFinal, { responseType: 'arraybuffer' });
        const bytes = Buffer.from(resposta.data);

        // Última linha de defesa: sem isto, gravava-se HTML com extensão .pdf.
        if (bytes.subarray(0, 4).toString() !== '%PDF') {
            throw new Error('Resposta final não é um PDF válido');
        }

        return bytes;
    }

    return { obterBytes };
}

module.exports = { criarPdf };
