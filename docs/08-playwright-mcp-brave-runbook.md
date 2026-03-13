# Playwright MCP Brave Runbook

## Objetivo

Padronizar o uso do browser MCP do ACOO com `Brave` em perfil persistente, reduzindo erros operacionais e deixando claro o que é falha real de runtime versus comportamento esperado da sessão dedicada.

## Topologia real

- launcher manual da janela dedicada: `~/.local/bin/playwright-mcp-brave-open`
- wrapper MCP da Codex CLI: `~/.local/bin/playwright-mcp-brave-persistent`
- endpoint CDP esperado: `http://127.0.0.1:9222/json/version`
- profile isolado do MCP: `~/Library/Application Support/PlaywrightMCP/brave-profile`
- config da Codex: `~/.codex/config.toml`

O wrapper `playwright-mcp-brave-persistent` nao abre o browser sozinho.
Ele apenas faz `attach` no endpoint CDP ja exposto pelo `Brave`.

## Estado atual validado

- o ACOO enxerga o MCP `playwright` corretamente na Codex CLI;
- o runtime gerenciado fica `unhealthy` quando o CDP do Brave nao esta de pe;
- o preflight atual exige subida manual por padrao;
- o profile do MCP e separado do browser pessoal e tem preferencias proprias.

## Healthcheck operacional

Antes de usar uma skill que depende de browser:

1. rodar `npm run server:status -- --pretty`
2. confirmar se o advisory do Playwright desapareceu
3. se o runtime estiver indisponivel, subir `~/.local/bin/playwright-mcp-brave-open`
4. so depois operar a skill

Sinais de runtime saudavel:

- `server:status` sem advisory de Playwright indisponivel
- `curl http://127.0.0.1:9222/json/version` responde
- o MCP consegue listar tabs sem erro de attach

## Comportamentos que sao esperados

### 1. Tema pode parecer diferente

O browser MCP usa um profile isolado.
Se esse profile estiver com preferencias visuais diferentes do browser pessoal, a janela dedicada pode parecer "light" enquanto a pessoal fica "dark", ou vice-versa.

Isso nao significa que o turno "pegou posse" do browser.
Significa apenas que o profile `brave-profile` tem configuracao propria.

### 2. Fechar abas nao e o mesmo que matar o Brave

Como o MCP trabalha por `attach` no CDP, fechar tabs pode deixar uma aba `about:blank` residual ou uma janela vazia.
Isso nao deve ser interpretado como bug do agente por si so.

Se a intencao for encerrar o processo inteiro do Brave dedicado, isso precisa ser tratado como encerramento do browser, nao apenas limpeza de tabs.

### 3. WhatsApp pode levar tempo para ficar operavel

Em `web.whatsapp.com`, a tela pode abrir autenticada mas ainda exibindo:

- `Nao feche esta janela`
- `Suas mensagens estao sendo baixadas`

Enquanto isso durar, a busca de conversas pode nao responder.
Nao assumir logout nem falha de skill antes da lista de conversas e da busca estarem visiveis.

## Erros operacionais mais comuns

### Assumir que o MCP esta quebrado sem checar o healthcheck

Correto:

1. `server:status`
2. `playwright-mcp-brave-open`
3. tabs
4. snapshot

Errado:

- dizer que o Playwright "nao existe" sem validar o runtime
- tentar operar browser com o CDP ainda fora do ar

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
- endpoint de healthcheck
- fato de o profile ser isolado
- risco de `about:blank` residual ao fechar tabs
- necessidade de esperar sincronizacao no WhatsApp antes de buscar conversa
