# Moloni Downloader

Descarrega em massa os PDFs de documentos do Moloni (recibos, faturas,
faturas-recibo) para um intervalo de datas. O portal do Moloni só deixa
descarregar um de cada vez.

## Utilizar

Duplo-clique em **Descarregar Recibos.command** (macOS) ou
**Descarregar Recibos.bat** (Windows). Abre no browser: escolhe as datas, os
tipos, e carrega em Descarregar.

**Não feches a janela preta (o Terminal) enquanto estiveres a descarregar** —
é ela que faz o trabalho. Fechá-la cancela o download a meio. Quando acabares,
fecha-a para terminar a aplicação.

Um mês de recibos demora ~10-15 minutos. A barra fica parada durante os
primeiros minutos enquanto procura os documentos — é normal.

Os PDFs ficam em `downloads/<Tipo>/<ano>-<mês>/` — ex.: `downloads/Recibos/2026-06/`.

## Instalar num PC novo

Requer [Node.js](https://nodejs.org) 20+ e git.

```bash
git clone <repo> && cd moloni-automations
npm install
cp .env.example .env   # preencher com as credenciais Moloni do cliente
```

**Antes de sair de lá, correr:**

```bash
npm run verificar
```

Verifica, por ordem e parando no primeiro problema: versão do Node, dependências
instaladas, `.env` completo (diz **quais** variáveis faltam), autenticação no
Moloni (distingue username/password errados de client_id/secret errados), e o
download de um PDF de cada tipo. Se isto passa, a app funciona.

**Logos (opcional).** Para a app mostrar as marcas do cliente, criar uma pasta
`branding/` na raiz com:

```
branding/logo-esquerda.png    # ex.: o logo do cliente
branding/logo-direita.png     # ex.: o logo do contabilista dele
```

Aceita `.png`, `.svg`, `.jpg` e `.webp`. Sem esses ficheiros, a app não mostra
cabeçalho nenhum. A pasta está no `.gitignore` de propósito: o repo é público e
não deve carregar marcas de terceiros, e cada instalação tem as suas.

Depois, criar um atalho do launcher no ambiente de trabalho.

## Atualizações

O launcher faz `git pull` no arranque. Basta fazer push — o cliente recebe da
próxima vez que abrir. Se o update falhar, a app abre à mesma com a versão
instalada.

## Desenvolver

```bash
npm test           # testes unitários
npm run verificar  # diagnóstico contra a API real
```

Desenho e decisões: `docs/superpowers/specs/2026-07-16-moloni-downloader-design.md`

**Aviso:** `downloads/` tem dados fiscais de clientes e `.env` tem credenciais.
Ambos estão no `.gitignore` — nunca os commitar.
