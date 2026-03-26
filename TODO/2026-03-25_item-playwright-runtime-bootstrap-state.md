# Playwright Runtime Bootstrap State

## Objective

Trocar o path atual de saúde do runtime `playwright` de um booleano implícito para um estado estruturado que diferencie evidência de sessão, metadata CDP e attach readiness antes de decidir autostart ou indisponibilidade.

## In Scope

- runtime `playwright`
- `scripts/playwright-mcp-healthcheck.mjs`
- `server/mcp/McpSessionBootstrapper.ts`
- `server/mcp/ManagedRuntimeAssessment.ts`
- `server/status/RuntimeStatusService.ts`
- testes diretamente afetados pelo novo contrato

## Out of Scope

- internalizar lifecycle de profile/processo do Brave
- reescrever launcher externo
- mudar skills operacionais nesta etapa
- copiar a arquitetura completa do Sales Operator

## Deliverable

Contrato estruturado de estado do runtime `playwright`, com uso real em `bootstrap` e `status` e testes cobrindo os estados novos.

## Acceptance Gate

- existe um resultado estruturado para o healthcheck do runtime
- `ensureReady` usa esse resultado antes de decidir `autostart`
- `status` expõe a granularidade nova sem quebrar a saída atual
- não restam falhas `high` ou `medium` nos testes do slice

## Slice Plan

1. Definir o contrato estruturado de estado do runtime `playwright`.
2. Adaptar `bootstrap` para usar o contrato antes de autostart.
3. Adaptar `status` e `assessment` para refletir o estado novo.
4. Atualizar testes e validar o slice.

## Current Slice

4. Atualizar testes e validar o slice.

## Findings

- o bootstrap atual depende de `checkHealth(): boolean`, o que colapsa falhas diferentes no mesmo ramo
- o healthcheck atual já coleta evidência suficiente para classificar pelo menos `cdp_unreachable`, `cdp_metadata_missing`, `attach_failed` e `ready`
- o risco principal é disparar `startupCommand` quando a sessão já existe mas o attach falhou por timing
- sub-agent `Ramanujan` recomendou estabilizar o contrato de estado antes de qualquer tentativa de portar lifecycle do Operator
- o healthcheck agora devolve estado estruturado com `statusCode`, `summary`, `detail` e evidência local
- o bootstrap agora faz `grace retry` para falhas transitórias de attach antes de relançar a sessão
- o bootstrap agora evita autostart inútil quando o problema é `wrapper_missing`
- `status` preserva o `state` público antigo (`off`/`ready`/`broken`), mas passou a expor `statusCode` para granularidade operacional
- o ramo `startup_command` também passou a carregar `statusCode`, evitando regressão diagnóstica nesse caminho
- revisão final do subagente:
  - `high`: nenhum
  - `medium`: nenhum
  - `low`: a distinção `session_absent` vs `cdp_unreachable` ainda depende de heurística local de processo/profile, porque o ACOO ainda não possui o lifecycle da sessão
- validação concluída com:
  - `npm run typecheck:server`
  - `node --import tsx --test server/mcp/McpSessionBootstrapper.test.ts server/status/RuntimeStatusService.test.ts server/agents/AgentSessionStarter.test.ts server/mcp/ManagedRuntimeDoctor.test.ts`
  - `npm run build`

## Remaining Failures

- low: o ACOO ainda depende de launcher externo e CDP global; este slice só melhorou o contrato e a decisão de bootstrap
- low: ainda não há internalização de lifecycle de profile/processo como no Operator
- low: `session_absent` vs `cdp_unreachable` ainda é inferido por evidência local, não por ownership direto da sessão

## Decision

Slice executado no escopo previsto e aprovado para avanço. Não restaram falhas `high` ou `medium`.

## Closure

Fechado para este slice. Próximo passo natural: alinhar `doctor`, `status` e documentação ao contrato novo antes de discutir internalização de lifecycle.
