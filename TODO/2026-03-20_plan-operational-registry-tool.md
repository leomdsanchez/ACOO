# Plano - Operational Registry Tool v1

## Objective
- Definir um plano executavel para a primeira versao de uma tool interna do ACOO, com SQLite/Prisma como fonte de verdade para `Agent`, `Project`, `Person`, `Thread` e `Task`, preservando `operations/*` como contexto operacional e trilha auditavel, nao como storage primario.

## Completion Signal
- Existe um macro-plano em `/TODO`.
- Existe um item ativo em `/TODO` com um unico slice corrente.
- O plano fixa a v1 do modelo de entidades, a superficie inicial da tool e o caminho de implementacao e teste.
- Existe ao menos um artefato executavel ou contrato testavel ligado a essa tool ao fim do slice atual.

## Non-Goals
- Nao implementar toda a control plane nesta passada.
- Nao migrar todo o acervo Markdown para o banco nesta passada.
- Nao abrir um MCP proprio como superficie principal da v1.
- Nao fechar metodologia final de uso de status alem do que ja foi acordado.

## Macro Plan
1. Travar o blueprint v1 da tool e a superficie inicial.
   - Entregavel: documento de plano, item ativo e contrato executavel da v1.
2. Expandir o schema Prisma e o contrato de repositorio operacional.
   - Entregavel: modelos Prisma para `Project`, `Person`, `Thread`, `Task` e auxiliares, com decisoes de cardinalidade e status congeladas.
3. Implementar a primeira superficie util da tool.
   - Entregavel: CLI interna ou API local com leitura estruturada e CRUD minimo do registry operacional.
4. Definir estrategia de sincronizacao com `operations/*`.
   - Entregavel: regra explicita de import inicial, export derivado e auditoria operacional.
5. Validar a tool com smoke tests e fluxos reais do repo.
   - Entregavel: comandos executados, saidas checadas e riscos remanescentes registrados.

## Active Macro Item
- `nenhum - passada encerrada`

## Dependencies
- Modelo v1 acordado para `Project`, `Person`, `Thread`, `Task` e entidades auxiliares.
- Registry atual de agentes em Prisma.
- Arquitetura do backend como control plane da Codex CLI.
- Preservacao de `operations/threads/` e `operations/tasks/` como acervo operacional.

## Active Sub-Agents
- `019d0c85-b3b7-7f41-8329-03aa6af94f7a` (`Pasteur`)
  - Objective: challenge do proximo macro item, fronteira do slice e gate de aceite.
  - Reason for delegation: reutilizar a mesma thread de review para cumprir a camada obrigatoria de challenge sem reiniciar contexto do zero.
  - Status: concluido

## Sync Strategy
- `Prisma/SQLite` e a fonte de verdade estruturada do registry operacional novo.
- `operations/*` permanece como contexto operacional e trilha auditavel humana.
- Nesta passada nao ha `dual-write`: a leitura nova sai de Prisma; o acervo Markdown continua preservado para contexto, nao como storage primario dessa superficie.
- Importacao inicial e exportacao derivada ficam explicitamente para a proxima fase, evitando ambiguidade operacional no meio da migracao.

## Closure
- Macro item 1 concluido: blueprint e CLI minima entregues e testados.
- Macro item 2 concluido: schema Prisma e caminho de leitura ponta a ponta via runtime real entregues.
- Macro item 3 concluido na passada atual: superficie util da tool entregue por CLI, API local e skill do projeto.
- Macro item 4 concluido no nivel de estrategia: regra de fonte de verdade e sincronizacao explicitada sem dual-write prematuro.
- Macro item 5 concluido: smoke tests reais executados via `direnv`, incluindo Prisma, CLI, HTTP efemero e descoberta da skill.
- Restam apenas gaps `low` para futuras passadas: escrita real do registry, import/export com `operations/*` e testes de regressao mais profundos.
