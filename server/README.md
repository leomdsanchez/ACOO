# Operational Core

Estrutura inicial do backend operacional para o ACOO.

## Objetivo

- preservar `threads/` e `tasks/` atuais como acervo operacional;
- introduzir um domínio explícito para `projects`, `contacts`, `threads` e `tasks`;
- preparar a camada de serviços e o catálogo de tools para um futuro servidor MCP;
- deixar um ponto de integração claro para uso do Codex CLI como runtime de execução.

## Módulos

- `domain/`: tipos e contratos do domínio operacional.
- `application/`: portas e serviços que orquestram o workspace.
- `infrastructure/`: leitura/escrita em filesystem e templates Markdown.
- `mcp/`: catálogo de tools que depois poderá ser exposto via transporte MCP real.
- `codex/`: abstrações para sessões e execuções via Codex CLI.

## Fonte de verdade nesta fase

- `threads/` e `threads-arquivadas/`: memória operacional em Markdown.
- `tasks/` e `tasks-finalizadas/`: execução operacional em Markdown.
- `data/projects.json`: seed inicial para projetos estruturados.
- `data/contacts.json`: seed inicial para contatos estruturados.

## Próximos passos naturais

1. Implementar transporte MCP real sobre o catálogo em `mcp/tools.ts`.
2. Adicionar importador e sincronização bidirecional entre entidades e Markdown.
3. Substituir os JSONs iniciais por banco local quando o domínio estabilizar.
