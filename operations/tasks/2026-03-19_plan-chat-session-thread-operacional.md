# Task: Plano curto - unificar chat session e thread operacional

## Objective
Eliminar a ambiguidade entre chats do canal e `operations/threads/`, fixando a regra única de operação: chat é entrada/sessão; thread operacional é o registro canônico do assunto.

## In Scope
- Travar a nomenclatura operacional.
- Introduzir vínculo explícito de origem no modelo de thread.
- Ajustar docs e UI para não tratar sessão de chat como thread operacional.

## Out of Scope
- Migrar todo o histórico existente.
- Sincronizar automaticamente Telegram e Markdown.
- Reescrever o runtime de sessões do Telegram/Web.

## Deliverable
- Regra explícita no repositório.
- Campo de origem disponível em threads operacionais.
- UI do chat web sem linguagem ambígua sobre “thread”.

## Acceptance Gate
- Não restam falhas `high` ou `medium` sobre a distinção conceitual.
- Existe lugar explícito para apontar chat/mensagem de origem dentro da thread operacional.
- O repositório deixa claro que não existem duas threads equivalentes.

## Slice Plan
1. Travar objetivo e risco.
2. Abrir item ativo.
3. Implementar vínculo de origem + ajuste de linguagem.
4. Validar com teste e revisão de subagente.

## Current Slice
Slice ativo: implementar o vínculo explícito de origem nas threads operacionais e alinhar a linguagem mínima da UI/docs.

## Findings
- O runtime já separa `channelThreadId`/sessão conversacional de `operations/threads/`.
- A ambiguidade estava na linguagem e na ausência de vínculo explícito no modelo da thread.
- Subagente `Anscombe` pressionou corretamente que docs/UI sozinhos seriam insuficientes.
- A revisão final exigiu incluir `account` e `note` das referências de origem também no contexto operacional do agente.
- Validação local concluída com `npm run typecheck:server`, `node --import tsx --test server/infrastructure/markdown/threadMarkdown.test.ts` e `npm run build`.

## Remaining Failures
- `low`: o acervo histórico segue sem backfill automático.
- `low`: ainda não existe criação automática de thread operacional a partir do Telegram.
- `low`: a suíte ampla `npm run test:server` segue com falha pré-existente em `server/agents/OperationalAgentSelector.test.ts` sobre fallback de backup/default, não introduzida por este slice.

## Decision
Executar um corte mínimo profissional: modelo + parser + template + docs + UI.

## Closure
- Macro item único mantido.
- Slice concluído sem falhas `high` ou `medium` no escopo da unificação.
