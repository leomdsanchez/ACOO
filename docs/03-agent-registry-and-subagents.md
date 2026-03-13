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

Mas existe uma distinção crítica:

- `troca de agente no canal`: o chat deixa de falar com o COO e passa a falar com outro agente;
- `delegação real`: o usuário continua falando com o COO, e o COO aciona um subagente em sessão filha.

No ACOO, a delegação correta é a segunda.

Ela deve funcionar assim:

1. COO escolhe o subagente pelo registry;
2. o backend compila contexto do subagente;
3. o backend abre ou retoma uma sessão filha da Codex para esse subagente;
4. o subagente executa a tarefa;
5. o backend captura resultado estruturado;
6. o COO resume isso de volta para o canal principal.

Ou seja: o `activeAgentSlug` do canal principal não deve ser sobrescrito para simular delegação.

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

## O que a Codex CLI suporta hoje

Pela superfície atual da CLI:

- `codex exec`: execução não interativa;
- `codex exec resume`: retomada de sessão persistida;
- `codex resume` / `codex fork`: retomada e bifurcação de sessões interativas;
- `codex cloud exec`: submissão de tarefas remotas em Codex Cloud;
- `codex app-server`: protocolo experimental.

A CLI terminal não expõe um recurso first-class de "delegar para subagente e voltar o resultado para o agente pai" no mesmo chat.

Então, no ACOO:

- `troca de agente por Telegram` é controle de canal;
- `delegação COO -> subagente` precisa ser implementada no backend.

## Modelo recomendado para delegação real

### DelegationTask

```ts
type DelegationTask = {
  id: string;
  parentAgentId: string;
  childAgentId: string;
  parentSessionId: string | null;
  childSessionId: string | null;
  channel: "telegram" | "web" | "cli";
  status: "queued" | "running" | "completed" | "failed";
  prompt: string;
  resultSummary: string | null;
  createdAt: string;
  updatedAt: string;
};
```

### Regras

- o COO mantém a sessão principal;
- cada subagente roda em sessão própria;
- a sessão filha pode ser `resume` ou `ephemeral`, dependendo da estratégia do agente;
- o resultado do subagente volta ao COO como input estruturado;
- o usuário continua vendo o COO como dono do chat.

## Estratégia recomendada por runtime

- preferir `Codex SDK` quando a meta for multi-thread, multi-run e handoff mais forte;
- usar `Codex CLI + exec/resume` para a primeira implementação local;
- usar `Codex Cloud` para fan-out assíncrono e tarefas paralelas mais longas;
- não depender de "troca de agente do canal" como substituto de delegação.

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

Isso é útil como controle manual do operador.

Mas isso nao substitui delegação real do COO.

## O que não fazer

- não usar uma única sessão da Codex para todos os agentes;
- não misturar policy, MCP e skills de agentes distintos dentro de um só prompt gigante;
- não fazer o COO "simular" subagentes só com prefixo textual.
- não tratar `/research` ou `/<slug>` como se isso fosse handoff interno entre agentes.

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
