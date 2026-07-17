'use strict';
const fs = require('fs');
const path = require('path');
const { caminhoDestino } = require('./ficheiros');

const DELAY_MS = 150;   // não sobrecarregar a API do Moloni
const TENTATIVAS = 3;

function anosAbrangidos(inicio, fim) {
    const primeiro = Number(inicio.slice(0, 4));
    const ultimo = Number(fim.slice(0, 4));
    const anos = [];
    for (let ano = primeiro; ano <= ultimo; ano++) anos.push(ano);
    return anos;
}

// Datas como strings YYYY-MM-DD comparadas lexicograficamente: ordena
// igual à ordem cronológica, e evita fusos horários.
function dentroDoIntervalo(data, inicio, fim) {
    const dia = String(data).slice(0, 10);
    return dia >= inicio && dia <= fim;
}

async function comRetry(fn, esperar) {
    let ultimoErro;
    for (let tentativa = 0; tentativa < TENTATIVAS; tentativa++) {
        try {
            return await fn();
        } catch (err) {
            ultimoErro = err;
            if (tentativa < TENTATIVAS - 1) await esperar(500 * 2 ** tentativa);
        }
    }
    throw ultimoErro;
}

function escreverEmDisco(caminho, bytes) {
    fs.mkdirSync(path.dirname(caminho), { recursive: true });
    fs.writeFileSync(caminho, bytes);
}

async function correrJob({ documents, pdf, baseDir, inicio, fim, tipos, estrutura }, aoEvento = () => {}, deps = {}) {
    const esperar = deps.esperar || (ms => new Promise(r => setTimeout(r, ms)));
    const escrever = deps.escrever || escreverEmDisco;

    // Fase 1: listar. O Moloni só filtra por ano, por isso puxa-se o ano
    // inteiro de cada tipo e filtra-se aqui.
    const alvo = [];
    for (const tipo of tipos) {
        for (const ano of anosAbrangidos(inicio, fim)) {
            aoEvento({ fase: 'listar', tipo, ano, verificados: 0 });
            const docs = await documents.listarPorAno(tipo, ano, p => aoEvento({ fase: 'listar', ...p }));
            for (const doc of docs) {
                if (doc.status === 0) continue; // rascunho: não tem PDF
                if (!dentroDoIntervalo(doc.date, inicio, fim)) continue;
                alvo.push({ doc, tipo });
            }
        }
    }
    aoEvento({ fase: 'listagem-concluida', total: alvo.length });

    // Fase 2: descarregar. Uma falha não mata o job.
    let sucesso = 0;
    const falhas = [];
    for (const { doc, tipo } of alvo) {
        try {
            const bytes = await comRetry(() => pdf.obterBytes(doc.document_id), esperar);
            escrever(caminhoDestino(baseDir, doc, tipo, estrutura), bytes);
            sucesso++;
        } catch (err) {
            falhas.push({ numero: doc.number, documentId: doc.document_id, motivo: err.message });
        }
        aoEvento({
            fase: 'descarregar',
            feitos: sucesso + falhas.length,
            total: alvo.length,
            falhas: falhas.length,
        });
        await esperar(DELAY_MS);
    }

    return { total: alvo.length, sucesso, falhas };
}

module.exports = { correrJob, anosAbrangidos, dentroDoIntervalo };
