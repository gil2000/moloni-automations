# Moloni Downloader

Descarrega em massa os PDFs de documentos do Moloni (recibos, faturas,
faturas-recibo) para um intervalo de datas. O portal do Moloni só deixa
descarregar um de cada vez.

## Como usar (passo a passo)

Esta secção é para quem usa a aplicação no dia a dia — não é preciso saber
nada de computadores.

1. **Duplo-clique no atalho** no ambiente de trabalho:
   - Mac: **Descarregar Recibos.command**
   - Windows: **Descarregar Recibos.bat**

2. Vão abrir-se duas coisas: uma **janela escura com texto** e, a seguir, o
   **browser** com a aplicação.

   > ⚠️ **Não fechar a janela escura enquanto estiver a descarregar.** É ela
   > que faz o trabalho — fechá-la cancela o download a meio. Pode
   > minimizá-la (o botão amarelo/traço, para não a ver).

3. Na aplicação, escolher:
   - **De / Até** — o período de datas a descarregar
   - **Tipos de documento** — Recibo, Fatura e/ou Fatura-Recibo (pelo menos um)

4. Clicar no botão escuro **Descarregar**.

5. Esperar. Nos primeiros minutos a barra fica parada — está a **procurar**
   os documentos, ainda não começou a descarregar. É normal. Um mês inteiro
   de documentos demora cerca de **10 a 15 minutos** no total.

6. No fim aparece **"Concluído"** e um botão **Abrir pasta** — clicar nele
   mostra os PDFs já organizados.

7. Terminado, pode **fechar a janela escura** para fechar a aplicação.

Os PDFs ficam organizados por tipo e depois por mês:
`downloads/Recibos/2026-06/`, `downloads/Faturas/2026-06/`, etc.

### Se aparecer alguma coisa inesperada

- **Nada abriu no browser** — abrir à mão o link `http://localhost:4711`.
- **Apareceu texto a vermelho** — costuma explicar o que fazer. Se não
  resolver, contactar quem instalou a aplicação.
- **A aplicação pede para preencher "Configuração"** — não deve acontecer
  numa instalação já pronta a usar. Contactar quem instalou.

## Instalar num PC novo

Esta secção é técnica — para quem faz a instalação, não para quem usa a
aplicação depois.

Requer [Node.js](https://nodejs.org) 20+ e git.

```bash
git clone https://github.com/gil2000/moloni-automations.git
cd moloni-automations
npm install
```

Na tab **Configuração** da própria aplicação (`npm start`, depois abrir
`http://localhost:4711`), preencher as credenciais Moloni do cliente, a
pasta onde guardar, e testar a ligação antes de gravar. Não é preciso editar
nenhum ficheiro à mão.

**Antes de sair de lá, correr:**

```bash
npm run verificar
```

Verifica, por ordem e parando no primeiro problema: versão do Node, dependências
instaladas, `.env` completo (diz **quais** variáveis faltam), autenticação no
Moloni (distingue username/password errados de client_id/secret errados), e o
download de um PDF de cada tipo. Se isto passa, a app funciona.

**Logo do cliente (opcional).** O logo da ALLPRA já vai no repo (é o fornecedor,
é sempre o mesmo). Para juntar o do cliente:

```
branding/logo-cliente.png
```

Aceita `.png`, `.svg`, `.jpg` e `.webp`. Sem ele, aparece só o da ALLPRA. A pasta
`branding/` está no `.gitignore`: varia por instalação, como o `.env`. É esta
divisão — fornecedor no repo, cliente em ficheiro — que permite um binário único
se isto for empacotado num `.exe`.

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
