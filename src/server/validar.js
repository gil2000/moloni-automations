'use strict';

const DATA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;

// Devolve a mensagem de erro para mostrar à utilizadora, ou null se estiver tudo bem.
function validarPedido(pedido, tiposValidos) {
    const { inicio, fim, tipos } = pedido || {};

    if (!DATA_VALIDA.test(inicio || '') || !DATA_VALIDA.test(fim || '')) {
        return 'Datas em falta ou em formato inválido (YYYY-MM-DD).';
    }
    if (inicio > fim) {
        return 'A data de início é posterior à data de fim.';
    }
    if (!Array.isArray(tipos) || tipos.length === 0 || tipos.some(t => !tiposValidos[t])) {
        return 'Escolhe pelo menos um tipo de documento válido.';
    }
    return null;
}

module.exports = { validarPedido };
