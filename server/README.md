# Operational Core

Estrutura inicial do backend operacional para o ACOO.

## Objetivo

- preservar `threads/` e `tasks/` atuais como acervo operacional;
- introduzir um domínio explícito para `projects`, `contacts`, `threads` e `tasks`;
- usar a Codex CLI autenticada como runtime real do agente, sem duplicar sessão nem memória conversacional;
- estruturar um núcleo local enxuto com `bot`, `controller`, `engine`, `context`, `skills` e `status`;
- usar MCPs como integrações externas disponíveis para o ACOO via Codex CLI.

## Módulos

- `bot/`: fachada de entrada para mensagens/comandos.
- `controller/`: orquestração de requisições do agente.
- `engine/`: execução do agente sobre a Codex CLI.
- `context/`: montagem do contexto operacional a partir de threads, frentes e metadata da interação.
- `status/`: health/status consolidado de CLI, MCP, skills e repositório.
- `skills/`: loader, router e executor de skills/playbooks.
- `domain/`: tipos e contratos do domínio operacional.
- `application/`: portas e serviços que orquestram o workspace.
- `infrastructure/`: leitura/escrita em filesystem e templates Markdown.
- `mcp/`: catálogo e discovery de integrações MCP já configuradas na Codex CLI.
- `codex/`: integração real com `codex login status`, `codex mcp list` e `codex exec`.

## Fonte de verdade nesta fase

- `threads/` e `threads-arquivadas/`: memória operacional em Markdown.
- `tasks/` e `tasks-finalizadas/`: execução operacional em Markdown.
- `data/projects.json`: seed inicial para projetos estruturados.
- `data/contacts.json`: seed inicial para contatos estruturados.
- `data/acoo.db`: banco SQLite do registry operacional do ACOO.
- `data/agents.json`: seed inicial de agentes e subagentes do ACOO.
- `data/agent-mcp-profiles.json`: seed inicial de perfis de MCP.
- `data/agent-sessions.json`: seed inicial de sessões por agente/canal.
- `data/agent-runs.json`: seed inicial de histórico resumido de execuções por agente.

## Ambiente

Variáveis relevantes em `.env`:

- `VITE_APP_NAME`: nome exibido no frontend local.
- `DATABASE_URL`: caminho do SQLite usado pelo Prisma para o registry do ACOO.
- `ACOO_CODEX_CLI_BIN`: binário da Codex CLI.
- `ACOO_CODEX_CONFIG_PATH`: caminho esperado do `config.toml` usado para healthcheck e alinhamento operacional.
- `ACOO_CODEX_MODEL`: modelo opcional a forçar na execução.
- `ACOO_CODEX_REASONING_EFFORT`: esforço de raciocínio padrão para a Codex CLI (`low`, `medium`, `high`, `xhigh`).
- `ACOO_CODEX_SANDBOX_MODE`: sandbox usado nos comandos `codex exec`.
- `ACOO_CODEX_APPROVAL_POLICY`: política padrão de aprovação (`untrusted`, `on-request`, `never`, `on-failure`).
- `ACOO_TELEGRAM_ENABLED`: habilita a prontidão de configuração do canal Telegram.
- `ACOO_TELEGRAM_BOT_TOKEN`: token do bot Telegram.
- `ACOO_TELEGRAM_BOT_USERNAME`: username público do bot.
- `ACOO_TELEGRAM_ALLOWED_USER_IDS`: IDs autorizados para falar com o bot.
- `ACOO_TELEGRAM_PROGRESS_PULSE_MS`: intervalo em ms para renovar o status `typing` enquanto o bot está processando.
- `ACOO_TELEGRAM_REPLY_AUDIO_BY_DEFAULT`: resposta em áudio como default do canal Telegram.
- `ACOO_STT_ENABLED`: habilita transcrição local de áudio.
- `ACOO_STT_BINARY`: binário do `whisper.cpp`, normalmente `whisper-cli`.
- `ACOO_STT_FFMPEG_BIN`: binário do `ffmpeg` usado para normalizar o áudio antes da transcrição.
- `ACOO_STT_MODEL`: variante do modelo local (`tiny`, `base`, `small`, etc.). O default recomendado aqui é `base`.
- `ACOO_STT_MODEL_PATH`: caminho local do arquivo `ggml-*.bin`. Se vazio, deriva de `ACOO_STT_MODEL`.
- `ACOO_STT_MODEL_URL`: URL usada para baixar o modelo automaticamente quando faltar. Se vazia, deriva de `ACOO_STT_MODEL`.
- `ACOO_STT_LANGUAGE`: idioma opcional para forçar na transcrição.
- `ACOO_STT_THREADS`: threads do `whisper.cpp`.
- `ACOO_STT_MODEL_DOWNLOADER_BIN`: downloader usado para buscar o modelo, normalmente `curl`.
- `ACOO_SKILL_ROOTS`: raízes de skills separadas por vírgula.

## Uso local

Status consolidado do runtime:

```bash
npm run server:status -- --pretty
```

Desenvolvimento local completo:

```bash
npm run dev
```

Esse comando sobe a UI e, se `ACOO_TELEGRAM_ENABLED=true`, também sobe o polling do Telegram.

Estado das integrações MCP configuradas na Codex CLI e visíveis para o ACOO:

```bash
npm run server:mcp -- --pretty
```

Sessão persistente oficial do browser para MCP:

- wrapper ativo na Codex CLI: `~/.local/bin/playwright-mcp-brave-persistent`
- config da Codex: `~/.codex/config.toml`
- profile persistente reutilizado pelo MCP: `~/Library/Application Support/PlaywrightMCP/brave-profile`
- browser oficial para fluxos MCP: `Brave Browser`

Fluxo recomendado de reuso:

1. abrir o Brave com esse profile uma vez e concluir os logins manuais necessários;
2. manter o profile `brave-profile` como profile operacional do MCP;
3. deixar o `playwright` da Codex sempre apontando para o wrapper `playwright-mcp-brave-persistent`;
4. nas tasks via MCP, reutilizar a sessão existente em vez de iniciar login novo.

Execução do agente via Codex CLI usando o contexto operacional do repo:

```bash
npm run server:run -- "revisar as frentes ativas e apontar a próxima trava"
```

Provisionamento do banco local do ACOO:

```bash
npm run prisma:setup
```

Polling do canal Telegram:

```bash
npm run server:telegram -- --drop-pending
```

O canal Telegram usa uma única sessão persistida da Codex por canal, com um agente ativo selecionável.
Mensagens de voz passam por transcrição local com `whisper.cpp` antes de entrar no fluxo do agente.

Comandos de sessão no chat:

- `/agents`: lista os agentes ativos disponíveis no registry.
- `/<slug>`: troca o agente ativo do canal e encerra a sessão anterior para evitar misturar contexto.
- `/start`: inicia a sessão ou reativa a sessão atual e garante uma thread Codex anexada.
- `/end`: encerra a sessão atual sem apagar o `sessionId`.
- `/new`: descarta a sessão atual e abre uma nova thread da Codex para o agente atualmente selecionado.
- `/reset`: alias de `/new`.
- `/status`: mostra o estado atual da sessão do canal.
- `/help`: resume os comandos de sessão disponíveis.

Inspeção rápida da identidade do bot configurado:

```bash
npm run server:telegram -- --status
```

Opções úteis:

- `--json`: devolve a resposta completa com `command`, `stdout` e `stderr`.
- `--cwd DIR`: executa a Codex CLI em outro diretório.
- `--session ID`: retoma uma sessão específica da Codex CLI.
- `--resume-last`: reaproveita a última sessão persistida da Codex CLI.
- `--ephemeral`: executa sem persistir arquivos de sessão na Codex CLI.
- `server:telegram -- --drop-pending`: ignora backlog acumulado e passa a responder só mensagens novas.
- `server:telegram -- --once`: processa um ciclo curto de updates e encerra.

## Estratégia MCP

- O ACOO não é um MCP; ele é o sistema operacional/orquestrador.
- MCPs entram como integrações externas já registradas na Codex CLI.
- O catálogo suportado fica em `server/mcp/manifest.ts`.
- Integrações configuradas na CLI e fora do catálogo continuam visíveis como `configuredUnknown`.
- Se no futuro o ACOO precisar expor um MCP próprio, isso deve ser tratado como interface opcional, não como núcleo do sistema.

## Estratégia de Canais

- ACOO deve tratar CLI e Telegram como canais de entrada/saída, não como núcleos de raciocínio separados.
- O runtime atual já aceita metadata de interação (`channel`, `inputMode`, `requestedOutputMode`) e seleção explícita de agente por canal.
- O Telegram já opera em cima do registry de agentes para escolher o agente ativo, abrir/reaproveitar thread da Codex e registrar sessões/runs.
- O próximo passo do canal é expor essa mesma seleção na UI e aplicar overrides reais de config por agente na execução da Codex.

## Runtime montado no bootstrap

O `createOperationalRuntime()` agora instancia:

- `OperationalBot`
- `AgentController`
- `AgentEngine`
- `OperationalContextService`
- `CodexCliService`
- `McpRegistryService`
- `RuntimeStatusService`
- `SkillLoader` + `SkillRouter` + `SkillExecutor`
- `OperationalWorkspace`

## Próximos passos naturais

1. Conectar a home ao status real do runtime.
2. Criar uma camada de settings persistidos para a home alterar defaults reais do runtime em vez de manter só um perfil local no browser.
3. Aplicar overrides reais por agente para `model`, `reasoning effort`, `approval`, `sandbox`, `search` e perfil de MCP na chamada da Codex CLI.
4. Adicionar importador e sincronização bidirecional entre entidades e Markdown.
5. Estruturar `project -> front -> thread -> task -> contact` sem heurística por título.
