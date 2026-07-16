'use strict';

// Os três tipos partilham exatamente o mesmo padrão de paginação e de
// getPDFLink — por isso são configuração, não código.
// O `label` é só fallback: o nome do ficheiro usa o document_type.name que a
// API devolve por documento, que pode variar por empresa. Ver ficheiros.js.
const TIPOS = {
    recibos:       { endpoint: 'receipts/getAll',        label: 'Recibo' },
    faturas:       { endpoint: 'invoices/getAll',        label: 'Fatura' },
    faturasRecibo: { endpoint: 'invoiceReceipts/getAll', label: 'Fatura-Recibo' },
};

const QTY = 50; // máximo aceite pelo Moloni

function criarDocuments(client) {
    // O Moloni não tem filtro de intervalo de datas — só `year`. Puxa-se o ano
    // inteiro; o filtro do intervalo é feito pelo job.
    async function listarPorAno(tipo, ano, aoProgredir = () => {}) {
        const definicao = TIPOS[tipo];
        if (!definicao) throw new Error(`Tipo de documento desconhecido: ${tipo}`);

        const todos = [];
        let offset = 0;

        while (true) {
            const pagina = await client.post(definicao.endpoint, { year: ano, qty: QTY, offset });
            if (!Array.isArray(pagina) || pagina.length === 0) break;

            todos.push(...pagina);
            aoProgredir({ tipo, ano, verificados: todos.length });

            if (pagina.length < QTY) break; // última página
            offset += QTY;
        }

        return todos;
    }

    return { listarPorAno };
}

module.exports = { criarDocuments, TIPOS, QTY };
