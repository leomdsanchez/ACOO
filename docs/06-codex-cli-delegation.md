# Codex CLI Delegation

## Objetivo

Definir como o ACOO deve implementar delegação real entre agentes usando a infraestrutura atual da Codex.

## Resposta curta

A Codex CLI terminal não oferece hoje um recurso first-class de "agente pai delega para agente filho e recebe o resultado de volta" como uma primitive pronta do chat.

Ela oferece as peças:

- `exec`
- `exec resume`
- `resume`
- `fork`
- `cloud exec`
- `app-server` experimental

Então a delegação real precisa existir no backend do ACOO.

## O que a CLI suporta de forma confirmada

Superfície validada localmente:

- `codex exec`
- `codex exec resume`
- `codex resume`
- `codex fork`
- `codex cloud exec`
- `codex cloud status`
- `codex cloud list`
- `codex app-server --help`

Isso permite:

- sessões persistidas por agente;
- retomada de thread por agente;
- fan-out assíncrono com Codex Cloud;
- profiles/config por execução.

Isso nao entrega sozinho:

- handoff pai -> filho -> pai no mesmo canal como primitive pronta;
- agenda interna de subagentes;
- política de delegação do produto.

## Padrões recomendados

### 1. Troca de agente do canal

Uso:

- operação manual no Telegram;
- inspeção direta de um subagente;
- debugging.

Exemplo:

- `/agents`
- `/research`
- `/new`

Isso troca quem responde no canal.

### 2. Delegação real do COO

Uso:

- o usuário continua falando com o COO;
- o COO chama um subagente como executor especializado;
- o resultado volta ao COO.

Fluxo:

1. o COO recebe o pedido;
2. o backend cria uma `DelegationTask`;
3. o subagente roda em thread/sessão própria;
4. o backend coleta o resultado;
5. o COO sintetiza a resposta final.

### 3. Fan-out assíncrono

Uso:

- pesquisas longas;
- tarefas paralelas;
- jobs de background.

Fluxo:

- `codex cloud exec`
- `codex cloud status`
- persistir `taskId` no ACOO

## Estratégia por tecnologia

### CLI local

Boa para:

- primeira implementação;
- sessões locais persistidas;
- operação controlada pelo ACOO.

Limite:

- orchestration multiagente fica por conta do backend.

### Codex Cloud

Boa para:

- tarefas paralelas;
- execuções demoradas;
- fan-out.

Limite:

- requer modelagem de polling/status/apply.

### Codex SDK

Boa para:

- delegação e threads mais naturais;
- controle programático mais forte;
- camada multiagente de longo prazo.

Limite:

- maior mudança arquitetural comparado ao runtime atual.

## Recomendação para o ACOO

### Agora

Implementar:

- `DelegationTask`
- `AgentDelegationOrchestrator`
- `delegateToAgent(agentSlug, taskPrompt, options)`

Runtime:

- sessão principal do COO preservada;
- subagente rodando em `exec` ou `exec resume`;
- retorno estruturado para o COO.

### Depois

Adicionar:

- `CloudDelegationExecutor`
- fila assíncrona para tarefas longas

### Futuramente

Avaliacao de migração da camada de delegação para `Codex SDK`.

## Regras de arquitetura

- não sobrescrever o agente ativo do canal para simular delegação;
- não compartilhar uma única sessão da Codex entre múltiplos agentes;
- não misturar skills e MCPs de todos os agentes em um só prompt;
- guardar `parentSessionId`, `childSessionId` e resultado resumido da delegação;
- manter o COO como dono da resposta final ao usuário.

## Próximo passo de implementação

1. adicionar `DelegationTask` no banco;
2. criar `AgentDelegationOrchestrator`;
3. permitir que o COO invoque subagente por tool interna;
4. registrar runs pai/filho;
5. depois levar isso para Telegram/UI.

## Fontes

- OpenAI, "Introducing the Codex app": https://openai.com/index/introducing-the-codex-app/
- OpenAI Help Center, "What is Codex?": https://help.openai.com/en/articles/11369540/
- OpenAI, "Codex is now generally available": https://openai.com/index/codex-now-generally-available/
- OpenAI, "A practical guide to building agents": https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf
