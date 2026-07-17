'use strict';
const path = require('path');
const express = require('express');
const { exec } = require('child_process');
const { carregarConfig } = require('../config');
const { criarAuth } = require('../moloni/auth');
const { criarClient } = require('../moloni/client');
const { criarDocuments, TIPOS } = require('../moloni/documents');
const { criarPdf } = require('../moloni/pdf');
const { correrJob } = require('../download/job');
const { validarPedido } = require('./validar');

const PORTA = Number(process.env.PORT) || 4711;

// Falhar já e com uma mensagem útil, e não a meio do primeiro job.
let config;
try {
    config = carregarConfig();
} catch (err) {
    console.error('\nConfiguração inválida:\n  ' + err.message + '\n');
    process.exit(1);
}

const baseDir = path.resolve(config.downloadDir);
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'ui')));

// Um job de cada vez: a contabilista não lança dois, e serializar poupa
// estado partilhado. `clientes` são as ligações SSE abertas.
let jobAtivo = false;
const clientes = new Set();

function emitir(evento) {
    const linha = `data: ${JSON.stringify(evento)}\n\n`;
    for (const res of clientes) res.write(linha);
}

app.get('/api/tipos', (req, res) => {
    const etiquetas = {};
    for (const [chave, def] of Object.entries(TIPOS)) etiquetas[chave] = def.label;
    res.json(etiquetas);
});

app.get('/api/eventos', (req, res) => {
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
    });
    res.flushHeaders();
    clientes.add(res);
    req.on('close', () => clientes.delete(res));
});

app.post('/api/jobs', async (req, res) => {
    const erro = validarPedido(req.body, TIPOS);
    if (erro) return res.status(400).json({ erro });

    if (jobAtivo) {
        return res.status(409).json({ erro: 'Já está um download a decorrer.' });
    }

    const { inicio, fim, tipos } = req.body;
    jobAtivo = true;
    res.status(202).json({ ok: true });

    // Corre em background; o progresso vai por SSE.
    (async () => {
        try {
            const client = criarClient(config, criarAuth(config));
            const resultado = await correrJob({
                documents: criarDocuments(client),
                pdf: criarPdf(client),
                baseDir, inicio, fim, tipos,
            }, emitir);
            emitir({ fase: 'concluido', ...resultado, pasta: baseDir });
        } catch (err) {
            emitir({ fase: 'erro', motivo: err.message });
        } finally {
            jobAtivo = false;
        }
    })();
});

// Abrir uma pasta e abrir um URL são comandos diferentes no Windows
// (`explorer` vs `start`) — não os juntar.
function abrirPasta(caminho) {
    const comando = process.platform === 'darwin' ? 'open'
        : process.platform === 'win32' ? 'explorer'
        : 'xdg-open';
    exec(`${comando} "${caminho}"`);
}

function abrirNoBrowser(url) {
    const comando = process.platform === 'darwin' ? 'open'
        : process.platform === 'win32' ? 'start ""'  // o "" é o título da janela
        : 'xdg-open';
    exec(`${comando} "${url}"`, err => {
        if (err) console.log(`  (não consegui abrir o browser — abre à mão: ${url})`);
    });
}

app.post('/api/abrir-pasta', (req, res) => {
    abrirPasta(baseDir);
    res.json({ ok: true });
});

// App local e de utilizador único: ligar a 0.0.0.0 exporia /api/jobs e
// /api/abrir-pasta a qualquer pessoa na mesma rede (ex.: wifi de escritório).
app.listen(PORTA, '127.0.0.1', () => {
    const url = `http://localhost:${PORTA}`;
    console.log(`\n  Moloni Downloader:  ${url}`);
    console.log(`  Empresa:            ${config.companyId}`);
    console.log(`  Guarda em:          ${baseDir}\n`);

    // Abrir o browser aqui, e não no launcher: quem sabe exatamente quando o
    // servidor está pronto é o servidor. Os launchers tentavam adivinhar com
    // polling, o que obrigava a escrever a mesma lógica duas vezes — em bash e
    // em PowerShell dentro de um .bat, com aspas dentro de aspas. A versão de
    // Windows nunca chegou a funcionar. Aqui é uma linha, testável, e igual
    // nas duas plataformas.
    if (process.env.ABRIR_BROWSER !== '0') abrirNoBrowser(url);
});
