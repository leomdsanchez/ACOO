# Control Plane Item 01

## Objective

Implementar a v1 da tool local de control plane com schema Prisma e CLI para `projects`, `people`, `threads` e `tasks`, preservando o runtime atual baseado em filesystem.

## In Scope

- adicionar models Prisma para o dominio operacional inicial
- adicionar repositorio local para CRUD basico em SQLite
- adicionar CLI para `create` e `list`
- executar smoke test real no fim

## Out of Scope

- integracao com `OperationalWorkspace`
- importacao de `operations/*`
- UI
- MCP
- edicao de logs complexa

## Deliverable

- `prisma/schema.prisma` expandido
- `server/control-plane/ControlPlaneRepository.ts`
- `server/commands/control-plane.ts`
- script npm para executar a tool

## Acceptance Gate

- schema Prisma valido e gerado
- comando CLI funciona para criar e listar entidades
- smoke test executado sem falha
- nenhum `high` ou `medium` aberto no slice

## Slice Plan

1. Active: modelar schema e repositorio minimo
2. Pending: expor CLI para create/list
3. Pending: aplicar banco e executar smoke test

## Current Slice

Slice 1 ativo: modelar schema Prisma e repositorio minimo sem tocar no runtime atual.

## Findings

- o repo ja tem Prisma para `Agent*`, mas `Project/Person/Thread/Task` ainda vivem fora do banco
- nao existe pasta `/TODO` no repo; foi criada agora como artefato de planejamento
- a interpretacao operacional mais segura para "testar a tool no final" e smoke test da nova CLI local, nao MCP

## Remaining Failures

- high: nenhum
- medium: ainda falta confirmar o resultado do sub-agent review de planejamento
- medium: a tool ainda nao existe

## Decision

Prosseguir com schema + repositorio + CLI. Nao abrir o proximo slice antes de gerar o banco e validar a tool.

## Closure

Aberto.
