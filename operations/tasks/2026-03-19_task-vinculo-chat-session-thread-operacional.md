# Task: Vincular chat session a thread operacional

## Objective
Adicionar um vínculo explícito de origem nas threads operacionais e impedir que a UI/documentação trate a sessão do canal como se fosse a thread operacional do assunto.

## In Scope
- Estender o modelo de thread com referência de origem.
- Renderizar e parsear essa referência no Markdown.
- Expor a origem no contexto operacional.
- Ajustar a cópia da UI Web e a documentação principal.

## Out of Scope
- Criar sincronização automática Telegram -> thread.
- Migrar todas as threads antigas.
- Criar painel novo de reconciliação.

## Deliverable
- `ThreadRecord` com `sourceReferences`.
- Seção `Referências de Origem` no Markdown de threads.
- UI Web exibindo “Sessão” em vez de “Thread” para o canal.

## Acceptance Gate
- Um desenvolvedor consegue distinguir sessão de chat e thread operacional sem inferência.
- Uma thread pode registrar explicitamente `telegram chat/message` ou outra origem real.
- Não restam falhas `high` ou `medium` no slice.

## Slice Plan
1. Atualizar domínio e templates.
2. Atualizar parser e contexto.
3. Ajustar docs/UI.
4. Testar e revisar.

## Current Slice
Slice ativo: concluir domínio/template/parser/contexto e fechar a revisão final.

## Findings
- A ambiguidade principal estava em `src/runtimeDashboard/screens/ChatScreen.tsx` e na falta de metadado explícito em `server/domain/models.ts`.
- A thread `Sala UTEC` já tinha evidência suficiente para receber uma referência de origem real como exemplo mínimo.
- Subagente `Anscombe` foi reutilizado para challenge do objetivo e do corte do slice; a delegação foi necessária para cumprir a skill e pressionar riscos estruturais.
- A revisão final encontrou uma lacuna média em `OperationalContextService`: `account` e `note` das referências de origem não chegavam ao prompt; isso foi corrigido no mesmo slice.

## Remaining Failures
- `low`: histórico existente continua podendo estar sem referência de origem.
- `low`: `npm run test:server` continua falhando em um teste pré-existente de fallback do seletor de agente (`server/agents/OperationalAgentSelector.test.ts`), fora do escopo desta entrega.

## Decision
Implementação mínima concluída sem abrir uma segunda arquitetura.

## Closure
- Validado com `npm run typecheck:server`.
- Validado com `node --import tsx --test server/infrastructure/markdown/threadMarkdown.test.ts`.
- Validado com `npm run build`.
- Slice encerrado com apenas riscos `low` aceitos.
