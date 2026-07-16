# Moloni Downloader — app local de download em massa de documentos

**Data:** 2026-07-16
**Estado:** desenho aprovado, por implementar

## Problema

O portal web do Moloni só permite descarregar PDFs de documentos um de cada vez. Com
~900-1000 recibos por mês, a contabilista da ALLPRA gastava praticamente o tempo
integral nisto.

Existe já um script Node que resolve o caso "recibos de um mês"
(`izigo-express/izigo-backend/scripts/moloni-download-recibos.js`, testado com 935
recibos de junho/2026, 0 falhas). Este projeto generaliza-o numa aplicação:

- utilizável por quem não abre um terminal (a contabilista),
- com filtro por intervalo livre de datas,
- com três tipos de documento em vez de um,
- instalável em máquinas de clientes diferentes, cada um com a sua conta Moloni.

## Utilizadores e âmbito

- **Agora:** ALLPRA e a contabilista da ALLPRA.
- **Recibos são o caso real.** A cliente só pediu recibos. Faturas e faturas-recibo
  são generalização deliberada — se algum dos dois se portar mal, corta-se sem afetar
  o valor entregue. Isto define a ordem de ataque: recibos primeiro e a funcionar
  ponta-a-ponta, os outros dois validados a seguir.
- **Depois:** outros clientes que usem Moloni.
- **Onboarding:** manual, feito pelo Gil. Ele instala a app e preenche as credenciais
  na máquina do cliente. **A app não tem UI de configuração de credenciais nem
  registo self-service** — não é preciso e seria âmbito a mais.
- **Uso diário:** a contabilista, que não usa terminal.

## Decisões e porquês

| Decisão | Porquê |
|---|---|
| App web local (Node + Express + browser) | Reaproveita o código já testado; UI com progresso é essencial num job de vários minutos. |
| Não Electron (por agora) | ~150MB, build e assinatura por plataforma, para um formulário com duas datas e três checkboxes. O código Node por baixo é o mesmo que o Electron embrulharia depois — a porta fica aberta. |
| Não alojar no VPS | Poria credenciais Moloni e PDFs fiscais de clientes terceiros a atravessar o servidor do Gil. Responsabilidade (RGPD) que o projeto não quer. |
| Updates via `git pull` no arranque | Dá o requisito a custo quase zero e não fecha a porta ao Electron. É fita-cola assumida. |
| Sem cache de listagens (v1) | Otimização de uma lentidão ainda não medida. Ver "Riscos". |
| Pasta plana por ano-mês | Considerou-se subpastas por entidade, mas com ~900 docs/mês dava ~900 pastas de 1 ficheiro. O nome do ficheiro já inclui a entidade. |
| Um job de cada vez | A contabilista não lança dois. Serializar elimina estado partilhado. |

## Arquitetura

```
moloni-automations/
  src/
    moloni/          # sabe da API Moloni. Não sabe de ficheiros nem de HTTP-UI.
      auth.js        # token: obter + cache até expirar
      client.js      # moloniPost() — company_id, form-encoding, access_token
      documents.js   # listarPorAno(tipo, ano) → pagina até ao fim
      pdf.js         # documentId → bytes do PDF
    download/
      job.js         # orquestra: anos → docs → filtra → descarrega → escreve
      ficheiros.js   # nome do ficheiro + bucket ano-mês + sanitização
    server/          # sabe de HTTP. Não sabe nada de Moloni.
      index.js       # Express: serve UI, arranca jobs, SSE de progresso
    ui/
      index.html     # formulário + barra de progresso, sem framework
  .env               # credenciais do cliente — nunca commitado
  .env.example
  downloads/         # saída — no .gitignore, contém dados fiscais
```

**A fronteira que importa:** `src/moloni/` devolve dados e bytes, e ignora que
existam ficheiros ou UI. `src/server/` arranca jobs e transmite progresso, e ignora
que exista Moloni. O `job.js` é o único que conhece os dois lados.

Isto é o que permite, mais tarde, pôr a mesma lógica atrás de um botão no painel
admin do IziGO — troca-se o `server/`, o resto fica intacto.

## Tipos de documento

Configuração, não código:

```js
const TIPOS = {
  recibos:       { endpoint: 'receipts/getAll',        label: 'Recibo' },
  faturas:       { endpoint: 'invoices/getAll',        label: 'Fatura' },
  faturasRecibo: { endpoint: 'invoiceReceipts/getAll', label: 'Fatura-Recibo' },
};
```

A paginação e o `getPDFLink` são idênticos nos três. Se algum se portar mal, isola-se
ali sem tocar no resto.

O `label` é **fallback**, não a fonte de verdade: o nome do ficheiro usa o
`document_type.name` que a API devolve por documento (como o script atual já faz), e
só cai no `label` se vier vazio. Assim o ficheiro fica com o nome que o Moloni usa de
facto, que pode variar por empresa.

## Fluxo

1. A contabilista escolhe `data início`, `data fim` e os tipos (3 checkboxes, todos
   ligados por defeito).
2. A app deriva os anos abrangidos (`2025-11 → 2026-02` = `[2025, 2026]`).
3. Por cada tipo × ano: pagina `getAll` (qty 50, offset += 50) até vir página
   incompleta ou vazia.
4. Filtra em memória: `date` dentro do intervalo **e** `status !== 0` (rascunhos não
   têm PDF). O intervalo é **inclusivo nas duas pontas** — escolher `2026-06-01` a
   `2026-06-30` traz o mês de junho completo. O `date` do Moloni vem como
   `YYYY-MM-DD...`; compara-se pelos primeiros 10 caracteres, sem aritmética de fusos.
5. Por cada documento: `getPDFLink` → segue o `downloadBtn` → valida `%PDF` → grava.
6. Grava em `downloads/<ano>-<mês do próprio documento>/<Tipo> <nº> - <entidade>.pdf`.

O passo 6 faz com que um intervalo que atravessa meses se arrume sozinho nas pastas
certas.

### Porque é que o passo 3 é necessário (e chato)

O `getAll` do Moloni **não tem filtro de intervalo de datas** — só `year`, ou `date`
exata, ou `expiration_date` exata. Daí puxar o ano inteiro e filtrar do lado da app.
Custo: ~220 pedidos por tipo/ano (~11k recibos/ano ÷ 50).

## As duas pegadinhas do `getPDFLink` (não regredir)

Descobertas por tentativa e erro no script original. São a razão de `pdf.js` ser um
módulo próprio com testes próprios:

1. **NÃO enviar `signed: 1`.** Despoleta no Moloni um fluxo de assinatura digital
   assíncrono; a página fica presa num loop de "a preparar download" que nunca resolve
   via pedido HTTP simples. Sem `signed`, o PDF vem de imediato — e já vem certificado
   pela Autoridade Tributária, com a mesma validade legal do que se descarrega
   manualmente no portal.
2. **A `url` devolvida não é o PDF** — é uma página HTML de preview. É preciso:
   GET à `url` (guardando cookies) → extrair o `href` do `id="downloadBtn"` → resolver
   o link relativo (`new URL(href, url)`) → GET final com as mesmas cookies → PDF
   binário. Usa-se um cookie jar (`axios-cookiejar-support` + `tough-cookie`)
   partilhado entre o primeiro e o último passo.

## Configuração

`.env` na pasta da app, com as mesmas variáveis já usadas em `routes/moloni.js`:

```
MOLONI_CLIENT_ID
MOLONI_CLIENT_SECRET
MOLONI_USERNAME
MOLONI_PASSWORD
MOLONI_COMPANY_ID
DOWNLOAD_DIR        # opcional; default ./downloads
```

A app valida no arranque e, se faltar alguma, diz **qual** — em vez de rebentar mais
tarde com um erro de auth críptico.

Autenticação: OAuth2 password grant em `POST /grant/`, com os parâmetros na **query
string**, não no body (atípico, mas é como o Moloni funciona).

## Erros

Mantém-se o que já provou funcionar: uma falha num documento não mata o job — conta-se
e continua-se, com delay de 150ms entre downloads.

Acrescenta-se ao que o script tem hoje:

- **Retry com backoff (3 tentativas) por documento.** Em ~900 downloads uma falha de
  rede transitória é quase certa; hoje perde-se o documento por causa dela.
- **Relatório de falhas no fim:** lista com número e motivo, para repescar.

## Updates

O atalho que a contabilista clica corre `git pull && npm install && npm start` antes de
abrir o browser. O Gil faz push; ela recebe no arranque seguinte.

- Requer git + Node na máquina (instalados pelo Gil no onboarding) e um deploy key
  para o repositório privado.
- **Modo de falha conhecido:** se o `git pull` ou o `npm install` falharem, ela vê um
  terminal com erro em vez da app. O launcher deve capturar isso e arrancar na mesma
  com a versão local, avisando que o update falhou — nunca deixar a app sem abrir por
  causa de um update.

## Testes

- `moloni/pdf.js` — HTTP mockado. **O mais importante:** é onde vivem as duas
  pegadinhas e onde uma regressão passaria despercebida (o download "funciona", mas
  grava HTML em vez de PDF). Testar explicitamente: que não se envia `signed`; que se
  segue o `downloadBtn`; que se rejeita resposta que não comece por `%PDF`.
- `moloni/documents.js` — HTTP mockado: paginação para na página incompleta e na vazia.
- `download/ficheiros.js` — puro: sanitização de nomes, bucket ano-mês.
- `download/job.js` — com um cliente Moloni falso: filtro de intervalo, exclusão de
  rascunhos, contagem de falhas, retry.
- `server/` — sem testes, é fino de propósito.

## Riscos

- **Lentidão da listagem.** ~1300 pedidos num intervalo de 2 anos = 3-5 minutos com a
  barra de progresso parada antes do primeiro PDF. Decisão consciente de não resolver
  já. Se doer, a mitigação é cache local das listagens de anos passados (o passado não
  muda). **Primeira coisa a atacar** se houver queixas.
- **Assumir que as pegadinhas do `getPDFLink` valem para faturas e faturas-recibo.**
  É a expectativa (o endpoint é o mesmo), mas só está provado para recibos. Validar
  cedo, com um documento real de cada tipo. **Risco contido:** como a cliente só quer
  recibos, se um destes tipos não funcionar, corta-se — não bloqueia a entrega.
- **Volume desconhecido de faturas.** Os 935/mês são recibos. Não se sabe o volume de
  faturas e faturas-recibo — pode mudar a conta da lentidão.

## Validado contra a API real em 2026-07-16

Corrido `scripts/validar-tipos.js 2026` com as credenciais da ALLPRA:

| tipo | documentos em 2026 | PDF |
|---|---|---|
| recibos | 5153 | OK, 235 KB |
| faturas | 5224 | OK, 238 KB |
| faturas-recibo | 347 | OK, 299 KB |

**A suposição do `getPDFLink` confirma-se para os três tipos** — não é preciso cortar
nenhum. O risco principal do projeto está fechado.

Três factos observados que contradiziam este spec e obrigaram a corrigir o plano:

1. **`document_type` não traz `name`.** Vem `{ document_type_id, saft_code }` — ex.:
   `{"document_type_id":2,"saft_code":"RE"}`. A afirmação anterior deste spec, de que
   `document_type.name` era a fonte de verdade do nome do ficheiro e podia variar por
   empresa, era **falsa**: é sempre `undefined`, e o fallback é que sempre correu (no
   script original também). O nome usa agora o `label` do `TIPOS` diretamente.
2. **A `date` vem em ISO com fuso:** `"2026-07-16T00:00:00+0100"`, e não
   `"YYYY-MM-DD HH:mm:ss"`. O `slice(0,7)`/`slice(0,10)` continua correto, e a decisão
   de nunca usar objetos `Date` fica **provada**, não só justificada: meia-noite de 1
   de julho em Lisboa é ainda 30 de junho em UTC, e um `new Date()` arrumaria o
   documento no mês errado. Há testes a fixar isto.
3. **`number` é numérico** (ex.: `2638`), não uma string com série.

**Colisões de nome de ficheiro: medidas, zero.** Com o esquema
`<label> <number> - <entidade>.pdf` dentro da pasta do ano-mês, os 10.717 documentos
emitidos em 2026 (5153 + 5220 + 344) geram 10.717 caminhos únicos. O risco de um
ficheiro sobrepor outro em silêncio não se materializa nestes dados.

## Fora de âmbito (decidido explicitamente)

- ZIP no fim, folha de resumo CSV/Excel, subpastas por entidade — todos considerados e
  rejeitados.
- Notas de crédito (`creditNotes/getAll`) — o padrão serve, mas não foram pedidas.
- UI de credenciais, multi-empresa na mesma instalação, agendamento automático.
