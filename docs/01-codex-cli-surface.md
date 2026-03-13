# Codex CLI Surface

Este documento separa o que a Codex CLI faz de verdade do que o ACOO precisa implementar no backend.

## O que a CLI já resolve

A CLI já tem superfície suficiente para ser o runtime principal do ACOO:

- sessão interativa;
- execução non-interactive;
- retomada de sessão;
- fork de sessão;
- MCP externo;
- configuração por `config.toml` e `profile`;
- aprovação e sandbox;
- bypass total de approvals e sandbox;
- servidor MCP da própria Codex;
- comandos experimentais de app server.

Confirmado localmente por:

- `codex --help`
- `codex exec --help`
- `codex exec resume --help`
- `codex mcp --help`
- `codex mcp-server --help`
- `codex app-server --help`

## Sessões

Superfície confirmada:

- `codex [PROMPT]`: sessão interativa.
- `codex resume [--last|SESSION_ID]`: retoma sessão interativa.
- `codex fork [--last|SESSION_ID]`: cria uma derivação de sessão anterior.
- `codex exec [PROMPT]`: execução non-interactive.
- `codex exec resume [SESSION_ID|--last] [PROMPT]`: retoma uma thread em modo non-interactive.
- `codex exec --ephemeral`: execução sem persistência de sessão.

Implicação para o ACOO:

- "subagente" não precisa ser um processo residente dentro do backend;
- subagente pode ser um `thread/session id` da Codex com um perfil e uma identidade próprias;
- o backend precisa rastrear sessões, não reimplementar sessão.

## Configuração

A CLI lê configuração de `~/.codex/config.toml` e aceita overrides por comando:

- `-c key=value`
- `-p profile`
- `-m model`
- `-s sandbox`
- `-a approval`

Implicação para o ACOO:

- configuração por agente deve ser compilada para flags/overrides da CLI;
- o backend precisa de um `AgentProfileCompiler`, não de um "provider layer" fake.

## Aprovação e sandbox

Superfície confirmada:

- `-a untrusted|on-failure|on-request|never`
- `-s read-only|workspace-write|danger-full-access`
- `--dangerously-bypass-approvals-and-sandbox`

Detalhe importante:

- `codex exec resume` não aceita `--sandbox`, mas aceita `--dangerously-bypass-approvals-and-sandbox`;
- isso afeta diretamente sessões persistidas do Telegram e de subagentes.

Implicação para o ACOO:

- se um agente roda com full access, o backend precisa saber montar o comando certo tanto para `exec` quanto para `exec resume`;
- não basta guardar o `threadId`; o launcher precisa reaplicar a política correta no próximo turno.

## MCP

Superfície confirmada:

- `codex mcp list`
- `codex mcp get`
- `codex mcp add`
- `codex mcp remove`
- `codex mcp login`
- `codex mcp logout`
- `codex mcp-server`

Implicação para o ACOO:

- a CLI já é o plano de controle real dos MCPs;
- o backend deve observar, catalogar e compor uso por agente;
- o backend não deve inventar uma segunda infraestrutura de MCP sem necessidade.

## AGENTS.md

O comportamento do `AGENTS.md` é explicitado publicamente por OpenAI em "Introducing Codex":

- arquivos `AGENTS.md` podem existir em vários níveis do filesystem;
- o escopo vale para a árvore de diretórios sob aquele arquivo;
- instruções mais profundas têm precedência;
- instruções de sistema/dev/user têm prioridade sobre `AGENTS.md`.

Implicação para o ACOO:

- um único `AGENTS.md` global do repo não é modelo suficiente para múltiplos agentes;
- se você quiser instruções por agente, precisa de uma estratégia de escopo, worktree ou prompt overlay.

## Skills

A OpenAI trata Skills como conceito de produto do ecossistema Codex. O site do produto e o app falam explicitamente em biblioteca de skills, criação de skills e automations com skills.

O comportamento exato do filesystem no ambiente local foi observado aqui:

- skills do usuário ficam em `~/.codex/skills`;
- há skills de sistema em `~/.codex/skills/.system`;
- o ACOO deve tratar `AGENTS.md` como instrução global de repo e prompt de agente como artefato separado.

Importante:

- a ideia de "skill = pasta com `SKILL.md`" no runtime local é observação prática e não encontrei uma especificação pública tão detalhada quanto a de `AGENTS.md`;
- por isso, o backend deve tratar o layout atual como compatibilidade com a CLI de hoje, não como contrato eterno.

## Web search e tools

A CLI expõe `--search`, o que habilita `web_search` nativo do modelo.

Implicação para o ACOO:

- agentes especializados em research podem ativar esse recurso por perfil;
- nem todo agente precisa dele;
- o backend deve tratar isso como capability por agente.

## O que não deve ser a base do ACOO

- `codex app-server` ainda aparece como experimental;
- `codex mcp-server` existe, mas não substitui o backend do ACOO;
- não é hora de construir o sistema inteiro em cima de recursos experimentais sem contrato estável.

## Decisão arquitetural

Para o ACOO:

- use a Codex CLI como runtime de execução;
- use o backend como control plane;
- use `config/profile/flags/session id` como linguagem de integração;
- não modele agentes como classes locais que "imitam" a Codex.

## Fontes

- OpenAI, "Introducing Codex": https://openai.com/index/introducing-codex/
- OpenAI, "Introducing upgrades to Codex": https://openai.com/index/introducing-upgrades-to-codex/
- OpenAI, "Introducing the Codex app": https://openai.com/index/introducing-the-codex-app/
- OpenAI, "Codex is now generally available": https://openai.com/index/codex-now-generally-available/
- OpenAI, "Codex" product page: https://openai.com/codex/
- OpenAI, "How OpenAI uses Codex": https://cdn.openai.com/pdf/6a2631dc-783e-479b-b1a4-af0cfbd38630/how-openai-uses-codex.pdf
- Local CLI help captured on 2026-03-13
