'use strict';

// Os três tipos partilham exatamente o mesmo padrão de paginação e de
// getPDFLink — por isso são configuração, não código.
// O `label` é a fonte de verdade do nome do ficheiro: o document_type que a
// API devolve por documento é { document_type_id, saft_code } — nunca traz
// `name`. Ver ficheiros.js.
// `label` vai no nome do ficheiro (singular: "Recibo 2638 - ACME.pdf").
// `pasta` é o ramo onde o tipo é arrumado (plural: "Recibos/2026-06/").
const TIPOS = {
    recibos:       { endpoint: 'receipts/getAll',        label: 'Recibo',        pasta: 'Recibos' },
    faturas:       { endpoint: 'invoices/getAll',        label: 'Fatura',        pasta: 'Faturas' },
    faturasRecibo: { endpoint: 'invoiceReceipts/getAll', label: 'Fatura-Recibo', pasta: 'Faturas-Recibo' },
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

            // A API do Moloni responde HTTP 200 mesmo com corpo de erro. Parar em
            // silêncio aqui devolveria os documentos já recolhidos como se fossem
            // o ano completo — a contabilista receberia menos ficheiros e ninguém
            // daria por isso. Mais vale rebentar e dizer porquê.
            if (!Array.isArray(pagina)) {
                throw new Error(
                    `Resposta inesperada do Moloni em ${definicao.endpoint} ` +
                    `(ano ${ano}, offset ${offset}): ${JSON.stringify(pagina)}`
                );
            }
            if (pagina.length === 0) break; // fim legítimo

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
