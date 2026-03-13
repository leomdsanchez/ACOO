# Agent Registry and Subagents

## Regra principal

Comece maximizando um agente só.

A própria OpenAI recomenda isso de forma geral para sistemas agentic: primeiro esgote a capacidade de um único agente com contexto e tools; só quebre em múltiplos agentes quando houver ganho claro de separação, confiabilidade ou escala.

No ACOO, isso significa:

- o COO é o agente principal;
- subagentes entram para domínios específicos;
- eles não devem existir só porque o produto quer "mais agentes".

## Quando criar subagentes

Crie subagentes quando ocorrer pelo menos uma destas condições:

- o prompt do COO fica conceitualmente grande demais;
- a seleção de tool/MCP fica ruim quando tudo está num agente só;
- o agente principal precisa delegar tarefas paralelas de longa duração;
- um domínio tem políticas de segurança ou MCPs diferentes do resto;
- um canal precisa trocar de identidade operacional com clareza.

## O que é um subagente no ACOO

Subagente não é uma thread de JavaScript nem um `class FooAgent`.

Subagente é a composição de:

- identidade;
- prompt/política;
- skills;
- MCP profile;
- modelo e políticas de execução;
- sessão da Codex.

## Modelo de dados recomendado

### AgentDefinition

```ts
type AgentDefinition = {
  id: string;
  slug: string;
  displayName: string;
  role: "primary" | "specialist" | "automation";
  description: string;
  promptTemplatePath: string | null;
  promptInline: string | null;
  skillIds: string[];
  mcpProfileId: string;
  model: string | null;
  reasoningEffort: "low" | "medium" | "high" | "xhigh";
  approvalPolicy: "untrusted" | "on-request" | "on-failure" | "never";
  sandboxMode: "read-only" | "workspace-write" | "danger-full-access";
  searchEnabled: boolean;
  status: "active" | "disabled";
};
```

### AgentSession

```ts
type AgentSession = {
  id: string;
  agentId: string;
  channel: "telegram" | "web" | "cli";
  channelThreadId: string;
  codexThreadId: string | null;
  cwd: string;
  status: "active" | "ended";
  startedAt: string;
  lastUsedAt: string;
};
```

### AgentRun

```ts
type AgentRun = {
  id: string;
  agentId: string;
  sessionId: string | null;
  channel: string;
  command: string;
  promptDigest: string;
  resultSummary: string;
  createdAt: string;
};
```

## COO como orquestrador

O COO não precisa "conversar internamente" com subagentes como objetos em memória.

Ele deve delegar assim:

1. escolher subagente pelo registry;
2. compilar contexto do subagente;
3. rodar `codex exec` ou `codex exec resume` com a identidade desse subagente;
4. capturar resultado estruturado;
5. resumir de volta para o canal principal.

## Padrões de sessão

### Sessão longa

Use para:

- COO principal;
- subagentes com backlog próprio;
- canais com contexto contínuo;
- Telegram quando houver continuidade operacional real.

Implementação:

- guardar `codexThreadId`;
- usar `exec resume`.

### Sessão efêmera

Use para:

- consultas pontuais;
- validações técnicas;
- subtarefas descartáveis;
- fan-out de exploração.

Implementação:

- `exec --ephemeral`

## Seleção via Telegram

O Telegram deve operar sobre o registry.

Comandos recomendados:

- `/agents`: lista agentes ativos;
- `/coo`: volta ao agente principal;
- `/[nome]`: seleciona um agente pelo `slug`;
- `/new`: abre nova sessão para o agente atual;
- `/status`: mostra agente atual, sessão e thread id.

Exemplo de UX:

- `/agents`
- resposta: `coo`, `sales`, `ops`, `research`, `playwright`
- `/research`
- o canal passa a usar o subagente `research` até nova troca

## O que não fazer

- não usar uma única sessão da Codex para todos os agentes;
- não misturar policy, MCP e skills de agentes distintos dentro de um só prompt gigante;
- não fazer o COO "simular" subagentes só com prefixo textual.

## Decisão para o ACOO

A recomendação para a primeira versão é:

- um COO principal;
- no máximo 3 ou 4 subagentes reais;
- cada um com MCP profile claro;
- cada um com skill set curto;
- cada um com sessão própria por canal.

## Fontes

- OpenAI, "A practical guide to building agents": https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf
- OpenAI, "Codex" product page: https://openai.com/codex/
- OpenAI, "Introducing the Codex app": https://openai.com/index/introducing-the-codex-app/
