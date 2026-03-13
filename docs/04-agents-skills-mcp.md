# AGENTS, Skills and MCP

## AGENTS.md não é o sistema

`AGENTS.md` é contexto persistente de repositório e escopo. Ele não é um cadastro de agentes.

Pela especificação pública mostrada pela OpenAI:

- o escopo é a árvore abaixo do diretório onde o arquivo vive;
- arquivos mais profundos vencem os mais amplos;
- instruções de sistema/dev/user têm prioridade.

Conclusão para o ACOO:

- mantenha um `AGENTS.md` de base no repo;
- não tente representar todos os agentes do sistema só por arquivos `AGENTS.md`.
- não trate `AGENTS.md`, prompt de agente e skill como o mesmo artefato.

## Estratégia correta para AGENTS no ACOO

### 1. AGENTS de base do repo

Uso:

- convenções de código;
- estrutura do projeto;
- instruções globais para qualquer agente que opere no repo.

### 2. Prompt overlay por agente

Uso:

- identidade do agente;
- formato de resposta;
- regras específicas do papel;
- restrições de operação.

Esse overlay deve ser gerado pelo backend, não exigido como arquivo global fixo do repo.

Estratégia recomendada:

- `AGENTS.md` na raiz: instrução global do repo;
- `agents/<slug>/prompt.md`: overlay de identidade e regras do agente;
- `/.agents/skills/*/SKILL.md`: skills do projeto;
- `~/.codex/skills`: skills globais do usuário/sistema.

### 3. Nested AGENTS quando houver escopo real

Uso:

- worktree específico;
- diretório de output de um subagente;
- área isolada para uma família de tarefas.

## Skills

OpenAI trata Skills como uma biblioteca de instruções reutilizáveis para workflows e tools recorrentes.

No ambiente local observado:

- skills do usuário vivem em `~/.codex/skills`;
- skills de sistema vivem em `~/.codex/skills/.system`;
- o ACOO hoje também carrega `AGENT.md` local por compatibilidade histórica.

Isso é uma compatibilidade transitória, não o alvo final da arquitetura.

## Estratégia correta para Skills no ACOO

### 1. Catálogo próprio do ACOO

O backend deve ter um catálogo próprio com metadata:

- `id`
- `name`
- `sourcePath`
- `scope`
- `status`
- `owner`
- `tags`

### 2. Compatibilidade com Codex

O backend deve continuar compatível com o filesystem que a Codex usa hoje:

- `SKILL.md`
- `AGENTS.md`

Mas com separação conceitual:

- `AGENTS.md`: instrução de escopo
- `prompt.md` do agente: identidade/overlay
- `SKILL.md`: workflow reutilizável

### 3. Skill bindings por agente

Cada agente deve declarar explicitamente:

- skills obrigatórias;
- skills opcionais;
- skills proibidas.

Isso é melhor do que deixar todo agente ver tudo.

## MCP

MCP é infraestrutura compartilhada da Codex CLI.

O ACOO precisa de duas camadas:

### 1. Estado real da CLI

O que a Codex enxerga:

- `codex mcp list`
- `codex mcp get`
- `codex mcp login/logout`

### 2. Política do ACOO

O que o sistema deseja por agente:

- MCP obrigatórios;
- MCP opcionais;
- MCP proibidos;
- notas operacionais;
- estado esperado de auth.

## Perfil de MCP por agente

Cada agente deve apontar para um `mcpProfile`.

Exemplo:

```ts
type AgentMcpProfile = {
  id: string;
  name: string;
  required: string[];
  optional: string[];
  blocked: string[];
};
```

Exemplos úteis:

- `coo-default`: `playwright`, `notion`
- `finance`: `stripe`
- `research`: sem MCP externo, mas com `--search`

## Como aplicar MCP por agente sem gambiarra

Regra prática:

- não mutar a configuração global da CLI a cada turno;
- use um catálogo e poucos perfis operacionais previsíveis;
- o backend deve validar compatibilidade antes de rodar o agente.

Até que a OpenAI documente com clareza uma configuração dinâmica por agente para MCP na CLI, o desenho profissional é:

- MCP instalado globalmente;
- política por agente no ACOO;
- validação antes da execução;
- compilação de flags/config por agente no ACOO;
- se necessário, perfis separados da CLI.

## Correção arquitetural importante

O ACOO deve convergir para esta organização:

- `AGENTS.md` na raiz
- `agents/<slug>/prompt.md`
- `.agents/skills/` para skills do projeto
- `~/.codex/skills/` para skills globais

Isso reduz a mistura atual entre `agents/` e `skills`, e alinha melhor o projeto ao uso esperado da Codex.

## Skills + MCP por agente

O binding correto é:

- agente define o que pode usar;
- backend monta contexto;
- Codex executa.

Não é:

- "deixa todo mundo ver tudo e espera que o modelo escolha sempre certo".

## Fontes

- OpenAI, "Introducing Codex": https://openai.com/index/introducing-codex/
- OpenAI, "Introducing upgrades to Codex": https://openai.com/index/introducing-upgrades-to-codex/
- OpenAI, "Introducing the Codex app": https://openai.com/index/introducing-the-codex-app/
- OpenAI, "Codex" product page: https://openai.com/codex/
- OpenAI, "How OpenAI uses Codex": https://cdn.openai.com/pdf/6a2631dc-783e-479b-b1a4-af0cfbd38630/how-openai-uses-codex.pdf
- Local CLI behavior observed on 2026-03-13
