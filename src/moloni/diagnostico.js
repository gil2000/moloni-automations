'use strict';

// Testa a ligação ao Moloni e devolve um relatório estruturado, em vez de
// imprimir — assim serve tanto o `scripts/verificar.js` (terminal) como o
// botão "Testar ligação" da tab de Configuração (JSON na UI). Uma só lógica,
// dois consumidores.
//
// auth/client/pdf vêm por injeção (mesmo padrão do resto do projeto): nos
// testes são duplos; em produção são os módulos reais já ligados à config.
async function testarLigacao({ auth, client, pdf, tipos, ano }) {
    const resultados = [];

    // A autenticação é testada primeiro e à parte: credenciais erradas são o
    // erro mais provável de um onboarding, e sem isto apareciam repetidas,
    // uma por tipo, disfarçadas de "este tipo de documento falhou".
    try {
        await auth.getToken();
        resultados.push({ tipo: 'auth', ok: true, mensagem: 'Autenticação no Moloni' });
    } catch (err) {
        resultados.push({ tipo: 'auth', ok: false, mensagem: err.message });
        return { ok: false, resultados };
    }

    for (const [chave, definicao] of Object.entries(tipos)) {
        try {
            // Uma página pequena, não o ano inteiro: só é preciso um documento
            // para provar que o fluxo do PDF funciona, e quem espera por isto
            // pode estar de pé em casa de um cliente.
            const pagina = await client.post(definicao.endpoint, { year: ano, qty: 5, offset: 0 });

            if (!Array.isArray(pagina)) {
                resultados.push({ tipo: chave, ok: false,
                    mensagem: `${definicao.label}: resposta inesperada do Moloni` });
                continue;
            }

            const emitidos = pagina.filter(d => d.status !== 0);
            if (emitidos.length === 0) {
                resultados.push({ tipo: chave, ok: null,
                    mensagem: `${definicao.label}: sem documentos emitidos em ${ano} — nada para testar` });
                continue;
            }

            const bytes = await pdf.obterBytes(emitidos[0].document_id);
            resultados.push({ tipo: chave, ok: true,
                mensagem: `${definicao.label}: PDF de "${definicao.label} ${emitidos[0].number}" = ${bytes.length} bytes` });
        } catch (err) {
            resultados.push({ tipo: chave, ok: false, mensagem: `${definicao.label}: ${err.message}` });
        }
    }

    return { ok: resultados.every(r => r.ok !== false), resultados };
}

module.exports = { testarLigacao };
