# Task: Fila de execucao - UTEC, Geaseg e Chat UI

## Objective
Fechar uma fila unica e executavel para as frentes abertas em `18/03/2026`, preservando um unico item ativo por vez e deixando explicitos os bloqueios reais, a ordem e os criterios de avanço.

## In Scope
- Consolidar as frentes ativas recentes em uma unica fila.
- Definir ordem de execucao e dependencias.
- Escolher um unico item ativo.
- Registrar o challenge de subagente sobre escopo e sequencia.
- Atualizar o canônico de tarefas com os itens acionaveis.

## Out of Scope
- Executar todas as tasks desta fila neste documento.
- Redefinir a estrategia comercial da UTEC.
- Resolver frentes sem informacao minima validada em origem.
- Implementar a Vercel Chat UI nesta etapa.

## Deliverable
- Macro-plano documentado com ordem, dependencias e item ativo.
- Item ativo separado em documento proprio.
- `TAREFAS_ATIVAS.md` atualizado com a fila acionavel.

## Acceptance Gate
- Objetivo explicito.
- Um unico item ativo.
- Nenhuma falha `high` ou `medium` restante sobre a ordem da fila.
- Challenge de subagente registrado.
- Canônico de tarefas refletindo a fila.

## Slice Plan
1. Travar objetivo e listar frentes.
2. Rodar challenge de subagente sobre ordem e dependencias.
3. Registrar macro-plano e item ativo.
4. Atualizar o canônico de tarefas.

## Current Slice
Slice ativo por override do Leonardo: abrir o item proprio da `Vercel Chat UI`, travar o criterio de aceite e concluir o parecer de compatibilidade.

## Findings
- Frentes consolidadas do turno:
  - `UTEC - curso incubados`: adaptar a pagina/material e enviar para `Leonel` ate `19/03/2026`.
  - `Geaseg`: agendar reuniao com a `Fernanda` correta no Calendar com o email dela no convite.
  - `ACOO`: revisar se `Vercel Chat UI` funciona no repo atual.
  - `UTEC - automacao de salas`: aguardar retorno da `Leticia Mateos` sobre a proposta enviada.
- Subagente ativo: `019d02c4-c97a-7362-8bbb-e773a0d9da79` (`Gauss`).
- Objetivo do subagente: pressionar objetivo, ordem, dependencias e item ativo da fila.
- Razao da delegacao: challenge obrigatorio pela skill `goal-to-slices-delivery` antes de travar a sequencia.
- Estado do thread do subagente: novo thread, porque nao havia reviewer ativo para esta fila consolidada.
- O subagente recomendou como item ativo `UTEC - curso incubados`, por ser o unico com prazo explicito em `19/03/2026`.
- O subagente apontou falhas `high` na task de Geaseg por falta de desambiguacao da Fernanda e ausencia de dados da reuniao.
- O subagente apontou falha `medium` na revisao de `Vercel Chat UI` por falta de criterio de aceite de "funciona".
- O subagente apontou falha `medium` em tratar o retorno da `Leticia` como item ativo, ja que hoje a frente esta em espera externa.
- Em `18/03/2026`, o Leonardo redirecionou o foco para `Vercel Chat UI`; a fila segue igual, mas o item ativo muda por override explicito do owner.

## Remaining Failures
- `low`: a task de `Geaseg` ainda depende de dados minimos para sair de `Aguardando decisão`.
- `low`: o item da `Vercel Chat UI` precisa refletir explicitamente a diferenca entre `template/app Vercel` e `bibliotecas reutilizaveis`.

## Decision
Fila travada com ordem unica:
1. `UTEC - curso incubados`
2. `Geaseg - agendar reuniao com Fernanda`
3. `ACOO - revisar Vercel Chat UI`
4. `UTEC - automacao de salas` segue em `Aguardando terceiro`, fora do item ativo.

Override operacional:
- item ativo atual: `ACOO - revisar Vercel Chat UI`
- motivo: redirecionamento explicito do Leonardo no turno atual

## Closure
- Macro-plano registrado.
- Item ativo definido como `UTEC - curso incubados`.
- Somente um item ativo.
