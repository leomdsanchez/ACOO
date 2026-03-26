# Playwright Runtime Refactor Macro Plan

## Objective

Reduzir falsos negativos no runtime `playwright` do ACOO, introduzindo uma camada interna de `session evidence + attach readiness` consumida por `bootstrap` e `status`, sem substituir nesta primeira etapa o launcher externo nem reescrever a arquitetura MCP.

Objetivo ampliado por decisão do usuário em `26/03/2026`:

- o alvo final não é apenas endurecer o bootstrap;
- o ACOO deve convergir para o modelo do `Operator`, com ownership local de `profile + processo + BrowserContext` e conexão MCP ancorada no contexto persistente do próprio processo.

## Completion Signal

- `server:status` expõe um estado de runtime mais granular que `healthy=true/false`.
- `ensureReady` deixa de tratar toda falha prévia como ausência simples de sessão.
- o `startupCommand` permanece como fallback somente quando o estado indicar ausência real de sessão ou indisponibilidade equivalente.
- o refactor fica concentrado no runtime `playwright` e coberto por testes.

## Non-Goals

- portar o modelo inteiro do Sales Operator para dentro do ACOO
- substituir o launcher externo/manual do Brave nesta etapa
- mudar a superfície MCP da Codex CLI
- redesenhar skills, prompts ou o fluxo operacional inteiro
- assumir lifecycle completo de profile, lease e processo dentro do ACOO

## Macro Items

1. Done: estruturar o estado do runtime `playwright` antes do autostart
   Deliverable: avaliação estruturada do runtime usada por `bootstrap` e `status`
2. Active: internalizar ownership do browser persistente no ACOO
   Deliverable: launcher/contexto persistente próprio + conexão MCP ancorada no contexto local
3. Active: alinhar doctor, status e runbook ao novo contrato
   Deliverable: contrato documentado e feedback operacional consistente
4. Pending: remover dependência estrutural do CDP externo como fonte principal de verdade
   Deliverable: bootstrap e status baseados no runtime possuído pelo ACOO

## Dependencies

- o item 2 depende do item 1
- o item 3 depende do item 2
- o item 4 depende do item 2 e do item 3

## Active Item

- `TODO/2026-03-26_item-playwright-runtime-browser-ownership.md`

## Sub-Agent Review

- Active sub-agent: `Tesla`
- Objective: desafiar o menor slice viável para mover o ACOO do modelo de attach externo para ownership local de browser persistente
- Reason for delegation: a skill `goal-to-slices-delivery` exige challenge externo antes de executar
- State: completed for ownership slice; fresh review needed for doctor/runbook consolidation
