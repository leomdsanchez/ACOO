# Playwright MCP Brave Runbook

## Objetivo

Padronizar o uso do browser MCP do ACOO com `Brave` em perfil persistente, reduzindo erros operacionais e deixando claro o que é falha real de runtime versus comportamento esperado da sessão dedicada.

Para a arquitetura completa de runtime, ver:

- [10-playwright-runtime-architecture.md](/Users/leosanchez/Documents/DEV/ACOO/docs/10-playwright-runtime-architecture.md)

Este runbook descreve o `estado operacional atual`.
O documento de arquitetura descreve o `estado alvo` e as decisões estruturais obrigatórias.

## Topologia real

- owner principal da sessao dedicada: `PlaywrightSessionOwner` no processo do ACOO
- launcher manual legado: `~/.local/bin/playwright-mcp-brave-open`
- wrapper MCP da Codex CLI: `~/.local/bin/playwright-mcp-brave-persistent`
- healthcheck real do ACOO: `node scripts/playwright-mcp-healthcheck.mjs`
- endpoint CDP esperado: `http://127.0.0.1:9222/json/version`
- profile isolado do MCP: `~/Library/Application Support/PlaywrightMCP/brave-profile`
- config da Codex: `~/.codex/config.toml`

Quando `ACOO_PLAYWRIGHT_MCP_OWN_SESSION=true`, o browser, o profile e o `BrowserContext` persistente passam a ser possuidos pelo ACOO. O launcher manual legado continua util apenas para recovery manual ou fallback.

No ambiente local atual, o wrapper esta pinado em `@playwright/mcp@0.0.68`.
Se for necessario atualizar, fazer isso de forma intencional, nao via `@latest`.

O wrapper `playwright-mcp-brave-persistent` nao e o dono da sessao.
Ele continua servindo como superficie de attach da Codex CLI ao browser ja mantido pelo ACOO.

## Estado atual validado

- o ACOO enxerga o MCP `playwright` corretamente na Codex CLI;
- o runtime gerenciado agora possui `profile + processo + BrowserContext` localmente;
- o healthcheck reconhece primeiro o lease da sessao operacional do owner local;
- o `status` expoe evidencias do owner local (`profile`, `lock`, `output dir`, `hasContext`);
- o runtime gerenciado agora valida `attach` real via CDP, nao apenas `GET /json/version`;
- o preflight atual pode subir a sessao automaticamente no primeiro uso ou na recuperacao;
- a sessao abre com janela visivel por padrao, mas agora aceita modo `headless` quando isso for pedido explicitamente;
- o profile do MCP e separado do browser pessoal e tem preferencias proprias.

## Healthcheck operacional

Antes de usar uma skill que depende de browser:

1. rodar `npm run server:status -- --pretty`
2. se quiser forcar o bootstrap ou validar a recuperacao, rodar `npm run server:mcp -- ensure playwright --pretty`
3. confirmar se o advisory do Playwright desapareceu
4. so depois operar a skill

Se precisar subir sem janela visivel:

- `~/.local/bin/playwright-mcp-brave-open --headless`
- ou `PLAYWRIGHT_MCP_BRAVE_HEADLESS=1 ~/.local/bin/playwright-mcp-brave-open`

Sinais de runtime saudavel:

- `server:status` sem advisory de Playwright indisponivel
- `node scripts/playwright-mcp-healthcheck.mjs` responde com `ok: true`
- o bloco `owner` do runtime mostra `enabled: true` e, idealmente, `locked: true`
- o MCP consegue listar tabs sem erro de attach

O healthcheck do ACOO faz duas validacoes:

1. evidencia da sessao operacional possuida pelo ACOO (`profile` + `lease`)
2. `GET /json/version`
3. `chromium.connectOverCDP(...)`

Assim, `browser de pe` deixou de ser tratado como sinonimo de `runtime realmente anexavel`, e o caminho do owner local ganhou precedencia sobre a heuristica externa.

## Comportamentos que sao esperados

### 1. Tema pode parecer diferente

O browser MCP usa um profile isolado.
Se esse profile estiver com preferencias visuais diferentes do browser pessoal, a janela dedicada pode parecer "light" enquanto a pessoal fica "dark", ou vice-versa.

Isso nao significa que o turno "pegou posse" do browser.
Significa apenas que o profile `brave-profile` tem configuracao propria.

### 2. Fechar abas nao e o mesmo que matar o Brave

Como a Codex continua entrando por `attach` no CDP sobre uma sessao persistente possuida pelo ACOO, fechar tabs pode deixar uma aba `about:blank` residual ou uma janela vazia.
Isso nao deve ser interpretado como bug do agente por si so.

Se a intencao for encerrar o processo inteiro do Brave dedicado, isso precisa ser tratado como encerramento do browser, nao apenas limpeza de tabs.

### 3. WhatsApp pode levar tempo para ficar operavel

Em `web.whatsapp.com`, a tela pode abrir autenticada mas ainda exibindo:

- `Nao feche esta janela`
- `Suas mensagens estao sendo baixadas`

Enquanto isso durar, a busca de conversas pode nao responder.
Nao assumir logout nem falha de skill antes da lista de conversas e da busca estarem visiveis.

### 4. Headless e opcional, nao padrao

O launcher agora aceita modo `headless`, mas isso deve ser usado so quando a prioridade for rodar a sessao sem janela visivel.

Correto:

- usar `--headless` apenas quando nao houver handoff manual imediato;
- manter a sessao visivel para fluxos de WhatsApp, login manual, ou validacao visual mais fragil.

Errado:

- assumir que `headless` vira o novo padrao do ACOO;
- usar `headless` em fluxo que depende do usuario olhar a tela em tempo real.

## Erros operacionais mais comuns

### Assumir que o MCP esta quebrado sem checar o healthcheck

Correto:

1. `server:status`
2. `server:mcp -- ensure playwright --pretty`
3. tabs
4. snapshot

Errado:

- dizer que o Playwright "nao existe" sem validar o runtime
- tentar operar browser com o CDP ainda fora do ar
- confiar apenas em `curl /json/version` como prova de attach funcional

### Tratar troca visual de tema como troca de sessao

Correto:

- lembrar que o profile do MCP e separado
- alinhar o tema manualmente uma vez dentro do `brave-profile` se isso atrapalhar leitura

Errado:

- concluir que o agente "mudou o tema do seu browser pessoal"

### Tentar buscar conversa antes do WhatsApp terminar de sincronizar

Correto:

- esperar a caixa `Pesquisar ou comecar uma nova conversa`
- so depois pesquisar `Lucia Rodriguez`, `Neural x Geaseg` etc.

Errado:

- disparar busca assim que a pagina abre

## Sequencia recomendada para tasks com browser

1. validar runtime com `server:status`
2. subir Brave dedicado se necessario
3. listar tabs
4. selecionar a tab correta
5. validar por snapshot
6. operar
7. validar resultado visual

## Regra de documentacao para skills

Toda skill que depende de `playwright` deve deixar explicito:

- comando de startup manual
- sintaxe opcional de `headless`, se suportada
- endpoint de healthcheck
- fato de o profile ser isolado
- risco de `about:blank` residual ao fechar tabs
- necessidade de esperar sincronizacao no WhatsApp antes de buscar conversa
- fato de que o owner local do ACOO e o modelo principal e o launcher manual externo virou fallback
