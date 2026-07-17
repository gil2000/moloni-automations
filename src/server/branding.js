'use strict';
const fs = require('fs');
const path = require('path');

// Os logos vivem em ficheiros, não no código: cada cliente tem os seus e não é
// preciso um fork nem um `if` por empresa. Sem ficheiros, a app não mostra nada
// e fica igual ao que era.
const EXTENSOES = ['.png', '.svg', '.jpg', '.jpeg', '.webp'];
const POSICOES = ['esquerda', 'direita'];

// Recebe o fs por injeção para os testes não precisarem de ficheiros a sério.
function encontrarLogos(dir, sistema = fs) {
    const encontrados = {};

    for (const posicao of POSICOES) {
        encontrados[posicao] = null;
        for (const ext of EXTENSOES) {
            const ficheiro = `logo-${posicao}${ext}`;
            try {
                if (sistema.existsSync(path.join(dir, ficheiro))) {
                    encontrados[posicao] = `/branding/${ficheiro}`;
                    break;
                }
            } catch {
                // Pasta inexistente ou sem permissões: o branding é opcional,
                // nunca deve impedir a app de arrancar.
            }
        }
    }

    return encontrados;
}

module.exports = { encontrarLogos, EXTENSOES, POSICOES };
