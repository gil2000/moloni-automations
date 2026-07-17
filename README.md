# Moloni Downloader

Descarrega em massa os PDFs de documentos do Moloni (recibos, faturas,
faturas-recibo) para um intervalo de datas. O portal do Moloni só deixa
descarregar um de cada vez.

## Utilizar

Duplo-clique em **Descarregar Recibos.command** (macOS) ou
**Descarregar Recibos.bat** (Windows). Abre no browser: escolhe as datas, os
tipos, e carrega em Descarregar.

Os PDFs ficam em `downloads/<ano>-<mês>/`.

## Instalar num PC novo

Requer [Node.js](https://nodejs.org) 20+ e git.

```bash
git clone <repo> && cd moloni-automations
npm install
cp .env.example .env   # preencher com as credenciais Moloni do cliente
```

Substituir `<repo>` pelo URL do repositório git.

Confirmar que funciona antes de entregar:

```bash
node scripts/validar-tipos.js
```

Depois, criar um atalho do launcher no ambiente de trabalho.

## Atualizações

O launcher faz `git pull` no arranque. Basta fazer push — o cliente recebe da
próxima vez que abrir. Se o update falhar, a app abre à mesma com a versão
instalada.

## Desenvolver

```bash
npm test                       # testes unitários
node scripts/validar-tipos.js  # diagnóstico contra a API real
```

Desenho e decisões: `docs/superpowers/specs/2026-07-16-moloni-downloader-design.md`

**Aviso:** `downloads/` tem dados fiscais de clientes e `.env` tem credenciais.
Ambos estão no `.gitignore` — nunca os commitar.
