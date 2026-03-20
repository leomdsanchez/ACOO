# Control Plane Tool Macro Plan

## Objective

Entregar uma tool local do ACOO, baseada em SQLite + Prisma, para operar o registry inicial de `projects`, `people`, `threads` e `tasks` sem substituir ainda `operations/*` como acervo operacional.

## Completion Signal

- existe schema Prisma para o dominio operacional inicial acordado
- existe uma CLI local para criar e listar entidades basicas
- a tool roda contra `data/acoo.db`
- a tool e testada no final com um smoke test real

## Non-Goals

- migrar o runtime atual de `OperationalWorkspace` para Prisma
- substituir `operations/threads` e `operations/tasks`
- desenhar metodologia final de uso de status
- expor MCP ou API completa para o novo dominio

## Macro Items

1. Active: definir e implementar o slice inicial da control plane local
   Deliverable: schema Prisma + CLI `server:control-plane` + smoke test
2. Pending: conectar o dominio novo ao backend HTTP do ACOO
   Deliverable: endpoints `/api/control-plane/*`
3. Pending: decidir e implementar projeções para `operations/*`
   Deliverable: exporter/sync com Markdown operacional
4. Pending: avaliar fachada MCP para interoperabilidade externa
   Deliverable: decisao documentada e, se aprovada, adaptador MCP

## Dependencies

- o item 2 depende do item 1
- o item 3 depende do item 1
- o item 4 depende do item 1 e da validacao de uso local

## Active Item

- `TODO/control-plane-item-01-registry-v1.md`

## Sub-Agent Review

- Active sub-agent objective: desafiar objetivo, escopo e interpretacao de "testar a tool no final"
- Reason for delegation: validacao independente do gate de planejamento antes de executar o slice
- State: spawned for planning review
