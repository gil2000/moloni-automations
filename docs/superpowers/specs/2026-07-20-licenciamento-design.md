# Licenciamento e controlo de acesso — desenho

**Data:** 2026-07-20
**Estado:** desenho aprovado, por implementar

## Problema

O Moloni Downloader vai passar a ser vendido por subscrição a clientes além da
ALLPRA (primeiro a Fiscontabil). A app corre localmente na máquina de cada cliente
(`.exe`) — uma vez instalada, não tem forma de saber se o cliente deixou de pagar.
É preciso um mecanismo para suspender o acesso a quem não paga.

## Porque não uma plataforma web

Considerou-se virar tudo numa plataforma web com login, mas descartou-se, por três
razões técnicas reais (não preferência):

1. **CORS** — o browser do cliente não pode chamar `api.moloni.pt` diretamente; a
   API do Moloni é para chamadas servidor-a-servidor, e não controlamos essa
   configuração.
2. **Credenciais expostas** — para o browser falar com o Moloni, as credenciais
   teriam de estar no próprio browser (JavaScript é sempre inspecionável).
3. **A pegadinha do `getPDFLink`** depende de manter cookies entre dois pedidos —
   frágil no browser, que bloqueia cada vez mais cookies de terceiros.

Foi por isto que a app nunca foi "só browser" — sempre precisou de um processo Node
a falar com o Moloni. O processamento tem de correr **algures** — local (como está)
ou central (SaaS). Escolheu-se manter **local**, porque centralizar poria PDFs
fiscais e credenciais Moloni de todos os clientes a atravessar o servidor do Gil —
a responsabilidade RGPD que o projeto decidiu evitar desde o início.

**Pagamento e dados são problemas independentes:** o pagamento (IfThenPay) pode ser
central sem obrigar os PDFs a sair da máquina do cliente. É isso que este desenho faz.

## Decisões (e porquês)

| Decisão | Porquê |
|---|---|
| Controlo **manual** primeiro | Com 2-10 clientes, o Gil dá conta de quem não pagou. Entrega o controlo de acesso em dias, sem webhooks/mandatos/dunning. |
| Licença ligada ao **`company_id` do Moloni** | A app já o tem na config. Uma conta Moloni = uma subscrição, mapeia à faturação. Chave partilhada com outro não serve (só vale para a empresa dele). Zero passos extra no onboarding. |
| Suspensa = **app abre, download bloqueado** | Dá caminho para resolver, em vez de porta na cara. Encaixa no guard que já existe. |
| Gestão pelo **editor de tabelas do Supabase** | Já se usa Supabase. Para 2-10 clientes, gerir licenças é editar uma linha. Zero painel a construir. |
| **Serviço próprio separado no Render** | Node/Express, o mesmo músculo já usado (izigo-backend, allpra-automation). Isolado — não mistura com outras apps. Não exige o VPS (ainda por montar). Contrato estável: muda-se para o VPS depois sem tocar nas apps instaladas. |
| **Fail-open** quando o servidor está em baixo e não há cache | Um cliente que paga nunca pode ficar bloqueado por uma falha do servidor do Gil. Modelo de ameaça baixo (contabilistas, não piratas). |

## Arquitetura

Três peças pequenas:

```
   App (cada cliente)                Render                    Supabase
   ┌─────────────────┐          ┌──────────────┐          ┌──────────────┐
   │ verificador de  │──HTTP──► │ serviço de   │──SQL───► │ tabela       │
   │ licença         │ ◄────────│ licenças     │ ◄────────│ `licencas`   │
   │ (+ cache local) │  estado  │ (1 endpoint) │  estado  │              │
   └─────────────────┘          └──────────────┘          └──────────────┘
         │                                                        ▲
         ▼ decide                                        Gil edita à mão
   bloqueia / avisa / deixa                              (editor do Supabase)
```

- **Tabela `licencas`** (Supabase Postgres) — fonte de verdade, editada à mão.
- **Serviço de licenças** (Render, Node/Express) — um endpoint de verificação. É o
  contrato estável; quando houver VPS, muda-se só o URL.
- **Verificador na app** (`src/licenca/`) — serve as **duas versões** (web e `.exe`),
  porque vive no `src/` partilhado. Chama o serviço, faz cache do último veredicto,
  e decide.

**Princípio central:** a app pergunta o **seu próprio estado** para se auto-bloquear.
Não é autenticação — é a app a decidir se se porta bem. Por isso o `company_id` que
já tem na config chega como identificador; não há chave nova para distribuir. (Um
utilizador malicioso pode sempre contornar remendando o binário — é verdade de todo
o software desktop. O objetivo é "manter os honestos honestos", proporcional ao
público.)

## A tabela `licencas`

| coluna | tipo | exemplo | para quê |
|---|---|---|---|
| `company_id` | text (única) | `331227` | chave — o Moloni company_id que a app conhece |
| `cliente` | text | `ALLPRA` | orientação do Gil no Supabase |
| `estado` | text | `ativa` | `ativa` / `aviso` / `suspensa` |
| `aviso_ate` | date (nullable) | `2026-07-25` | quando em `aviso`, até quando dura a tolerância |
| `mensagem` | text (nullable) | | mensagem à medida para o cliente; senão usa a por defeito |
| `notas` | text (nullable) | `pago em 03/07` | notas do Gil |
| `criada_em` | timestamptz | | auditoria |
| `atualizada_em` | timestamptz | | auditoria |

**`company_id` é text, não int** — os IDs do Moloni cabem em int hoje, mas guardar
como texto evita surpresas de normalização e é o que a app envia no URL.

**Fluxo de gestão do Gil (no Supabase):**
- Cliente novo que pagou → cria linha, `estado = ativa`
- Não pagou → `estado = aviso`, `aviso_ate = hoje + 3 dias`
- **Ao 3.º dia corta sozinho** — o servidor vê que passou o `aviso_ate` e responde
  `suspensa`. O Gil não faz nada nesse dia.
- Pagou → volta a `ativa`
- Cortar já, sem tolerância → `estado = suspensa`

## O serviço de licenças (Render)

**Endpoint único:** `GET /licenca/:companyId`

Resposta:
```json
{ "estado": "ativa", "aviso_ate": null, "mensagem": null }
```

Lógica do servidor:
1. Procura a linha por `company_id`.
2. **Não encontrada → `suspensa`** (com mensagem "licença não encontrada, contacta o
   fornecedor"). Não-encontrada = não é cliente, ou foi removido. É diferente de
   servidor-em-baixo (que o cliente trata do lado dele).
3. `estado = aviso` **e** hoje > `aviso_ate` → devolve `suspensa` (calculado; a linha
   continua `aviso` no Supabase, mas a resposta é `suspensa`).
4. Caso contrário → devolve o `estado` da linha, com `aviso_ate` e `mensagem`.

A `mensagem` vem do servidor para o Gil poder afinar o texto sem atualizar as apps
instaladas. Se a coluna `mensagem` estiver vazia, o servidor devolve uma por defeito
adequada ao estado.

**Config:** `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` no `.env` do serviço (service key,
porque é servidor-a-servidor — nunca exposta ao cliente). Deploy: novo serviço no
Render, isolado dos existentes.

**Onde vive o código:** subpasta `servico-licencas/` **neste mesmo repo**, com o seu
`package.json` próprio — tal como `electron/` já é uma subpasta com deploy separado. No
Render, o "root directory" do serviço aponta para essa subpasta. Um repo só para um dev
solo gerir; e não há segredos no código (a service key vive no env do Render, nunca
commitada), por isso o repo público não é problema — a lógica de licenciamento é trivial
e a segurança não depende de a esconder. Os módulos do lado do cliente (`src/licenca/`,
o guard, a UI) vivem na raiz do repo, com o resto da app.

## O verificador na app (`src/licenca/verificador.js`)

`verificarLicenca(companyId, opcoes)` → `{ estado, aviso_ate, mensagem, origem }`,
onde `origem` ∈ `servidor` | `cache` | `fail-open`.

**Quando corre:** dois pontos, ambos já naturais na app —
1. `GET /api/licenca`, que a UI chama **depois** de desenhar a página (a janela nunca
   fica à espera do veredicto), para decidir se mostra faixa / bloqueia o botão.
2. No guard do `POST /api/jobs`, **antes de cada download** — o ponto real de bloqueio,
   o mesmo sítio do guard de config já existente.

O caminho da cache é injetado por quem arranca o servidor (como o `envPath` já é):
`userData` no Electron, raiz do projeto na versão web.

**Resolução (a parte que protege quem paga):**

| Situação | Resultado |
|---|---|
| Servidor responde | Usa a resposta e **grava em cache** (ficheiro local, ao lado do `.env`) |
| Servidor em baixo, **com cache** | Usa o último veredicto (era `ativa` → trabalha; era `suspensa` → suspenso) |
| Servidor em baixo, **sem cache** (1.ª vez) | **Fail-open** (deixa passar) com aviso discreto |

Sem limite de idade da cache na v1 — decisão consciente. O caso que isso não cobre
(alguém que deixa de pagar e bloqueia o domínio, ficando com a cache `ativa` velha)
é sofisticado, improvável neste público, e defendê-lo à custa de bloquear clientes
honestos durante falhas do servidor é mau negócio. Consistente com o "modelo de
ameaça baixo" do projeto. Se surgir abuso, nota-se (poucos clientes) e trata-se então.

**Timeout curto** (~8s) para o arranque não ficar lento; e como corre em segundo
plano, nem isso se nota.

## Integração no resto da app

Reaproveita fronteiras que já existem — não é arquitetura nova:

- **`GET /api/licenca`** no servidor da app → a UI chama para saber se mostra faixa
  de aviso / bloqueia o botão. Devolve `{ estado, aviso_ate, mensagem }`.
- **`POST /api/jobs`** chama `verificarLicenca` antes de arrancar; se `suspensa`,
  devolve **403** com a mensagem — o mesmo padrão do guard de config (`if (!config)`).
- **UI:** ao carregar, faz `fetch('/api/licenca')`. `suspensa` → desativa o botão
  Descarregar + mostra a mensagem de renovação. `aviso` → faixa de aviso com a data,
  mas continua a funcionar. `ativa` → nada.
- **URL do serviço** fica como default no código (como o izigo faz com o backend),
  sobreponível por env para dev/testes.

O verificador é injetável no guard (como `documents`/`pdf` já são no `job.js`), para
os testes usarem um duplo em vez de rede.

## Estados visuais na app

- **`ativa`** — sem alteração.
- **`aviso`** — faixa: *"Pagamento em atraso. Regulariza até DD/MM ou o acesso será
  suspenso."* Download continua a funcionar.
- **`suspensa`** — botão Descarregar bloqueado; *"Subscrição suspensa. Regulariza
  para reativar."* (ou a `mensagem` à medida do servidor). App abre e mostra a config
  na mesma.

## Erros

- Servidor em baixo / timeout / resposta malformada → tratado como "sem rede"
  (cache ou fail-open, ver acima). Uma resposta que não se percebe nunca bloqueia.
- `company_id` ausente na config (instalação por configurar) → não há o que
  verificar; a app já está bloqueada para download pelo guard de config existente.

## Testes

Mesmo estilo do resto do projeto (HTTP e fs mockados, `node:test`):

- **Serviço** (`GET /licenca/:id`, cliente Supabase mockado):
  encontrada+ativa → `ativa`; `aviso` dentro da data → `aviso`; `aviso` fora da data
  → `suspensa`; não encontrada → `suspensa`.
- **Verificador** (HTTP + fs mockados): passthrough dos 3 estados; sem-rede+cache →
  cache; sem-rede+sem-cache → fail-open; grava cache após sucesso.
- **Guard do `/api/jobs`** (verificador injetado): `suspensa` → 403; `ativa`/`aviso`
  → deixa passar.

## Fora de âmbito (fase de automação, mais tarde)

- Webhooks do IfThenPay a atualizar o estado automaticamente
- Débito direto / mandatos recorrentes
- Lógica de retenção (dunning)
- Período de trial formal (por agora: o Gil cria a linha `ativa` durante o trial)
- Painel de administração próprio (por agora: editor do Supabase)

## Relação com o resto do projeto

- **Independente do trabalho do `.exe`/Electron** — vive no `src/` partilhado, logo
  serve web e desktop, e não bloqueia o que já funciona.
- O URL do serviço de licenças e o mecanismo de auto-update (a construir) apontam
  ambos para "a app fala com um servidor pequeno do Gil" — há sinergia futura, mas
  não dependência agora.
