# Task: UTEC - adaptar proposta de curso para incubados e enviar ao Leonel

## Objective
Adaptar a pagina/material atual da proposta de curso para incubados da UTEC e enviar a versao atualizada ao `Leonel` ate `19/03/2026`.

## In Scope
- Localizar a pagina/material base ja existente.
- Definir o recorte da adaptacao para incubados da UTEC.
- Ajustar o material no formato adequado para envio.
- Enviar a versao atualizada ao `Leonel` no canal correto.

## Out of Scope
- Redesenhar toda a oferta comercial do curso.
- Criar um programa academico completo do zero sem base existente.
- Negociacao comercial posterior.
- Demais itens da fila (`Geaseg`, `Vercel Chat UI`, `Leticia UTEC`).

## Deliverable
- Pagina/material adaptada.
- Envio confirmado ao `Leonel`.

## Acceptance Gate
- Material base identificado.
- Adaptacao feita com foco em incubados da UTEC.
- Envio ao `Leonel` confirmado em origem.
- Nenhuma falha `high` ou `medium` restante antes de fechar.

## Slice Plan
1. Validar qual e a pagina/material base.
2. Travar o recorte da adaptacao.
3. Editar a pagina/material.
4. Enviar ao `Leonel` e confirmar.

## Current Slice
Nenhum slice ativo. Material adaptado e envio concluido.

## Findings
- Thread associada: [2026-03-18_utec-curso-incubados-proposta.md](/Users/leosanchez/Documents/DEV/ACOO/operations/threads/2026-03-18_utec-curso-incubados-proposta.md)
- Evidencia local consolidada: em `18/03/2026 14:13`, foi respondido no grupo `Curso Incubados UTEC` que a pagina seria adaptada e enviada `amanha`.
- Prazo operacional absoluto: `19/03/2026`.
- Subagente ativo: `019d02c4-c97a-7362-8bbb-e773a0d9da79` (`Gauss`).
- Objetivo do subagente: pressionar a ordem da fila e validar se este deveria ser o item ativo.
- Razao da delegacao: challenge obrigatorio de prioridade e sequencia.
- Estado do thread do subagente: reutilizado como reviewer da fila, com delta limitado para confirmar o item ativo.
- Validacao em origem concluida:
  - pagina adaptada localizada no Notion como `Propuesta Ejecutiva - Formación para Incubados y Preincubados UTEC`
  - URL validada: `https://www.notion.so/32738c9506cb81f3afa9c8d71ffd45b3`
  - canal final validado em origem: grupo de WhatsApp `Curso Incubados UTEC`
- Execucao concluida:
  - PDF local gerado com logo oficial da Neural em `tmp/utec-incubados-propuesta-2026-03-19.pdf`
  - mensagem com link da proposta enviada no grupo `Curso Incubados UTEC` em `19:11`
  - PDF enviado no mesmo grupo com a legenda `Te comparto también el PDF con logo de Neural para elevar a aprobación.` em `19:14`

## Remaining Failures
- `low`: o PDF enviado foi gerado localmente a partir do conteudo executivo validado, e nao exportado diretamente do Notion.

## Decision
Encerrar. O material adaptado foi validado em origem e o envio ao `Leonel` foi executado no canal correto.

## Closure
- Item concluido em `19/03/2026` com pagina adaptada, link enviado e PDF com logo da Neural anexado no grupo `Curso Incubados UTEC`.
