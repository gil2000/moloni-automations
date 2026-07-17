'use strict';
// Diagnóstico: confirma que os 3 tipos de documento listam e descarregam.
// Uso: node scripts/validar-tipos.js [ano]
const { carregarConfig } = require('../src/config');
const { criarAuth } = require('../src/moloni/auth');
const { criarClient } = require('../src/moloni/client');
const { criarDocuments, TIPOS } = require('../src/moloni/documents');
const { criarPdf } = require('../src/moloni/pdf');

(async () => {
    const ano = Number(process.argv[2]) || new Date().getFullYear();
    const config = carregarConfig();
    const client = criarClient(config, criarAuth(config));
    const documents = criarDocuments(client);
    const pdf = criarPdf(client);

    for (const tipo of Object.keys(TIPOS)) {
        try {
            const docs = await documents.listarPorAno(tipo, ano);
            const emitidos = docs.filter(d => d.status !== 0);
            if (emitidos.length === 0) {
                console.log(`AVISO  ${tipo}: 0 documentos emitidos em ${ano} — nada para validar`);
                continue;
            }
            const doc = emitidos[0];
            const bytes = await pdf.obterBytes(doc.document_id);
            console.log(
                `OK     ${tipo}: ${docs.length} docs em ${ano}; ` +
                `PDF de "${TIPOS[tipo].label} ${doc.number}" = ${bytes.length} bytes`
            );
        } catch (err) {
            console.log(`FALHOU ${tipo}: ${err.message}`);
        }
    }
})().catch(err => {
    console.error('Erro fatal:', err.message);
    process.exit(1);
});
