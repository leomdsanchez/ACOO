# Item - Operational Registry Prisma Read Path

## Objective
- Tornar o registry operacional novo real no runtime do ACOO para pelo menos um caminho de leitura ponta a ponta via Prisma.

## In Scope
- Implementar um repositorio Prisma para leitura de `Project`, `Person`, `Thread` e `Task`.
- Mapear os modelos Prisma para o contrato atual do dominio operacional.
- Ligar esse repositorio no runtime para uma superficie validada.
- Validar uma leitura real com smoke test no ambiente carregado por `direnv`.

## Out of Scope
- Fluxos de escrita.
- Sincronizacao/export para `operations/*`.
- Migracao completa do acervo Markdown.
- UI.
- MCP proprio.

## Deliverable
- `PrismaOperationalRepository` funcional para leitura.
- Runtime com um caminho de leitura real usando Prisma.
- Smoke test executado com sucesso.

## Acceptance Gate
- Um caminho de leitura funciona ponta a ponta via Prisma no runtime real.
- O caminho validado nao depende do `FileSystemOperationalRepository`.
- A resposta usa o contrato atual sem valores fake.
- Existe smoke test executado com sucesso via `direnv`.
- Sem falhas `high` ou `medium` sobre fonte de verdade, wiring ou integridade do contrato.

## Slice Plan
1. Ler o contrato atual do dominio e do repositorio operacional.
2. Implementar `PrismaOperationalRepository` com os reads minimos necessarios.
3. Ligar o runtime e uma superficie validada a esse repositorio.
4. Rodar smoke test e revisar o gate.

## Current Slice
- `4. Rodar smoke test e revisar o gate.`

## Findings
- Challenge do sub-agente `Pasteur`: o menor slice profissional agora e um caminho de leitura real ponta a ponta via Prisma, sem escrita nem sync com Markdown.
- O `schema.prisma` ja continha os modelos novos de `Project`, `Person`, `Thread`, `Task` e auxiliares; o trabalho desta passada foi consolidar essa base em repositorio, service e superfícies reais.
- Foi criado `PrismaOperationalRegistryRepository` como camada de leitura estruturada do registry operacional novo.
- O runtime passou a expor `operationalRegistry` em `createOperationalRuntime`.
- A CLI `server:registry` agora expõe `blueprint`, `summary`, `projects`, `people`, `threads` e `tasks`.
- O `HttpServer` agora expõe `/api/registry/blueprint`, `/api/registry/summary`, `/api/registry/projects`, `/api/registry/people`, `/api/registry/threads` e `/api/registry/tasks`.
- A skill de projeto `.agents/skills/operational-registry-tool/SKILL.md` foi adicionada e confirmada pelo skill loader.
- Validacoes executadas com sucesso via `direnv`:
  - `npm run prisma:generate`
  - `npm run prisma:db:push`
  - `npm run server:registry -- summary --json`
  - `npm run server:registry -- projects --json`
  - `npm run server:registry -- people --json`
  - `npm run server:registry -- threads --json`
  - `npm run server:registry -- tasks --json`
  - `node --import tsx --input-type=module ... /api/registry/summary`
  - `node --import tsx --input-type=module ... /api/registry/blueprint`
  - `npm run server:agents -- skills --json`
- Review final do sub-agente `Pasteur`: sem falhas `high` ou `medium`; a passada pode ser encerrada com gaps `low`.

## Remaining Failures
- `low`: a entrega atual e de leitura, nao de escrita.
- `low`: a regra de import/export entre Prisma e `operations/*` foi definida, mas ainda nao implementada.
- `low`: faltam testes de regressao mais profundos para fidelidade de mapeamento.

## Decision
- Gate satisfeito para o item atual.
- Encerrar a passada com a tool legivel pelo runtime, acessivel por CLI/API e descobrivel pelo ACOO via skill local.

## Closure
- Item encerrado com leitura ponta a ponta via Prisma validada no runtime real.
