'use strict';
const path = require('path');
const { app, BrowserWindow } = require('electron');
// O motor é o mesmo da versão web — nada aqui é copiado, é o mesmo ficheiro.
const { criarServidor } = require('../src/server/index.js');

let janelaPrincipal = null;
let fecharServidor = null;

async function arrancar() {
    // A pasta de instalação do .exe (onde o main.js e o resto do código
    // vivem) normalmente não é gravável — um update pode substituí-la ou
    // limpá-la a qualquer momento, e no Windows pode nem ter permissão de
    // escrita (ex.: instalada em Program Files). O .env e os logos do
    // cliente são DADOS, não código: vivem em userData, que o próprio SO
    // garante ser gravável e específica deste utilizador.
    //   Windows: %APPDATA%\moloni-downloader-desktop
    //   macOS:   ~/Library/Application Support/moloni-downloader-desktop
    const dadosDaApp = app.getPath('userData');

    const { url, fechar } = await criarServidor({
        porta: 0,           // o SO escolhe uma porta livre — evita colidir com
                             // a versão web (sempre em 4711) durante o dev.
        abrirBrowser: false, // a janela do Electron É o browser.
        envPath: path.join(dadosDaApp, '.env'),
        brandingDir: path.join(dadosDaApp, 'branding'),
        // Sugestão só usada quando ainda não há downloadDir gravado. Absoluto
        // de propósito — "./downloads" resolveria contra o cwd do processo,
        // imprevisível dentro dum .exe instalado.
        downloadDirPadrao: path.join(app.getPath('documents'), 'Moloni Downloads'),
    });
    fecharServidor = fechar;

    janelaPrincipal = new BrowserWindow({
        width: 820,
        height: 780,
        title: 'Moloni Downloader',
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    janelaPrincipal.setMenuBarVisibility(false);
    janelaPrincipal.loadURL(url);

    janelaPrincipal.on('closed', () => {
        janelaPrincipal = null;
    });
}

app.whenReady().then(arrancar);

// Convenção do Electron: no Mac as apps ficam vivas com todas as janelas
// fechadas (o utilizador reabre pelo dock); no Windows/Linux, fechar a
// janela fecha a app. O alvo principal é Windows — isto só importa se
// alguém correr em Mac durante o desenvolvimento.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) arrancar();
});

app.on('before-quit', () => {
    if (fecharServidor) fecharServidor();
});
