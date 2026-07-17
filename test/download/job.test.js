'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { correrJob, anosAbrangidos, dentroDoIntervalo } = require('../../src/download/job');

// Forma REAL do getAll (ver Task 6): `date` em ISO com fuso, `number` numérico,
// `document_type` sem `name`. A data recebida aqui é só "YYYY-MM-DD" por
// comodidade do teste, e é completada com a hora e o fuso que o Moloni devolve.
const doc = (id, dia, extra = {}) => ({
    document_id: id, number: 1000 + id, date: `${dia}T00:00:00+0100`, status: 1,
    entity_name: `Cliente ${id}`,
    document_type: { document_type_id: 2, saft_code: 'RE' }, ...extra,
});

// deps que não tocam no disco nem esperam de verdade.
function depsFalsas() {
    const escritos = [];
    return {
        escritos,
        esperar: async () => {},
        escrever: (caminho, bytes) => escritos.push({ caminho, bytes }),
    };
}

test('anosAbrangidos cobre o intervalo inteiro', () => {
    assert.deepStrictEqual(anosAbrangidos('2026-06-01', '2026-06-30'), [2026]);
    assert.deepStrictEqual(anosAbrangidos('2025-11-01', '2026-02-28'), [2025, 2026]);
    assert.deepStrictEqual(anosAbrangidos('2024-01-01', '2026-01-01'), [2024, 2025, 2026]);
});

test('dentroDoIntervalo é inclusivo nas duas pontas', () => {
    // Formato real do Moloni: ISO com fuso.
    assert.ok(dentroDoIntervalo('2026-06-01T00:00:00+0100', '2026-06-01', '2026-06-30'));
    assert.ok(dentroDoIntervalo('2026-06-30T23:59:59+0100', '2026-06-01', '2026-06-30'));
    assert.ok(!dentroDoIntervalo('2026-05-31T00:00:00+0100', '2026-06-01', '2026-06-30'));
    assert.ok(!dentroDoIntervalo('2026-07-01T00:00:00+0100', '2026-06-01', '2026-06-30'));
});

// O primeiro dia do intervalo em hora de Lisboa é ainda o dia anterior em UTC.
// Fatiar a string mantém o documento dentro do intervalo que a contabilista
// pediu; converter para Date deixá-lo-ia de fora.
test('dentroDoIntervalo não é enganado pelo fuso horário', () => {
    assert.ok(dentroDoIntervalo('2026-07-01T00:00:00+0100', '2026-07-01', '2026-07-31'));
});

test('descarrega só os documentos dentro do intervalo', async () => {
    const documents = { listarPorAno: async () => [
        doc(1, '2026-05-31'), doc(2, '2026-06-15'), doc(3, '2026-07-01'),
    ]};
    const pdf = { obterBytes: async () => Buffer.from('%PDF-x') };
    const deps = depsFalsas();

    const r = await correrJob(
        { documents, pdf, baseDir: '/saida', inicio: '2026-06-01', fim: '2026-06-30', tipos: ['recibos'] },
        () => {}, deps
    );

    assert.strictEqual(r.total, 1);
    assert.strictEqual(r.sucesso, 1);
    assert.strictEqual(deps.escritos.length, 1);
    assert.ok(deps.escritos[0].caminho.includes('2026-06'));
    assert.ok(deps.escritos[0].caminho.includes('1002'));
});

test('ignora rascunhos (status 0) — não têm PDF', async () => {
    const documents = { listarPorAno: async () => [
        doc(1, '2026-06-15', { status: 0 }), doc(2, '2026-06-16'),
    ]};
    const pdf = { obterBytes: async () => Buffer.from('%PDF-x') };
    const deps = depsFalsas();

    const r = await correrJob(
        { documents, pdf, baseDir: '/s', inicio: '2026-06-01', fim: '2026-06-30', tipos: ['recibos'] },
        () => {}, deps
    );
    assert.strictEqual(r.total, 1);
});

test('uma falha não mata o job e entra no relatório', async () => {
    const documents = { listarPorAno: async () => [doc(1, '2026-06-10'), doc(2, '2026-06-11')] };
    const pdf = {
        obterBytes: async id => {
            if (id === 1) throw new Error('boom');
            return Buffer.from('%PDF-x');
        },
    };
    const deps = depsFalsas();

    const r = await correrJob(
        { documents, pdf, baseDir: '/s', inicio: '2026-06-01', fim: '2026-06-30', tipos: ['recibos'] },
        () => {}, deps
    );

    assert.strictEqual(r.sucesso, 1);
    assert.strictEqual(r.falhas.length, 1);
    assert.deepStrictEqual(r.falhas[0], { numero: 1001, documentId: 1, motivo: 'boom' });
});

test('a estrutura é passada até ao caminho de gravação', async () => {
    const documents = { listarPorAno: async () => [doc(1, '2026-06-10')] };
    const pdf = { obterBytes: async () => Buffer.from('%PDF-x') };
    const deps = depsFalsas();

    await correrJob(
        { documents, pdf, baseDir: '/s', inicio: '2026-06-01', fim: '2026-06-30',
          tipos: ['recibos'], estrutura: 'data-tipo' },
        () => {}, deps
    );

    // data-tipo põe o mês antes do tipo: /s/2026-06/Recibos/...
    const partes = deps.escritos[0].caminho.split('/');
    assert.strictEqual(partes[2], '2026-06');
    assert.strictEqual(partes[3], 'Recibos');
});

test('sem estrutura pedida, mantém tipo-data (não muda instalações existentes)', async () => {
    const documents = { listarPorAno: async () => [doc(1, '2026-06-10')] };
    const pdf = { obterBytes: async () => Buffer.from('%PDF-x') };
    const deps = depsFalsas();

    await correrJob(
        { documents, pdf, baseDir: '/s', inicio: '2026-06-01', fim: '2026-06-30', tipos: ['recibos'] },
        () => {}, deps
    );

    const partes = deps.escritos[0].caminho.split('/');
    assert.strictEqual(partes[2], 'Recibos');
    assert.strictEqual(partes[3], '2026-06');
});

test('faz retry 3x antes de desistir de um documento', async () => {
    let tentativas = 0;
    const documents = { listarPorAno: async () => [doc(1, '2026-06-10')] };
    const pdf = {
        obterBytes: async () => {
            tentativas++;
            if (tentativas < 3) throw new Error('rede');
            return Buffer.from('%PDF-x');
        },
    };
    const deps = depsFalsas();

    const r = await correrJob(
        { documents, pdf, baseDir: '/s', inicio: '2026-06-01', fim: '2026-06-30', tipos: ['recibos'] },
        () => {}, deps
    );

    assert.strictEqual(tentativas, 3);
    assert.strictEqual(r.sucesso, 1);
});

test('emite progresso de listagem e de download', async () => {
    const documents = { listarPorAno: async () => [doc(1, '2026-06-10')] };
    const pdf = { obterBytes: async () => Buffer.from('%PDF-x') };
    const eventos = [];

    await correrJob(
        { documents, pdf, baseDir: '/s', inicio: '2026-06-01', fim: '2026-06-30', tipos: ['recibos'] },
        e => eventos.push(e), depsFalsas()
    );

    assert.ok(eventos.some(e => e.fase === 'listar'));
    assert.ok(eventos.some(e => e.fase === 'listagem-concluida' && e.total === 1));
    assert.ok(eventos.some(e => e.fase === 'descarregar' && e.feitos === 1 && e.total === 1));
});
