# Playwright Runtime Browser Ownership

## Objective

Mover o ACOO do modelo de runtime `playwright` baseado em attach externo por CDP para um modelo mais próximo do `Operator`, em que o próprio ACOO possui o profile persistente, o processo do browser e o `BrowserContext` usado pela conexão MCP.

## In Scope

- criação do menor adaptador local de browser persistente para o runtime `playwright`
- definição de diretórios de profile/output próprios do ACOO
- lease de profile para evitar concorrência local
- integração inicial com `@playwright/mcp` usando `contextGetter`
- bootstrap do runtime `playwright` ancorado nesse ownership local

## Out of Scope

- reescrever todas as skills de browser nesta etapa
- redesenhar o control plane inteiro
- migração completa do doctor e runbooks no mesmo slice
- múltiplos profiles por agente/empresa logo de saída, se isso ampliar demais o corte

## Deliverable

Primeiro runtime persistente possuído pelo ACOO para `playwright`, com `profile`, `lease`, `launchPersistentContext` e conexão MCP ancorada no contexto local em vez de depender só de CDP externo.

## Acceptance Gate

- existe um componente local do ACOO que resolve `profile dir`, `output dir` e lease
- o ACOO consegue abrir ou reutilizar `BrowserContext` persistente próprio
- a conexão MCP pode ser criada a partir desse contexto
- o bootstrap deixa de depender estruturalmente de `connectOverCDP` para provar prontidão

## Slice Plan

1. Definir o menor adaptador de browser persistente do ACOO.
2. Criar ownership de `profile dir` e lease.
3. Integrar `launchPersistentContext` e conexão MCP com `contextGetter`.
4. Plugar o novo runtime no bootstrap/status com validação mínima.

## Current Slice

5. Consolidar doctor/runbook/arquitetura para o owner local virar o contrato explícito.

## Findings

- o `Operator` possui `profile`, `lease`, `launchPersistentContext` e `createConnection(..., contextGetter)` no próprio processo
- o `ACOO` ainda trata `playwright` como runtime externo e usa CDP externo como fonte principal de verdade
- o usuário deixou explícito em `26/03/2026` que o alvo é ficar “igual” ao `Operator`, não apenas mais robusto
- o `ACOO` agora tem `PlaywrightProfileLease` e `PlaywrightSessionOwner`
- o owner local resolve Brave, cria `profile dir` e `output dir`, adquire lease e abre `launchPersistentContext`
- o owner local já cria conexão MCP com `@playwright/mcp` via `contextGetter`
- o `McpSessionBootstrapper` agora prefere o owner local do `playwright` antes do launcher externo
- o launcher externo antigo continua existindo apenas como fallback estrutural
- o `doctor` agora expõe também evidência da sessão operacional local (`profile`, `lock`, `output dir`)
- `README`, runbook e doc de arquitetura foram atualizados para tratar o owner local como modelo principal
- validação concluída com:
  - `npm run typecheck:server`
  - `node --import tsx --test server/mcp/McpSessionBootstrapper.test.ts server/status/RuntimeStatusService.test.ts server/agents/AgentSessionStarter.test.ts server/mcp/ManagedRuntimeDoctor.test.ts`
  - `npm run build`
  - `npm run server:mcp -- doctor playwright --pretty`

## Remaining Failures

- low: o fallback por launcher externo ainda existe, então o ACOO ainda convive com duas rotas possíveis para a sessão `playwright`
- low: algumas mensagens e testes ainda usam linguagem centrada em `CDP` legado, mesmo com owner local já dominante
- low: o comando `server:mcp ensure playwright` continua sendo um processo curto; o ownership local rende melhor nos processos long-lived do ACOO
- low: revisão final do subagente desta consolidação segue pendente no momento deste registro

## Decision

Slice ampliado e executado no escopo previsto. ACOO agora possui ownership local do browser e o contrato textual/operacional principal já foi movido para essa rota; falta reduzir o fallback externo.

## Closure

Aberto apenas para o corte final de remoção estrutural do fallback legado.
