# Architect Review Reconciliation

## Objetivo

Registrar quais pontos da análise externa são válidos para o ACOO, quais são parciais e quais ajustes entram oficialmente no alvo da arquitetura.

## Resumo executivo

A direção macro do sistema está correta:

- Codex CLI como runtime real
- ACOO como control plane
- agentes, sessões, runs, skills e MCP como domínio do backend

Mas a análise externa está certa em apontar que o projeto ainda está em estado intermediário.

## Pontos aceitos como válidos

### 1. Sessão do Telegram está estruturalmente errada

Status: **válido**

Hoje o estado ativo do Telegram está em um arquivo global único.

Problema:

- mistura conversas;
- inviabiliza multi-chat real;
- contraria o modelo de `channel + channelThreadId + agent -> codexThreadId`.

Ajuste aceito:

- migrar o estado do Telegram para storage por `chatId + agentId`
- usar o Session Registry como fonte de verdade
- deixar `TelegramSessionStore` como cache fino ou removê-lo

### 2. Mistura entre `AGENTS.md`, prompt de agente e skill

Status: **válido**

Hoje existe compatibilidade histórica demais:

- `SkillLoader` trata `SKILL.md` e `AGENT.md` de forma equivalente
- o config ainda aponta para `agents/` e `~/.codex/skills`

Isso é útil como compatibilidade, mas não é arquitetura final.

Ajuste aceito:

- `AGENTS.md` na raiz como instrução global
- `agents/<slug>/prompt.md` como overlay do agente
- `.agents/skills/` como skills do projeto
- `~/.codex/skills/` como skills globais

### 3. UI ainda não é control plane real

Status: **válido**

Hoje a UI:

- é local-first
- usa `localStorage`
- não governa o runtime
- não reflete integralmente o backend atual

Ajuste aceito:

- criar API real para status, agents, sessions, runs e MCP
- fazer a UI consumir essa API
- remover mensagens obsoletas que contradizem o estado atual do backend

### 4. Multi-agent real ainda não existe

Status: **válido**

Hoje existe:

- registry
- sessão por agente
- seleção manual de agente no Telegram

Hoje não existe:

- COO delegando a subagente e retomando o resultado

Ajuste aceito:

- implementar `DelegationTask`
- implementar `AgentDelegationOrchestrator`
- manter o COO como dono do chat

### 5. Compilação de perfil da Codex ainda está incompleta

Status: **parcialmente válido**

O núcleo atual já faz bastante coisa certa:

- centraliza `exec` e `exec resume`
- compila overrides por agente
- aplica política de MCP na execução
- faz preflight do Playwright gerenciado

Mas o ponto do arquiteto continua válido em parte:

- `--profile` ainda não é usado
- `configPath` customizado é validado, não injetado na CLI
- ainda falta um `AgentProfileCompiler` mais explícito

Ajuste aceito:

- introduzir um compilador de perfil da Codex por agente
- decidir se o projeto vai usar profiles reais da CLI ou somente `-c key=value`

### 6. Há camadas redundantes no `server/`

Status: **parcialmente válido**

O diagnóstico acerta em dois pontos:

- `OperationalBot` é um passthrough
- `AgentEngine` é um wrapper muito fino

Mas o ponto precisa ser ponderado:

- wrappers finos não são necessariamente problema se marcam fronteiras estáveis
- o problema só existe se eles não tiverem papel claro

Ajuste aceito:

- manter apenas wrappers que sustentem fronteiras reais
- reavaliar `OperationalBot` e `AgentEngine` quando a API/web entrarem

## Pontos que precisam nuance

### Multi-agent oficial da Codex

A análise externa acerta que o fluxo atual não implementa multi-agent real.

Mas é importante registrar:

- a OpenAI já posiciona multi-agent no ecossistema Codex;
- isso aparece mais claramente em Codex app, Codex Cloud e Codex SDK;
- a CLI terminal ainda não expõe um handoff pai/filho first-class pronto para usar no chat.

Conclusão:

- o backend do ACOO continua sendo o lugar certo para implementar delegação real

## Estrutura alvo revisada

```text
server/
  agents/
  channels/
    telegram/
    web/
  codex/
  context/
  mcp/
  sessions/
  status/
  runs/
```

Regras:

- `server/codex/`: integração e compilação de perfil da CLI
- `server/agents/`: definições, prompts, bindings e políticas
- `server/sessions/`: sessão por canal/agente, histórico e delegação
- `server/mcp/`: catálogo, health, profile e runtime bootstrap
- `server/channels/`: adapters finos

## Ordem de prioridade aceita

1. corrigir sessão do Telegram para `chatId + agentId`
2. separar `AGENTS.md`, prompt de agente e skills
3. criar API real para a UI
4. introduzir `AgentProfileCompiler`
5. só depois implementar delegação COO -> subagentes

## Conclusão

A análise externa é útil e majoritariamente correta.

O ajuste mais importante é este:

- o ACOO não precisa trocar de direção;
- ele precisa terminar a transição para o desenho que já escolheu.

## Fontes

- OpenAI, Codex CLI: https://developers.openai.com/codex/cli
- OpenAI, Codex MCP guide: https://developers.openai.com/codex/mcp
- OpenAI, Codex Multi-agent: https://developers.openai.com/codex/multi-agent
- OpenAI, Introducing Codex: https://openai.com/index/introducing-codex/
- Observação local da CLI em 2026-03-13 com `codex --help`, `codex exec --help`, `codex resume --help`, `codex mcp --help`, `codex app-server --help`
