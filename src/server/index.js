'use strict';
const path = require('path');
const express = require('express');
const { exec } = require('child_process');
const { tentarCarregarConfig } = require('../config');
const { criarAuth } = require('../moloni/auth');
const { criarClient } = require('../moloni/client');
const { criarDocuments, TIPOS } = require('../moloni/documents');
const { criarPdf } = require('../moloni/pdf');
const { testarLigacao } = require('../moloni/diagnostico');
const { correrJob } = require('../download/job');
const { validarPedido } = require('./validar');
const { encontrarLogos } = require('./branding');
const configStore = require('./configStore');

const PORTA = Number(process.env.PORT) || 4711;
const ENV_PATH = path.join(__dirname, '..', '..', '.env');

// Estado mutável, de propósito: numa instalação nova (sem .env) não há
// credenciais no arranque, e o cliente preenche-as na tab de Configuração em
// vez de editar um ficheiro à mão. Por isso o servidor já não sai do processo
// se faltar config — arranca sempre, e cada endpoint que precisa de
// credenciais verifica se `config` existe.
let config = null;
let baseDir = null;

function aplicarConfig(novaConfig) {
    config = novaConfig;
    baseDir = path.resolve(config.downloadDir);
}

const arranque = tentarCarregarConfig();
if (arranque.config) aplicarConfig(arranque.config);

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

// O logo da ALLPRA (fornecedor) vive em src/ui/ e vai no repo: é o mesmo para
// todos os clientes. O do cliente vive em branding/, fora do repo, porque varia
// por instalação — mesma lógica do .env. É esta divisão que permite um binário
// único quando isto for empacotado.
const brandingDir = path.join(__dirname, '..', '..', 'branding');
const uiDir = path.join(__dirname, '..', 'ui');
app.use('/branding', express.static(brandingDir));
app.get('/api/branding', (req, res) =>
    res.json(encontrarLogos({ dirFornecedor: uiDir, dirCliente: brandingDir })));

app.get('/api/tipos', (req, res) => {
    const etiquetas = {};
    for (const [chave, def] of Object.entries(TIPOS)) etiquetas[chave] = def.label;
    res.json(etiquetas);
});

// --- Configuração: o cliente preenche aqui, em vez de editar o .env à mão ---

app.get('/api/config', (req, res) => {
    res.json(configStore.paraFormulario(ENV_PATH));
});

app.post('/api/config', (req, res) => {
    try {
        aplicarConfig(configStore.gravar(ENV_PATH, req.body || {}));
        res.json({ ok: true });
    } catch (err) {
        res.status(400).json({ erro: err.message });
    }
});

// Testa os valores que estão no formulário, ainda por gravar — dá feedback
// antes de ela se comprometer a "Guardar". Reaproveita testarLigacao, a mesma
// lógica que o `npm run verificar` usa no onboarding.
app.post('/api/config/testar', async (req, res) => {
    let configTeste;
    try {
        configTeste = configStore.validar(ENV_PATH, req.body || {});
    } catch (err) {
        return res.json({ ok: false, resultados: [{ tipo: 'auth', ok: false, mensagem: err.message }] });
    }

    const auth = criarAuth(configTeste);
    const client = criarClient(configTeste, auth);
    const pdf = criarPdf(client);
    const relatorio = await testarLigacao({ auth, client, pdf, tipos: TIPOS, ano: new Date().getFullYear() });
    res.json(relatorio);
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
    if (!config) {
        return res.status(400).json({ erro: 'Falta configurar as credenciais do Moloni. Vai à aba Configuração.' });
    }

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
                baseDir, inicio, fim, tipos, estrutura: config.estrutura,
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
    if (!baseDir) return res.status(400).json({ erro: 'Ainda não há pasta configurada.' });
    abrirPasta(baseDir);
    res.json({ ok: true });
});

// App local e de utilizador único: ligar a 0.0.0.0 exporia /api/jobs e
// /api/abrir-pasta a qualquer pessoa na mesma rede (ex.: wifi de escritório).
app.listen(PORTA, '127.0.0.1', () => {
    const url = `http://localhost:${PORTA}`;
    console.log(`\n  Moloni Downloader:  ${url}`);
    if (config) {
        console.log(`  Empresa:            ${config.companyId}`);
        console.log(`  Guarda em:          ${baseDir}\n`);
    } else {
        console.log(`  Configuração em falta — abre a aba Configuração para preencher.\n`);
    }

    // Abrir o browser aqui, e não no launcher: quem sabe exatamente quando o
    // servidor está pronto é o servidor. Os launchers tentavam adivinhar com
    // polling, o que obrigava a escrever a mesma lógica duas vezes — em bash e
    // em PowerShell dentro de um .bat, com aspas dentro de aspas. A versão de
    // Windows nunca chegou a funcionar. Aqui é uma linha, testável, e igual
    // nas duas plataformas.
    if (process.env.ABRIR_BROWSER !== '0') abrirNoBrowser(url);
});
