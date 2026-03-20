# ACOO

Repositório operacional de apoio ao COO, com threads, tasks e instruções de execução.

## Estrutura

- `operations/threads/`: histórico operacional ativo
- `operations/threads-arquivadas/`: histórico encerrado
- `operations/tasks/`: itens acionáveis em andamento
- `operations/tasks-finalizadas/`: itens concluídos ou retirados de execução
- `operations/projects/`: catálogo estruturado de projetos
- `operations/people/`: catálogo estruturado de pessoas
- `agents/`: instruções operacionais dos agentes

## Regra operacional única

- chats do Telegram/Web são canais de entrada e mantêm sessões conversacionais;
- `operations/threads/` é o registro canônico de cada assunto operacional;
- assunto ativo em chat deve apontar para uma thread operacional, e a thread deve registrar a origem real do canal quando existir.

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
