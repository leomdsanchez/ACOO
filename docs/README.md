# ACOO Backend on Codex CLI

Este diretório define como o ACOO deve ser construído em cima da Codex CLI real, sem reproduzir uma arquitetura falsa de "agente local" dentro do repo.

## Princípios

- A Codex CLI é o runtime do agente. O backend do ACOO não deve competir com ela nem reimplementar sessão, raciocínio, tools ou MCP.
- O ACOO deve ser um control plane: catálogo de agentes, sessões, skills, MCP, Telegram e contexto operacional.
- `AGENTS.md` e `SKILL.md` são mecanismos de instrução e contexto. Eles não substituem um modelo de domínio para `agents`, `sessions`, `runs`, `skills` e `mcp profiles`.
- MCP deve ser tratado como infraestrutura compartilhada da Codex CLI, com governança no ACOO, não como "mais uma camada fake" do app.
- Multi-agent vale a pena quando um único agente com tools deixa de ser confiável ou fica conceitualmente confuso.

## O que este diretório cobre

- [01-codex-cli-surface.md](/Users/leosanchez/Documents/DEV/ACOO/docs/01-codex-cli-surface.md): superfície real da Codex CLI, confirmada por doc oficial e pela CLI local.
- [02-backend-architecture.md](/Users/leosanchez/Documents/DEV/ACOO/docs/02-backend-architecture.md): arquitetura backend recomendada para o ACOO.
- [03-agent-registry-and-subagents.md](/Users/leosanchez/Documents/DEV/ACOO/docs/03-agent-registry-and-subagents.md): modelo de agentes, subagentes, sessões e delegação.
- [04-agents-skills-mcp.md](/Users/leosanchez/Documents/DEV/ACOO/docs/04-agents-skills-mcp.md): como usar `AGENTS.md`, `SKILL.md` e MCP de forma profissional.
- [05-implementation-roadmap.md](/Users/leosanchez/Documents/DEV/ACOO/docs/05-implementation-roadmap.md): sequência de implementação no backend.
- [06-codex-cli-delegation.md](/Users/leosanchez/Documents/DEV/ACOO/docs/06-codex-cli-delegation.md): como implementar delegação real entre agentes sem confundir troca de agente com handoff.
- [07-architect-review-reconciliation.md](/Users/leosanchez/Documents/DEV/ACOO/docs/07-architect-review-reconciliation.md): reconciliação entre a análise externa, o código atual e a direção oficial do projeto.
- [09-ui-control-plane-screens.md](/Users/leosanchez/Documents/DEV/ACOO/docs/09-ui-control-plane-screens.md): escopo das telas da UI para manter densidade operacional sem cair em formulário excessivo.

## Diagnóstico do repo atual

O repo atual já tem bons ativos:

- contexto operacional em `operations/threads/` e `operations/tasks/`;
- um `prompt.md` dedicado por agente;
- integração real com Codex CLI, Telegram, STT e MCP.

O que ainda não deve ser tratado como arquitetura final:

- camadas históricas que simulam "agente interno";
- a ideia de que prompt de agente + skills locais já formam, sozinhos, um sistema de agentes;
- qualquer modelagem implícita de subagente que não tenha `registry`, `session`, `run history` e `MCP policy`.

## Resposta direta ao objetivo do projeto

Você quer:

- criar e visualizar agentes na UI;
- selecionar subagentes pelo Telegram;
- ter um COO principal que conversa com subagentes;
- configurar skills e MCP por agente;
- manter MCP bem estruturados.

Isso é compatível com a Codex CLI, mas a implementação correta é:

- ACOO gerencia metadata e sessões;
- Codex CLI executa;
- `AGENTS.md` e skills instruem;
- MCP é configurado e observado pela CLI;
- Telegram é só um canal.

## Fontes principais

- OpenAI, "Introducing Codex": https://openai.com/index/introducing-codex/
- OpenAI, "Introducing the Codex app": https://openai.com/index/introducing-the-codex-app/
- OpenAI, "Introducing upgrades to Codex": https://openai.com/index/introducing-upgrades-to-codex/
- OpenAI, "Codex" product page: https://openai.com/codex/
- OpenAI, "Codex is now generally available": https://openai.com/index/codex-now-generally-available/
- OpenAI, "How OpenAI uses Codex": https://cdn.openai.com/pdf/6a2631dc-783e-479b-b1a4-af0cfbd38630/how-openai-uses-codex.pdf
- OpenAI, "A practical guide to building agents": https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf
