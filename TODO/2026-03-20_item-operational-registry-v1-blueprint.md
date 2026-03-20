# Item - Operational Registry Tool v1 Blueprint

## Objective
- Travar o blueprint v1 da nova tool interna do ACOO para `Agent`, `Project`, `Person`, `Thread` e `Task`, deixando uma superficie minima executavel para smoke test.

## In Scope
- Criar os artefatos de planejamento em `/TODO`.
- Fixar o modelo v1 de entidades e relacoes no nivel de blueprint.
- Escolher a superficie inicial da tool para a v1 curta.
- Entregar um comando executavel que exponha esse blueprint de forma estruturada.

## Out of Scope
- CRUD completo do registry operacional.
- Migracao do acervo atual para Prisma.
- UI do control plane para essas entidades.
- MCP proprio para essa tool.

## Deliverable
- Macro-plano em `/TODO`.
- Item ativo em `/TODO`.
- Comando executavel que imprime o blueprint v1 da tool em formato estruturado.

## Acceptance Gate
- Sem falhas `high` ou `medium` sobre objetivo, escopo ou superficie inicial.
- Um unico slice ativo por vez.
- Existe um comando executavel para expor o blueprint.
- O comando roda localmente e devolve saida coerente com o combinado.

## Slice Plan
1. Criar os documentos de plano e item em `/TODO`.
2. Implementar um comando minimo para expor o blueprint v1 da tool.
3. Rodar smoke test do comando.
4. Atualizar findings, falhas remanescentes e decisao.

## Current Slice
- `4. Atualizar findings, falhas remanescentes e decisao.`

## Findings
- O repo ja opera com `Agent` em Prisma e `Project`/`Person`/`Thread`/`Task` em filesystem, o que reforca a necessidade de um blueprint intermediario antes da migracao.
- Challenge do sub-agente `Pasteur`: nao ha falha `high` se o slice ficar restrito a planejamento e scaffold testavel; a principal ambiguidade `medium` e o que exatamente conta como "testar a tool" nesta etapa.
- Decisao operacional do slice: a superficie minima aceitavel agora sera uma CLI interna de blueprint; MCP fica explicitamente para depois.
- O macro-plano foi criado em `/TODO/2026-03-20_plan-operational-registry-tool.md`.
- O comando minimo foi scaffoldado em `server/commands/registry.ts`, alimentado por `server/domain/OperationalRegistryBlueprint.ts`, e exposto pelo script `server:registry`.
- Smoke test tentado:
  - `npm run server:registry -- blueprint --json`
  - `npm run server:registry -- blueprint`
- Ambos falharam por ambiente sem runtime JavaScript disponivel: `npm`, `node`, `pnpm`, `yarn`, `bun` e `tsx` ausentes neste shell.
- Validacao concluida com ambiente carregado por `direnv`:
  - `direnv exec . bash -lc 'npm run server:registry -- blueprint --json'`
- O comando executou com saida coerente e expôs o blueprint v1 em JSON.
- Review final do sub-agente `Pasteur`: sem falhas `high` ou `medium`; restam apenas gaps `low` sobre futuras superficies de escrita e integracao com Prisma.

## Remaining Failures
- `low`: o smoke test valida apenas a superficie de leitura `blueprint`, nao CRUD nem persistencia real.
- `low`: a integracao futura com Prisma e a sincronizacao com `operations/*` seguem como trabalho das proximas fases.

## Decision
- Gate satisfeito para o item atual.
- Avancar para o proximo macro item quando for priorizado: expandir schema Prisma e contrato de repositorio operacional.

## Closure
- Item encerrado com planejamento, scaffold minimo e smoke test bem-sucedido da CLI `server:registry`.
