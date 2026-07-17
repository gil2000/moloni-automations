'use strict';
const { app, BrowserWindow } = require('electron');
// O motor é o mesmo da versão web — nada aqui é copiado, é o mesmo ficheiro.
const { criarServidor } = require('../src/server/index.js');

let janelaPrincipal = null;
let fecharServidor = null;

async function arrancar() {
    // porta:0 — o SO escolhe uma porta livre. Evita colidir com a versão web
    // (npm start, sempre em 4711) se as duas estiverem a correr ao mesmo
    // tempo nesta máquina, durante o desenvolvimento.
    // abrirBrowser:false — a janela do Electron É o browser; abrir mais um
    // externo não faria sentido nenhum.
    const { url, fechar } = await criarServidor({ porta: 0, abrirBrowser: false });
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
