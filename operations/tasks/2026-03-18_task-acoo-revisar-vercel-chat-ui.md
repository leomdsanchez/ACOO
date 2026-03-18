# Task: ACOO - revisar se Vercel Chat UI funciona no repo

## Objective
Determinar com qualidade de decisao se a `Vercel Chat UI` pode ser adotada no ACOO atual sem descaracterizar a arquitetura base do repo, classificando o encaixe como `fit direto`, `fit com adaptacao relevante` ou `replatform/incompativel para agora`.

## In Scope
- Validar o stack real atual do ACOO.
- Separar `template/app Vercel Chat UI` de `bibliotecas reutilizaveis da AI SDK UI`.
- Validar o contrato esperado de frontend e backend.
- Identificar o delta arquitetural minimo para encaixe.
- Produzir um parecer tecnico curto e defendavel.

## Out of Scope
- Implementar prova de conceito.
- Migrar o ACOO para `Next.js`.
- Reescrever o backend para encaixar na Vercel.
- Fazer redesign visual da interface.
- Prometer integracao direta sem evidencia tecnica.

## Deliverable
- Parecer tecnico com classificacao final:
  - `fit direto`
  - `fit com adaptacao relevante`
  - `replatform/incompativel para agora`
- Lista minima de adaptacoes obrigatorias.

## Acceptance Gate
- Stack atual validado em codigo.
- Requisitos minimos da Chat UI validados em fonte oficial.
- Diferenca entre `template/app` e `bibliotecas reutilizaveis` explicitada.
- Nenhuma falha `high` ou `medium` restante na classificacao final.

## Slice Plan
1. Travar o criterio de aceite de "funciona".
2. Validar o stack real do ACOO em codigo.
3. Validar o que a Vercel/AI SDK exige em fonte oficial.
4. Comparar os dois lados e classificar o encaixe.

## Current Slice
Slice 4 ativo: comparar o stack atual do ACOO com os requisitos da Vercel/AI SDK e fechar a classificacao final.

## Findings
- Stack atual validado em codigo:
  - frontend em `Vite + React`, sem `Next.js`: [package.json](/Users/leosanchez/Documents/DEV/ACOO/package.json), [src/App.tsx](/Users/leosanchez/Documents/DEV/ACOO/src/App.tsx)
  - UI atual e um dashboard operacional, nao uma shell conversacional: [src/RuntimeDashboard.tsx](/Users/leosanchez/Documents/DEV/ACOO/src/RuntimeDashboard.tsx)
  - backend HTTP customizado com endpoints operacionais (`/api/status`, `/api/mcp`, `/api/agents`, `/api/sessions`, `/api/runs`), sem endpoint `/api/chat`: [server/api/HttpServer.ts](/Users/leosanchez/Documents/DEV/ACOO/server/api/HttpServer.ts)
  - runtime conversacional existe internamente no `AgentController`, mas retorna resposta completa e nao um contrato de chat/stream para frontend: [server/controller/AgentController.ts](/Users/leosanchez/Documents/DEV/ACOO/server/controller/AgentController.ts)
- Fonte oficial validada:
  - a AI SDK UI suporta `useChat` com `DefaultChatTransport` apontando para um endpoint customizado
  - a AI SDK UI tambem suporta `TextStreamChatTransport` para backends que fazem stream de texto simples
  - isso indica que bibliotecas da AI SDK UI podem ser reaproveitadas fora de `Next.js`, desde que exista um endpoint de chat compativel
- Challenge de subagente 1 (`Gauss`): apontou como falha `high` o fato de o frontend atual nao ser uma chat shell e o backend nao expor superficie HTTP de chat/stream consumivel.
- Challenge de subagente 2 (`Aristotle`): pressionou a diferenca entre `template/app Vercel Chat UI` e `bibliotecas reutilizaveis`, evitando uma conclusao enganosa.
- Criterio de aceite travado para esta review:
  - `fit direto`: funciona sem migracao estrutural e sem criar uma nova superficie de chat
  - `fit com adaptacao relevante`: reaproveita partes da AI SDK UI, mas exige nova superficie de chat e adaptacao relevante do frontend/backend
  - `replatform/incompativel para agora`: exigiria virar outro app ou descaracterizar o ACOO

## Remaining Failures
- `low`: a conclusao ainda pode ser refinada depois com um recorte adicional entre `usar hooks/componentes` e `adotar o template completo`, mas isso nao bloqueia a classificacao atual.

## Decision
Classificacao final: `fit com adaptacao relevante` para reaproveitar bibliotecas da AI SDK UI, e `replatform/incompativel para agora` para adotar a `Vercel Chat UI` como template/app principal no ACOO atual.

Resumo defensavel:
- `nao` e fit direto para o repo atual
- `sim`, partes da AI SDK UI podem funcionar no ACOO se criarmos uma superficie propria de chat no frontend atual e um endpoint `/api/chat` com stream no backend
- `nao` faz sentido adotar o template/app da Vercel como encaixe direto sem replatform parcial relevante

## Closure
- Parecer tecnico fechado com base em codigo do repo e fonte oficial da AI SDK UI.
- Sem falhas `high`.
- Sem falhas `medium`.
