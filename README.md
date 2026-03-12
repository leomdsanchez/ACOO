# ACOO

Repositório operacional de apoio ao COO, com threads, tasks e instruções de execução.

## Estrutura

- `threads/`: histórico operacional ativo
- `threads-arquivadas/`: histórico encerrado
- `tasks/`: itens acionáveis em andamento
- `tasks-arquivadas/`: itens concluídos ou retirados de execução
- `agents/`: instruções operacionais dos agentes

## Observação

Este repo foi extraído de um acervo antes mantido dentro de `FocusTab/ALFREDO`.
O conteúdo original foi preservado no `FocusTab` para migração controlada.

## App local

Este repositório agora também expõe uma interface React + Vite para servir como camada operacional local.

## Estrutura inicial do core operacional

- `server/`: backend inicial para domínio operacional, serviços e catálogo de tools MCP
- `data/projects.json`: seed inicial de projetos estruturados
- `data/contacts.json`: seed inicial de contatos estruturados

### Como rodar

```bash
npm install
npm run dev
```

Build de produção:

```bash
npm run build
```
