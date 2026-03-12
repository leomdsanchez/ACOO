# Operational Core

Estrutura inicial do backend operacional para o ACOO.

## Objetivo

- preservar `threads/` e `tasks/` atuais como acervo operacional;
- introduzir um domínio explícito para `projects`, `contacts`, `threads` e `tasks`;
- usar a Codex CLI autenticada como runtime real do agente, sem duplicar sessão nem memória conversacional;
- estruturar um núcleo local enxuto com `bot`, `controller`, `engine`, `context`, `skills` e `status`;
- preparar um servidor MCP operacional para ser consumido pela Codex CLI.

## Módulos

- `bot/`: fachada de entrada para mensagens/comandos.
- `controller/`: orquestração de requisições do agente.
- `engine/`: execução do agente sobre a Codex CLI e registro de tools.
- `context/`: montagem do contexto operacional a partir de threads e frentes.
- `interfaces/mcp`: fachada do servidor MCP operacional.
- `status/`: health/status consolidado de CLI, MCP, skills e repositório.
- `skills/`: loader, router e executor de skills/playbooks.
- `domain/`: tipos e contratos do domínio operacional.
- `application/`: portas e serviços que orquestram o workspace.
- `infrastructure/`: leitura/escrita em filesystem e templates Markdown.
- `mcp/`: catálogo de tools do domínio operacional.
- `codex/`: integração real com `codex login status`, `codex mcp list` e `codex exec`.

## Fonte de verdade nesta fase

- `threads/` e `threads-arquivadas/`: memória operacional em Markdown.
- `tasks/` e `tasks-finalizadas/`: execução operacional em Markdown.
- `data/projects.json`: seed inicial para projetos estruturados.
- `data/contacts.json`: seed inicial para contatos estruturados.

## Ambiente

Variáveis relevantes em `.env`:

- `VITE_APP_NAME`: nome exibido no frontend local.
- `ACOO_CODEX_CLI_BIN`: binário da Codex CLI.
- `ACOO_CODEX_CONFIG_PATH`: caminho esperado do `config.toml` usado para healthcheck e alinhamento operacional.
- `ACOO_CODEX_MODEL`: modelo opcional a forçar na execução.
- `ACOO_CODEX_SANDBOX_MODE`: sandbox usado nos comandos `codex exec`.
- `ACOO_CODEX_APPROVAL_POLICY`: política de aprovação usada nos comandos `codex exec`.
- `ACOO_MCP_SERVER_NAME`: nome esperado para o servidor MCP operacional.
- `ACOO_SKILL_ROOTS`: raízes de skills separadas por vírgula.

## Uso local

Status consolidado do runtime:

```bash
npm run server:status -- --pretty
```

Execução do agente via Codex CLI usando o contexto operacional do repo:

```bash
npm run server:run -- "revisar as frentes ativas e apontar a próxima trava"
```

Opções úteis:

- `--json`: devolve a resposta completa com `command`, `stdout` e `stderr`.
- `--cwd DIR`: executa a Codex CLI em outro diretório.
- `--session ID`: retoma uma sessão específica da Codex CLI.
- `--resume-last`: reaproveita a última sessão persistida da Codex CLI.

## Runtime montado no bootstrap

O `createOperationalRuntime()` agora instancia:

- `OperationalBot`
- `AgentController`
- `AgentEngine`
- `OperationalContextService`
- `ToolRegistry`
- `OperationalMcpServer`
- `CodexCliService`
- `RuntimeStatusService`
- `SkillLoader` + `SkillRouter` + `SkillExecutor`
- `OperationalWorkspace`

## Próximos passos naturais

1. Implementar transporte MCP real sobre a fachada em `interfaces/mcp`.
2. Expor um endpoint/command local de status para a home consumir dados reais.
3. Adicionar importador e sincronização bidirecional entre entidades e Markdown.
4. Substituir os JSONs iniciais por banco local quando o domínio estabilizar.
