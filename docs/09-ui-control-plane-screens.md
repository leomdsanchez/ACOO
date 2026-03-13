# UI Control Plane Screens

## Objetivo

Definir o escopo das telas da UI do ACOO antes de implementá-las, para evitar:

- telas gigantes de configuração;
- formulários lineares com todos os campos ao mesmo tempo;
- mistura de operação diária com setup estrutural;
- uma UI que pareça um "painel de admin genérico" ou um "form do INSS".

O alvo é um control plane operacional:

- leitura rápida primeiro;
- ação local e contextual depois;
- edição profunda só quando realmente necessária.

## Objetivo de produto da UI

A UI do ACOO não é:

- um CMS;
- um admin genérico;
- um formulário de cadastro com banco na tela.

A UI do ACOO é:

- cockpit do runtime;
- catálogo operacional de agentes;
- superfície de inspeção e ajuste fino;
- trilho de auditoria para sessões, runs e integrações.

## Princípios de Interface

### 1. Estado antes de configuração

A primeira coisa que a UI deve mostrar é:

- o que está rodando;
- o que está quebrado;
- qual agente está ativo;
- quais canais e MCPs estão saudáveis.

Configuração vem depois.

### 2. Uma tela, uma responsabilidade primária

Cada tela deve responder uma pergunta central:

- Home: "o sistema está saudável?"
- Agents: "quais agentes existem e em que estado estão?"
- Agent Detail: "como este agente opera?"
- Sessions: "o que está acontecendo agora?"
- Runs: "o que foi executado?"
- MCP: "quais integrações estão utilizáveis?"

### 3. Edição por blocos, não por formulário infinito

No detalhe de um agente, a UI não deve mostrar todos os campos de uma vez.

Ela deve separar por blocos:

- identidade;
- execução;
- prompt;
- skills;
- MCP;
- sessões/runs recentes.

### 4. Leitura densa, edição progressiva

A UI deve priorizar:

- cards compactos;
- tabelas curtas;
- painéis laterais;
- drawers e modais para edição pontual.

Não deve usar:

- páginas inteiras só para editar 2 campos;
- telas de admin com dezenas de inputs abertos;
- accordions infinitos como muleta para excesso de campos.

### 5. Setup estrutural separado de operação diária

Configurar um agente e operar o ACOO são coisas diferentes.

Por isso:

- a Home não é tela de cadastro;
- a tela de agente não é tela de monitoramento global;
- a tela de sessões não é tela de editar prompt.

### 6. Ação principal sempre visível

Cada tela deve deixar claro:

- qual é a leitura principal;
- qual é a ação principal;
- qual é o próximo nível de detalhe.

Se a tela exigir que o usuário "descubra" onde agir, ela está errada.

### 7. Edição não deve competir com leitura

Se uma tela é principalmente de leitura operacional, o modo de edição deve ser secundário:

- drawer;
- modal;
- side panel;
- stepper curto.

Evitar "modo formulário permanente" no corpo da página.

## Shell da aplicação

Estrutura visual recomendada:

- sidebar esquerda fixa para navegação primária;
- header curto com contexto da rota atual;
- área central para leitura;
- painel lateral opcional para detalhe e edição contextual.

### Sidebar

Itens:

- Home
- Agents
- Sessions
- Runs
- MCP
- Channels

### Header

Deve conter apenas:

- título da tela;
- subtítulo curto;
- 1 ação primária;
- 1 ou 2 filtros globais quando fizer sentido.

Não usar header como lugar para 8 filtros, 5 botões e breadcrumbs excessivos.

### Side Panel

Usar para:

- editar overview de agente;
- editar prompt;
- inspecionar run;
- inspecionar sessão;
- ver mismatch de MCP.

Isso evita trocar de tela para operações pequenas.

## Mapa de Navegação

Estrutura recomendada:

```text
/                       Home
/agents                 Catálogo de agentes
/agents/:slug           Detalhe do agente
/sessions               Sessões ativas e recentes
/runs                   Histórico de execuções
/mcp                    Integrações e health
/channels               Estado dos canais (Telegram, CLI, web)
```

Não criar mais rotas do que isso na primeira fase.

## Contrato de dados por tela

Cada tela deve nascer já ligada à sua fonte de verdade.

### Home

- `GET /api/status`

### Agents

- `GET /api/agents`
- `GET /api/agents/profiles`

### Agent Detail

- `GET /api/agents/:slug`
- `GET /api/agents/skills`
- `GET /api/agents/profiles`
- `GET /api/sessions?agentId=...`
- `GET /api/runs?agentId=...`
- `PATCH /api/agents/:slug`

### Sessions

- `GET /api/sessions`

### Runs

- `GET /api/runs`

### MCP

- `GET /api/mcp`
- `GET /api/status`

### Channels

- `GET /api/status`

Regra:

- uma tela não deve montar estado combinando 5 fontes diferentes no frontend se o backend puder entregar o snapshot certo;
- quando surgir agregação demais no frontend, isso é sinal para criar endpoint melhor.

## Tela 1: Home

### Pergunta principal

"O ACOO está saudável e operável agora?"

### Objetivo

Ser cockpit, não painel de configuração.

### Blocos

#### A. Runtime Snapshot

Cards compactos:

- Codex CLI
- Telegram
- MCP
- Transcription
- Agents

Cada card deve mostrar:

- estado;
- 1 risco principal;
- 1 ação rápida quando houver problema.

#### B. Operational Readiness

Uma faixa central com:

- issues
- advisories
- integrações indisponíveis
- sessões ativas

#### C. Recent Activity

Lista curta:

- últimas runs;
- último agente ativo por canal;
- últimas sessões abertas.

#### D. Quick Actions

A Home pode ter só 2 ou 3 ações rápidas:

- criar agente;
- abrir Agents;
- abrir MCP quando houver integração degradada.

### O que não entra

- edição completa de agente;
- lista completa de skills;
- formulário de MCP profile;
- prompt editor.

### Estados obrigatórios

- loading: skeleton curto, não spinner solto no meio da tela;
- error: banner compacto com a falha da API;
- empty: não se aplica para a Home;
- degraded: destacar `issues` e `advisories` sem transformar a tela em parede de alerta.

## Tela 2: Agents

### Pergunta principal

"Quais agentes existem e como estão distribuídos?"

### Objetivo

Listar e comparar agentes rapidamente.

### Layout

Tabela ou grid compacto, com filtros no topo.

Recomendação:

- desktop: tabela densa;
- telas menores: cards resumidos.

### Campos visíveis por agente

- nome
- slug
- role
- status
- model
- effort
- MCP profile
- skills count
- sessões ativas
- última run

### Ações da lista

- abrir detalhe
- criar agente
- desabilitar

### Criação de agente

Não abrir um formulário gigante de uma vez.

Fluxo recomendado:

1. modal curto "New Agent"
2. coletar apenas:
   - nome
   - slug
   - role
   - descrição curta
   - MCP profile inicial
3. criar
4. levar para `Agent Detail` para configuração profunda

Isso evita cadastro pesado na listagem.

### Filtros

- status
- role
- MCP profile

### O que não entra

- editor completo inline na tabela;
- edição de prompt diretamente na listagem.

### Estados obrigatórios

- loading: placeholder de linhas/cards;
- empty: `Nenhum agente cadastrado` + CTA `Create agent`;
- error: bloco curto com retry.

## Tela 3: Agent Detail

### Pergunta principal

"Como este agente foi configurado e como ele está operando?"

### Objetivo

Ser a tela de edição e inspeção profunda de um agente.

### Estrutura recomendada

Header + subnav por seções.

Seções:

1. Overview
2. Prompt
3. Skills
4. MCP
5. Sessions
6. Runs

Não transformar em tabs excessivas se isso esconder demais. Pode ser uma navegação lateral curta com scroll.

No header do agente, mostrar:

- nome
- slug
- role
- status
- MCP profile
- última run
- ação primária: `Edit overview`

### 3.1 Overview

Mostrar:

- display name
- slug
- role
- description
- status
- model
- effort
- approval
- sandbox
- search

### Ações

- Edit overview
- Disable agent
- Duplicate agent

Modo recomendado:

- leitura em definição compacta;
- edição em drawer lateral;
- salvar sem sair da tela.

### 3.2 Prompt

Mostrar:

- origem do prompt (`prompt.md`, inline ou ambos)
- preview resumido
- botão de editar

O editor deve abrir em painel dedicado, não inline na página inteira.

Também mostrar:

- se o prompt vem de arquivo ou inline;
- caminho do arquivo, quando existir;
- warning se arquivo e inline entrarem em conflito.

### 3.3 Skills

Mostrar:

- skills vinculadas
- skills disponíveis
- origem (`project` ou `global`)

A interação deve ser:

- adicionar/remover por picker;
- não por campo CSV.

Também mostrar:

- total de skills vinculadas;
- skills globais vs project-local;
- skills faltantes/inválidas, se houver.

### 3.4 MCP

Mostrar:

- profile atual
- required
- optional
- blocked
- MCPs hoje configurados na CLI
- mismatch entre profile e realidade

O bloco deve responder três perguntas:

- o que este agente quer usar;
- o que a CLI realmente tem;
- o que está bloqueando uso real agora.

### 3.5 Sessions

Lista curta:

- sessões ativas;
- sessões recentes daquele agente.

### 3.6 Runs

Lista curta:

- últimas execuções;
- status;
- canal;
- resumo;
- comando expandível.

O detalhe do comando deve ser colapsado por padrão.

### O que não entra

- monitoramento global do sistema;
- health do Telegram como foco principal.

### Estados obrigatórios

- loading: header skeleton + blocos skeleton;
- not found: mensagem curta + link de volta para Agents;
- error: erro local da tela, não toast genérico global.

## Tela 4: Sessions

### Pergunta principal

"Quais conversas/sessões estão em andamento ou foram usadas recentemente?"

### Objetivo

Dar visibilidade operacional, não configuração.

### Layout

Tabela com filtros:

- canal
- agente
- status

### Destaques necessários

- sessões ativas primeiro;
- agrupamento visual por canal;
- indicação clara de agente, chat/thread e última atividade.

### Campos

- agente
- canal
- thread do canal
- codexThreadId
- título
- modo
- status
- startedAt
- lastUsedAt

### Ações

- abrir agente
- abrir runs relacionadas
- retomar contexto na UI depois, quando existir essa ação

Não adicionar ação de editar agente aqui.

### Estados obrigatórios

- empty: `Nenhuma sessão encontrada` com filtros limpos;
- loading e error no mesmo padrão das outras tabelas.

## Tela 5: Runs

### Pergunta principal

"O que foi executado e qual foi o resultado?"

### Objetivo

Auditabilidade.

### Layout

Tabela densa com painel de detalhe lateral.

### Campos

- agente
- canal
- status
- createdAt
- resultSummary
- sessionId

### Detalhe expandido

- comando da CLI
- digest do prompt
- vínculo com sessão

Também mostrar:

- agente
- canal
- status
- timestamp
- resumo operacional curto

### O que evitar

- despejar stdout/stderr completo direto na lista;
- transformar a tela em terminal bruto.

### Estados obrigatórios

- empty: `Nenhuma execução registrada`;
- loading/error no padrão da UI.

## Tela 6: MCP

### Pergunta principal

"Quais integrações estão realmente prontas para uso?"

### Objetivo

Governança de integração.

### Blocos

#### A. Configured vs Missing

- MCPs configurados
- recomendados faltando
- desconhecidos configurados

#### B. Managed Runtime Health

Especialmente para casos como `playwright`:

- healthy/unhealthy
- healthcheck URL
- startup command
- autostart policy

#### C. Auth Issues

Expor claramente problemas como:

- refresh token inválido
- MCP configurado, mas indisponível

### Ação principal

Cada MCP com problema deve ter uma ação óbvia:

- abrir docs/runbook;
- copiar startup command;
- copiar healthcheck;
- abrir fluxo de repair depois, quando existir.

### O que não entra

- edição de agente;
- edição de skill.

### Estados obrigatórios

- se nenhum MCP estiver configurado, mostrar isso como estado operacional, não como "erro da página";
- problemas de auth devem aparecer por integração, não em banner genérico só.

## Tela 7: Channels

### Pergunta principal

"Como cada canal está usando o ACOO?"

### Objetivo

Concentrar estado dos canais sem poluir a Home.

### Blocos

#### Telegram

- enabled
- bot username
- allowed users
- active chats
- latest active agent
- latest session

#### CLI

- instalada
- autenticada
- config path
- defaults ativos

#### Web/UI

- API online
- status polling

### O que não entra

- editor de agente;
- lista completa de runs;
- configuração detalhada de MCP.

### Estados obrigatórios

- se um canal não existir ainda, mostrar como `planned` ou `disabled`, nunca como bloco quebrado.

## Regras de UX para evitar a cara de formulário

### 1. Não editar tudo inline

Edição deve abrir:

- modal curto;
- drawer lateral;
- ou editor dedicado por seção.

### 2. Não usar texto explicativo demais

Texto de suporte deve ser curto e só aparecer quando:

- há erro;
- há mismatch;
- há ação obrigatória.

### 3. Sempre mostrar uma leitura operacional compacta

Cada tela precisa ter:

- status;
- contagem;
- última atualização;
- ação principal.

### 4. Não duplicar informação

Exemplo:

- Home mostra "Telegram healthy".
- Tela Channels mostra o detalhe.

A Home não precisa repetir a tabela inteira do canal.

### 5. Defaults e drafts não podem fingir que são runtime real

Se algo vier de `localStorage`, isso precisa estar visualmente separado do estado real da API.

### 6. Não usar descrição longa como muleta

Se a tela só funciona porque tem um parágrafo explicando tudo, a tela está mal resolvida.

Priorizar:

- rótulo bom;
- hierarchy visual boa;
- estado claro;
- ação curta.

### 7. Filtros devem ser curtos e úteis

Não abrir a UI com 8 filtros.

Máximo recomendado por tela na primeira dobra:

- 2 a 3 filtros;
- 1 ordenação;
- 1 busca simples quando realmente necessária.

### 8. CTA primário único por tela

Cada tela deve ter um CTA principal claro:

- Home: `Open Agents`
- Agents: `Create agent`
- Agent Detail: `Edit overview`
- Sessions: nenhum CTA pesado, foco em leitura
- Runs: nenhum CTA pesado, foco em auditoria
- MCP: `Open runbook` ou ação de repair
- Channels: `Open Telegram` ou ação equivalente quando fizer sentido

## Anti-padrões explícitos

Evitar:

- tela única de "configurações do sistema" com tudo misturado;
- tabs com 10 seções e zero prioridade visual;
- CRUD inline em tabela com múltiplos selects e inputs abertos ao mesmo tempo;
- blocos enormes de texto explicando runtime;
- usar o dashboard como editor de backend.

## Padrão visual recomendado

### Home

- cards horizontais compactos;
- 1 faixa de issues/advisories;
- 1 lista curta de atividade.

### Lists

- tabela densa com hover sutil;
- coluna final de ação curta;
- drawer lateral para detalhe leve.

### Detail

- header forte;
- blocos modulares;
- uma largura confortável de leitura;
- sem grade de 4 colunas de formulário.

## Critério de implementação

Antes de considerar uma tela pronta, validar:

1. Dá para entender o estado da tela em 5 segundos?
2. O CTA principal está claro?
3. A tela ainda funciona bem sem ler texto de suporte?
4. A edição aparece só quando necessária?
5. A densidade está operacional ou burocrática?

## Sequência recomendada de implementação

### Fase UI-1

- Home real consumindo `/api/status`
- Agents list consumindo `/api/agents`
- sem edição profunda ainda

### Fase UI-2

- Agent Detail
- edição básica de overview
- create flow curto

### Fase UI-3

- edição de prompt
- edição de skills
- edição de MCP profile

### Fase UI-4

- Sessions
- Runs
- MCP
- Channels

## Critério de sucesso

A UI estará no caminho certo quando:

- a Home parecer cockpit, não formulário;
- a listagem de agentes permitir operar sem abrir 10 telas;
- o detalhe do agente não despejar todos os campos de uma vez;
- sessões e runs forem auditáveis sem virar terminal bruto;
- problemas de MCP, Telegram e runtime ficarem visíveis sem virar uma parede de texto.

Se a UI puder ser usada por 10 minutos seguidos sem parecer uma tela de configuração corporativa genérica, o desenho está no caminho certo.
