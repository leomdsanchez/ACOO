# Operational Core

Estrutura inicial do backend operacional para o ACOO.

## Objetivo

- preservar `threads/` e `tasks/` atuais como acervo operacional;
- introduzir um domínio explícito para `projects`, `contacts`, `threads` e `tasks`;
- estruturar um agente local com `bot`, `controller`, `engine`, `memory`, `skills`, `llm` e `interfaces`;
- deixar um ponto de integração claro para uso do Codex CLI autenticado como runtime principal;
- preparar um servidor MCP operacional para ser consumido pela Codex CLI.

## Módulos

- `bot/`: fachada de entrada para mensagens/comandos.
- `controller/`: orquestração de requisições do agente.
- `engine/`: loop do agente e registro de tools.
- `interfaces/cli`: sessão compartilhada de auth/config da Codex CLI.
- `interfaces/mcp`: fachada do servidor MCP operacional.
- `llm/`: contratos de provider e adaptação para Codex CLI.
- `memory/`: histórico de conversa e montagem de contexto operacional.
- `skills/`: loader, router e executor de skills/playbooks.
- `domain/`: tipos e contratos do domínio operacional.
- `application/`: portas e serviços que orquestram o workspace.
- `infrastructure/`: leitura/escrita em filesystem e templates Markdown.
- `mcp/`: catálogo de tools do domínio operacional.
- `codex/`: runner/base para acoplamento da CLI.

## Fonte de verdade nesta fase

- `threads/` e `threads-arquivadas/`: memória operacional em Markdown.
- `tasks/` e `tasks-finalizadas/`: execução operacional em Markdown.
- `data/projects.json`: seed inicial para projetos estruturados.
- `data/contacts.json`: seed inicial para contatos estruturados.
- `data/conversations.json`: memória conversacional local do agente.

## Ambiente

Variáveis relevantes em `.env`:

- `VITE_APP_NAME`: nome exibido no frontend local.
- `ACOO_CODEX_CLI_BIN`: binário da Codex CLI.
- `ACOO_CODEX_CONFIG_PATH`: caminho do `config.toml` compartilhado pela Codex CLI.
- `ACOO_MCP_SERVER_NAME`: nome esperado para o servidor MCP operacional.
- `ACOO_CONVERSATIONS_FILE`: arquivo JSON da memória conversacional.
- `ACOO_DEFAULT_CONVERSATION_ID`: conversa padrão para uso local.
- `ACOO_MAX_ITERATIONS`: teto do loop do agente.
- `ACOO_SKILL_ROOTS`: raízes de skills separadas por vírgula.

## Runtime montado no bootstrap

O `createOperationalRuntime()` agora instancia:

- `OperationalBot`
- `AgentController`
- `AgentLoop`
- `ToolRegistry`
- `OperationalMcpServer`
- `CodexCliAuthSession`
- `CodexCliProvider`
- `MemoryManager`
- `SkillLoader` + `SkillRouter` + `SkillExecutor`
- `OperationalWorkspace`

## Próximos passos naturais

1. Trocar o `CodexCliProvider` placeholder por execução real da CLI autenticada.
2. Implementar transporte MCP real sobre a fachada em `interfaces/mcp`.
3. Adicionar importador e sincronização bidirecional entre entidades e Markdown.
4. Substituir os JSONs iniciais por banco local quando o domínio estabilizar.
