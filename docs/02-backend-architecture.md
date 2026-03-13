# Backend Architecture for ACOO

## Direção correta

O backend do ACOO deve ser um control plane para a Codex CLI.

Isso significa:

- cadastrar agentes;
- gerenciar perfis de execução;
- abrir e retomar sessões;
- compor skills e contexto;
- governar MCPs;
- expor canais como Telegram e UI.

Isso não significa:

- reimplementar raciocínio;
- criar outro "loop de agente" concorrente;
- inventar uma camada local de LLM que finge ser a Codex.

## Componentes recomendados

### 1. Agent Registry

Fonte de verdade para agentes e subagentes.

Cada agente precisa ter:

- `id`
- `slug`
- `displayName`
- `role`
- `description`
- `promptTemplate`
- `skillBindings`
- `mcpProfileId`
- `model`
- `reasoningEffort`
- `approvalPolicy`
- `sandboxMode`
- `searchEnabled`
- `defaultChannelPolicy`
- `status`

### 2. Session Registry

Rastreia sessões reais da Codex.

Cada sessão precisa guardar:

- `agentId`
- `channel`
- `channelThreadId`
- `codexThreadId`
- `cwd`
- `mode` (`interactive`, `exec`, `exec-resume`, `ephemeral`)
- `startedAt`
- `lastUsedAt`
- `status`

### 3. Run Service

Único ponto que monta comandos da Codex CLI.

Responsabilidades:

- compilar flags;
- escolher `exec` vs `exec resume`;
- decidir quando usar `--ephemeral`;
- aplicar bypass total quando necessário;
- capturar stdout, stderr, thread id e última mensagem;
- registrar run history.

### 4. Context Compiler

Converte o domínio do ACOO em contexto consumível pela Codex.

Entradas:

- agente atual;
- canal atual;
- thread operacional ativa;
- projetos, tasks, contacts, notes;
- skill context;
- política do canal.

Saída:

- prompt composto;
- opcionalmente arquivos temporários ou overlays.

### 5. MCP Catalog

Fonte de verdade do ACOO sobre integrações MCP.

Responsabilidades:

- saber quais MCPs existem;
- saber quais estão instalados na CLI;
- classificar quais são obrigatórios, opcionais, proibidos ou preferidos por agente;
- mostrar estado para UI e Telegram.

### 6. Channel Adapters

Adaptadores finos:

- Telegram
- UI/Web
- eventualmente WhatsApp, Email ou jobs

Eles não executam raciocínio. Só traduzem eventos para `AgentRequest`.

## Estrutura alvo

```text
server/
  agents/
    registry/
    profiles/
    sessions/
  codex/
    CodexCliService.ts
    CodexRunService.ts
    CodexProfileCompiler.ts
  context/
    OperationalContextService.ts
    AgentContextCompiler.ts
  mcp/
    McpCatalogService.ts
    McpHealthService.ts
    profiles/
  channels/
    telegram/
    web/
  runs/
    AgentRunRepository.ts
    AgentRunService.ts
  settings/
  status/
```

## O que cortar do desenho mental antigo

- `memory/` como se a conversa fosse a memória principal;
- `llm/` como provider layer paralelo à Codex CLI;
- "agente local" que tenta competir com `exec/resume/fork`;
- qualquer "controller" que esconda a superfície real da CLI em abstrações frágeis.

## O que manter do repo atual

- `threads/` e `tasks/` como acervo operacional e fonte de contexto;
- `AGENT.md` do COO como política base de trabalho;
- Telegram como canal de entrada;
- MCP status/registry;
- integração real com a Codex CLI.

## Relação com UI

A UI não deve criar "agentes mágicos".

Ela deve editar e visualizar:

- agentes;
- skills vinculadas;
- MCP profile;
- sessões;
- runs;
- estado do Telegram;
- estado do runtime da Codex CLI.

## Relação com Telegram

O Telegram não deve "virar o backend".

Ele deve:

- listar agentes;
- trocar agente ativo;
- abrir nova sessão;
- retomar sessão;
- delegar ao COO;
- mostrar status de processamento;
- responder com texto, áudio ou arquivo.

## Relação com recursos experimentais

Não basear o backend em `codex app-server` agora.

Motivo:

- o próprio help local marca `app-server` como experimental;
- o contrato está menos estável do que `exec`, `resume` e `mcp`.

## Fontes

- OpenAI, "Introducing Codex app": https://openai.com/index/introducing-the-codex-app/
- OpenAI, "Codex" product page: https://openai.com/codex/
- OpenAI, "A practical guide to building agents": https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf
- Local CLI help captured on 2026-03-13
