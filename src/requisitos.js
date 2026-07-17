'use strict';
// Verificações do ambiente, separadas do script que as imprime — assim testam-se
// sem correr processos nem tocar na rede.

const NODE_MINIMO = 20;

// Recebe a string do process.version ("v24.16.0"). Deliberadamente sem
// dependências e sem sintaxe moderna: isto tem de correr até num Node velho,
// que é precisamente o caso que quer apanhar.
function versaoNodeSuficiente(versao, minimo) {
    if (minimo === undefined) minimo = NODE_MINIMO;
    var match = String(versao).match(/^v?(\d+)\./);
    if (!match) return false;
    return parseInt(match[1], 10) >= minimo;
}

module.exports = { versaoNodeSuficiente, NODE_MINIMO };
