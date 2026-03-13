# Implementation Roadmap

## Objetivo

Chegar a um backend onde:

- a UI cria e edita agentes;
- o Telegram lista e troca agentes;
- o COO delega a subagentes;
- cada agente tem config, skills e MCP próprios;
- a Codex CLI continua sendo o runtime real.

## Fase 1: limpar o modelo conceitual

Entregas:

- remover ou congelar camadas que imitam um "LLM local";
- consolidar `CodexCliService` como único runtime;
- criar `AgentDefinition`, `AgentSession`, `AgentRun`, `AgentMcpProfile`;
- documentar estado e gaps.

Saída esperada:

- backend com linguagem certa;
- sem abstrações falsas.

## Fase 2: Agent Registry

Entregas:

- storage para agentes;
- CRUD de agentes;
- UI para listar/criar/editar agentes;
- skill bindings por agente;
- MCP profile por agente;
- defaults de modelo, sandbox, approval e search.

Saída esperada:

- agentes deixam de ser implícitos no repo.

## Fase 3: Session Registry

Entregas:

- mapear `channel + agent -> codexThreadId`;
- guardar histórico de runs;
- definir política de `resume` vs `ephemeral`;
- suportar `/new`, `/status`, `/agents`, `/[nome]`.

Saída esperada:

- subagentes reais e rastreáveis.

## Fase 4: COO orchestrator

Entregas:

- agent principal seleciona subagente;
- roda subagente em sessão própria;
- resume o resultado de volta;
- registra a delegação.

Saída esperada:

- COO como coordenador;
- subagentes como executores especializados.

## Fase 5: MCP governance

Entregas:

- catálogo de MCP com estado real;
- perfis por agente;
- health de auth;
- warnings no status da UI;
- playbooks para login/repair.

Saída esperada:

- MCP configurado com governança;
- menos surpresa operacional.

## Fase 6: Telegram control plane

Entregas:

- `/agents`
- `/coo`
- `/[slug]`
- `/new`
- `/status`
- resposta com agente atual e sessão ativa

Saída esperada:

- Telegram vira um painel operacional fino, não um chatbot genérico.

## Modelo de entrega por agente

Cada agente deve ser armazenado com:

- identidade;
- perfil de execução;
- skills;
- MCP profile;
- policy do canal;
- estratégia de sessão.

Cada execução deve produzir:

- comando da CLI;
- thread id;
- resumo de resultado;
- logs;
- vínculo com sessão e agente.

## O que fazer logo depois desta documentação

1. Criar `docs` como source of truth para a arquitetura.
2. Implementar `AgentDefinition` e `AgentSession` no backend.
3. Adaptar Telegram para seleção de agente.
4. Levar esses objetos para a UI.
5. Só depois refatorar o resto do runtime em volta disso.

## Fontes

- OpenAI, "Codex" product page: https://openai.com/codex/
- OpenAI, "Introducing the Codex app": https://openai.com/index/introducing-the-codex-app/
- OpenAI, "Codex is now generally available": https://openai.com/index/codex-now-generally-available/
- OpenAI, "A practical guide to building agents": https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf
