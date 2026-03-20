# Task: ACOO - implementar página dedicada de chat no padrão Vercel/AI SDK

## Objective
Entregar uma página dedicada de chat no ACOO, limpa e própria de produto, usando a stack da AI SDK/Vercel onde fizer sentido, com suporte a anexos e base de áudio, sem descaracterizar a arquitetura operacional do repo.

Reabertura de objetivo em `18/03/2026`:
- refinar a linguagem visual de `/chat` para um layout mais profissional e integrado, reduzindo bordas, caixas e separações artificiais;
- preservar a integração já pronta com AI Elements, `/api/chat/stream`, anexos, áudio e histórico;
- tratar este corte como `layout system pass`, não como nova integração técnica.

## In Scope
- Extrair `/chat` da shell visual do dashboard.
- Criar um layout dedicado de chat.
- Usar a stack AI SDK no cliente para transporte/estado de conversa.
- Adicionar suporte a anexos no contrato do `web chat`.
- Adicionar captura de audio no cliente e envio como anexo de audio.
- Persistir metadados de anexos no historico operacional.
- Refinar a arquitetura visual do `/chat` para reduzir caixas, bordas e blocos artificiais.
- Integrar sidebar, header de conversa, lista de chats e composer em uma linguagem visual única.

## Out of Scope
- Migrar o repo para `Next.js`.
- Adotar o template/app completo da Vercel como novo shell principal.
- Implementar transcricao real de audio neste corte.
- Implementar processamento multimodal binario real pelo runtime Codex.
- Reescrever dashboard, agentes ou outras frentes.
- Reabrir backend, contrato HTTP ou persistência do chat sem necessidade estrutural.

## Deliverable
- Pagina `/chat` dedicada e apresentavel.
- Composer com texto, anexo de arquivo e gravacao de audio.
- Historico capaz de exibir metadados de anexos persistidos.
- Backend compativel com mensagens contendo texto e arquivos.
- Plano de refinamento visual com macro itens, um unico slice ativo e gate de aceite explicito para o redesign.

## Acceptance Gate
- `/chat` nao usa mais a shell lateral do dashboard.
- O usuario consegue enviar texto, arquivo e audio gravado.
- O historico recarregado preserva os anexos como metadados visiveis.
- O backend continua acoplado ao runtime operacional existente.
- Nenhuma falha `high` ou `medium` restante neste corte.
- No corte de planejamento visual:
  - objetivo visual explicito;
  - um unico slice ativo;
  - nenhum `high` ou `medium` restante sobre o proximo corte de layout;
  - challenge de subagente registrado.

## Slice Plan
1. Reabrir o item com o objetivo correto de produto.
2. Estender o contrato do `web chat` para anexos persistidos.
3. Criar a shell dedicada da pagina `/chat`.
4. Implementar composer com arquivo e audio.
5. Validar renderizacao do historico e fluxo de envio.
6. Reabrir o item como refinamento visual do `/chat`.
7. Travar a arquitetura visual alvo e o corte do redesign.
8. Executar um unico slice de layout estrutural.
9. Validar linguagem visual, densidade, viewport e hierarchy.

## Current Slice
Slice ativo:
- planejar o redesign estrutural do `/chat`, com um unico foco:
  - redesenhar a shell principal da conversa, do header ao composer, para criar uma hierarquia clara de produto sem reabrir o backend.

Fora do escopo do slice atual:
- mudar backend;
- reabrir o transporte;
- mexer em anexos/audio alem do necessario para acomodar layout;
- refazer a sidebar antes de a shell principal da conversa estar resolvida.

Slice tecnico reaberto em `19/03/2026`:
- implementar streaming real no pipeline do `/chat` usando `codex app-server` como fonte de deltas, antes de retomar o refinamento visual restante.

Fora do escopo deste slice tecnico:
- redesenho visual adicional;
- reabrir a UI alem do necessario para consumir o streaming ja suportado;
- migrar o ACOO inteiro para `app-server`;
- trocar o fluxo nao-streaming se isso nao for necessario.

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
- Validacao de subagente 3 (`Bernoulli`): a ordem correta nao e `adapter com streaming -> UI`; antes disso precisamos definir o canal `web`, persistencia de sessao/run, happy path sem streaming e so depois a camada de streaming.
- Validacao de subagente 4 (`Carver`): o melhor slice atual e o contrato de chat e ownership de sessao; sem isso o restante fica estruturalmente ambiguo.
- Macro-plano consolidado:
  1. Definir o corte `web chat v1` e o contrato/lifecycle.
  2. Adicionar um servico de aplicacao/backend para `web` que persista `sessions` e `runs` no registry atual e entregue um happy path sem streaming.
  3. Tratar streaming como item separado: captura incremental do runtime Codex -> contrato de stream do servidor -> adapter HTTP.
  4. Adicionar a superficie de chat dedicada no app `Vite`.
  5. Fechar observabilidade e guardrails sobre o fluxo final.
- Primeiro slice concreto definido:
  - `POST /api/chat` request shape
  - modelo de sessao: `new`, `resume`, `ephemeral`
  - ownership de sessao por aba/chat
  - regras de escrita em `AgentSession` e `AgentRun`
  - erros minimos: timeout, abort, resume failure, MCP unavailable, duplicate submit
  - exclusoes de v1: sem anexos, sem voz, sem multi-agent UI, sem memoria frontend fake
- Execucao concluida neste turno:
  - suporte de transcript persistido no registry (`AgentMessage`)
  - `WebChatService` para orquestrar sessao `web`, mensagens e `runs`
  - endpoints `GET /api/chat` e `POST /api/chat`
  - superficie `/chat` no app `Vite`
  - sessao `web` retomavel por `channelThreadId` persistido no navegador
  - lifecycle explicito na UI:
    - `resume`: continua a sessao do `channelThreadId` atual
    - `new session`: gira um novo `channelThreadId`
    - `ephemeral`: executa sem persistir sessao nem transcript
  - endpoint `POST /api/chat/stream` com `text/plain` para compatibilidade de transporte com AI SDK UI em modo de texto
  - parser do ultimo prompt de usuario aceitando `messages[].content` e `messages[].parts[]`
- Validacao tecnica:
  - `npm run prisma:generate` passou
  - `npm run prisma:db:push` passou
  - `npm run typecheck` passou
  - `npm run build` passou
  - `node --import tsx --test server/application/services/WebChatService.test.ts` passou
  - `node --import tsx --test server/application/services/WebChatService.test.ts server/api/HttpServer.chat-stream.test.ts` passou
  - `npm run test:server` trouxe 1 falha preexistente em `OperationalAgentSelector.test.ts`, fora da frente de chat
- Validacao final de subagente (`Noether`):
  - sem falhas `high` ou `medium` restantes neste corte
  - proxima trava real: implementar streaming incremental compativel se a meta sair de `web chat v1` e passar para encaixe mais limpo com AI SDK UI
- Revisao nova de subagente (`Archimedes`) para o objetivo de produto:
  - a arquitetura atual ainda usa `/chat` como uma screen dentro da shell do dashboard, o que conflita com a ideia de pagina dedicada;
  - o maior risco de acoplar AI SDK UI direto e o mismatch entre o transporte AI SDK e o contrato atual do servidor, alem do fato de `AgentMessage` ainda ser texto puro;
  - ordem minima recomendada: separar a pagina, definir contrato de attachments/audio no `web`, estender persistencia e so entao encaixar a UX da AI SDK no frontend.
- Novo corte aprovado:
  - pagina dedicada e limpa em `/chat`;
  - anexos como suporte funcional;
  - audio como captura e envio de arquivo de audio;
  - sem prometer transcricao ou multimodalidade real neste corte.
- Execucao concluida neste corte:
  - `/chat` saiu da shell lateral do dashboard e virou pagina dedicada em tela cheia;
  - cliente migrou para `useChat` com `TextStreamChatTransport`;
  - composer novo com upload, drag and drop e gravacao local via `MediaRecorder`;
  - `AgentMessage` passou a persistir metadados de anexos;
  - `POST /api/chat` e `POST /api/chat/stream` passaram a aceitar texto e/ou anexos no canal `web`;
  - anexos persistidos agora geram asset real em `data/chat-uploads` com link de download no historico;
  - modo efemero nao persiste transcript nem assets binarios;
  - historico recarregado volta com metadados visiveis e link real dos anexos persistidos.
- Validacao tecnica final:
  - `npm install ai @ai-sdk/react` executado com sucesso
  - `npm run prisma:generate` passou
  - `npm run prisma:db:push` passou
  - `npm run typecheck` passou
  - `npm run build` passou
  - `node --import tsx --test server/application/services/WebChatService.test.ts server/api/HttpServer.chat-stream.test.ts` passou
  - `npm run test:server` continua com 1 falha preexistente em `OperationalAgentSelector.test.ts`, fora da frente de chat
- Validacao final de subagente (`Archimedes`):
  - sem falhas `high` ou `medium` restantes
  - veredito: objetivo atendido para pagina dedicada, anexos com asset real e UX audio-ready sem regressao arquitetural
- Reabertura do item para aderir ao pedido correto de UX:
  - o usuario deixou explicito que queria a UI da Vercel, nao apenas uma pagina funcional com AI SDK no transporte;
  - a leitura oficial da doc mostrou que o caminho profissional exige fundacao `shadcn/ui` + Tailwind e componentes locais da AI Elements, nao migracao para `Next.js`.
- Execucao final neste corte:
  - bootstrap de `components.json`, alias `@/*`, Tailwind v4 e utilitarios `shadcn/ui`;
  - adicao dos componentes reais da AI Elements no repo:
    - `conversation`
    - `message`
    - `prompt-input`
    - `attachments`
    - `speech-input`
    - `audio-player`
  - migracao da `/chat` para usar essa superficie visual real da Vercel/AI Elements sem trocar o backend;
  - manutencao do `TextStreamChatTransport`, `channelThreadId`, `ephemeral`, reload de historico e endpoints existentes.
- Validacao tecnica final deste ajuste:
  - `npm run typecheck` passou
  - `npm run build` passou
  - `node --import tsx --test server/application/services/WebChatService.test.ts server/api/HttpServer.chat-stream.test.ts` passou
- Validacao de subagente (frente UI-only swap):
  - corte confirmado como correto: manter backend/transport e trocar apenas a superficie visual de `/chat`
  - sem falhas `high` ou `medium` remanescentes no boundary da migracao
- Estado atual do layout apos o primeiro passe de limpeza:
  - a barra superior ja saiu;
  - a sidebar ja concentra lista de chats e nova sessao;
  - agente e modo efemero ja foram movidos para o topo da conversa;
  - a tela respeita viewport e scroll interno.
- Problema remanescente explicito pelo owner:
  - ainda existe excesso de bordas, caixas e leitura de componentes encaixotados;
  - a linguagem visual ainda parece montagem de componentes, nao uma pagina de produto madura.
- Subagente ativo nesta reabertura visual:
  - `Meitner` (`019d03f6-16f4-7151-8481-280361621411`)
  - objetivo: pressionar problemas estruturais, ordem dos macro itens e melhor proximo slice para um redesign profissional do `/chat`
  - razao da delegacao: a skill exige challenge externo antes de aceitar o corte do novo slice
  - status do thread: novo, porque o objetivo mudou de integracao tecnica para refinamento visual
- Macro item ativo reaberto:
  - `ACOO - redesign estrutural do /chat`
- Macro ordem proposta:
  1. Travar hierarquia visual e densidade do layout.
  2. Simplificar shell estrutural: sidebar, header de conversa e composer.
  3. Refinar thread e mensagens para reduzir caixas e ruido.
  4. Validar estados vazios, carregamento e erro dentro da nova linguagem.
  5. Fazer polish final de spacing, radius e contraste.
- Slice candidato mais forte:
  - redesenhar somente a shell principal da conversa
  - inclui: header da conversa, hierarchy da coluna principal, transcript shell, composer shell e regras de spacing/radius/contraste
  - nao inclui: refazer sidebar, anexos internos, audio player e microestados finos
- Challenge do subagente `Meitner`:
  - falha `high`: a pagina nao tem hierarquia de informacao suficiente; o topo atual parece um grupo de controles dispersos, nao um cabecalho de conversa;
  - falha `high`: transcript e composer nao leem como um workflow unico de chat profissional;
  - falha `medium`: a sidebar ocupa prioridade estrutural sem justificar isso em metadata/navegacao;
  - falha `medium`: o sistema visual esta uniforme demais, com superficies/transparencias parecidas entre si;
  - recomendacao: primeiro resolver a shell principal da conversa, depois transcript/composer detalhados, e so depois revisar a sidebar.
- Reabertura tecnica em `18/03/2026` por problemas de execucao no chat:
  - usuario reportou falta de streaming de resposta;
  - `Interromper` nao estava cancelando a execucao real;
  - a UI fazia refresh agressivo apos envio e sobrescrevia o estado otimista, chegando a esconder mensagem do usuario.
- Challenge do subagente `Singer`:
  - o endpoint `/api/chat/stream` esperava a execucao inteira e so depois devolvia texto final;
  - o abort da UI morria na borda HTTP e nao chegava ao `AgentController`/`CodexCli`;
  - a `ChatScreen` misturava `useChat` com re-hidratacao manual do historico apos cada envio.
- Execucao concluida neste corte tecnico:
  - `AbortSignal` propagado de `/api/chat/stream` ate `AgentController` e `CodexCliService`;
  - `request close/aborted` agora cancela a execucao real no backend;
  - `WebChatService` passou a registrar `run` abortado em vez de completar artificialmente a execucao interrompida;
  - `CodexCliService` ganhou caminho de execucao com stream de stdout/eventos para alimentar chunks de texto no endpoint web;
  - `/api/chat/stream` agora responde em `text/plain` chunked e escreve deltas conforme o backend produz texto;
  - `ChatScreen` deixou de recarregar historico apos cada envio e passou a manter a thread viva por estado otimista do `useChat`;
  - hidratação do historico ganhou protecao contra race de thread e refresh agressivo;
  - sidebar/recents agora refletem o estado local da thread durante envio e fim de resposta.
- Reabertura de streaming real em `19/03/2026`:
  - fonte oficial validada: `Codex App Server` em `developers.openai.com/codex/app-server`;
  - doc confirma que o caminho proprio para clientes ricos e `initialize -> thread/start|resume -> turn/start -> item/agentMessage/delta -> turn/completed`;
  - `turn/interrupt` existe como metodo proprio do protocolo e encerra o turno com `status: "interrupted"`;
  - o contrato atual em `CodexCliService` ainda depende de `codex exec --json` e tenta inferir streaming a partir de `item.completed`, o que mantem granularidade fraca e pode entregar resposta toda no final;
  - decisao: trocar apenas o caminho `onTextChunk` para `app-server` via stdio/JSONL, preservando `exec` como fallback para o restante.

## Remaining Failures
- `low`: anexos de audio entram como arquivo de audio; a transcricao automatica ainda depende do Web Speech API do navegador.
- `low`: o endpoint de stream continua texto-simples; o proximo salto, se desejado, e evoluir de texto puro para um protocolo de UI mais rico.
- `low`: a granularidade final do streaming agora depende do `item/agentMessage/delta` emitido pelo `app-server`, nao mais do parser de `item.completed`.
- `high`: o topo da conversa ainda nao funciona como cabecalho de produto com identidade de sessao e hierarquia clara.
- `high`: transcript e composer ainda nao formam uma unica superficie principal de chat.
- `medium`: a sidebar segue forte demais para o valor de navegacao que entrega hoje.
- `medium`: contraste e linguagem de superficies ainda deixam as secoes borradas entre si.
- `resolvido em 19/03/2026`: o caminho `onTextChunk` do chat web saiu de `codex exec --json` e passou para `codex app-server` via WebSocket, consumindo `item/agentMessage/delta` como fonte real de streaming.
- `resolvido em 19/03/2026`: interrupcao do chat com stream agora usa `turn/interrupt` quando o turno ja foi criado, com kill do processo apenas como fallback.
- `resolvido em 19/03/2026`: smoke test real do `CodexCliService` confirmou deltas separados (`alpha`, ` beta`, ` gamma`) e `threadId` valido no fluxo `app-server`.

## Decision
Item reaberto para refinamento visual em `18/03/2026`.

Decisao atual:
- manter a base tecnica entregue;
- slice tecnico de streaming real concluido em `19/03/2026` com `codex app-server`;
- voltar agora ao redesign visual da conversa e da sidebar;
- depois retomar a hierarquia visual da conversa e, so na sequencia, sidebar/polish.
- corte tecnico de execucao encerrado:
  - streaming/abort/hidratacao do chat web corrigidos neste turno
  - proxima frente volta a ser puramente visual

## Closure
- Reaberto em `18/03/2026 19:23 -03` para execucao do corte de produto correto.
- Fechado em `18/03/2026 19:36 -03` com entrega de pagina dedicada de chat, contrato de anexos no canal `web` e asset layer local para arquivos persistidos.
- Ajustado em `18/03/2026 20:16 -03` para trocar a UI propria pela superficie real da Vercel AI Elements no `/chat`, mantendo o contrato/backend.
- Reaberto em `18/03/2026 21:04 -03` para planejamento do refinamento visual profissional do `/chat`.
- Executado em `18/03/2026 21:31 -03` o corte tecnico de streaming, abort e hidratação profissional por thread.
