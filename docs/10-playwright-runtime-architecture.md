# Playwright Runtime Architecture

## Objetivo

Definir a arquitetura profissional para o runtime `playwright` no ACOO, separando:

- `startup operacional`;
- `healthcheck`;
- `diagnóstico`;
- `uso por skills/agentes`.

O objetivo desta arquitetura é eliminar investigação ad hoc durante fluxos operacionais e transformar o diagnóstico do browser em uma capabilidade nativa do sistema.

## Princípio central

O problema de runtime do browser não deve ser resolvido dentro do turno do agente via tentativa e erro.

No ACOO:

- `script/comando` implementa a capacidade;
- `skill` define quando e como usar essa capacidade;
- `prompt` só orienta o comportamento e limita improviso.

Se a inteligência de diagnóstico ficar escondida em `prompt` ou `skill`, a solução desalinhará da proposta do ACOO como control plane sobre a Codex CLI.

## Hierarquia de verdade

Para este domínio, o ACOO deve obedecer a seguinte hierarquia:

1. `script/comando`
- verdade executável;
- prova técnica do que o sistema realmente faz.

2. `doc de arquitetura`
- verdade estrutural;
- define fronteiras, responsabilidades e contratos.

3. `runbook`
- verdade operacional do estado atual;
- explica como usar o que existe hoje.

4. `skill`
- verdade de uso pelo agente;
- define quando chamar a capacidade e quando bloquear.

5. `prompt`
- verdade comportamental;
- limita improviso e reforça a rota correta.

Se houver conflito:

- `script/comando` vence sobre o texto;
- `doc de arquitetura` vence sobre o `runbook` quando o assunto for desenho-alvo;
- `runbook` vence sobre memória informal do turno;
- `skill` e `prompt` não podem contradizer a capacidade real do sistema.

## Decisão arquitetural

O runtime `playwright` passa a ter quatro camadas explícitas:

1. `launcher`
- sobe a sessão operacional;
- não diagnostica causas profundas;
- não decide política operacional.

2. `healthcheck`
- responde se a sessão está realmente anexável;
- usa o mesmo contrato em todos os pontos do sistema.

3. `doctor`
- investiga por que o runtime não sobe ou não fica anexável;
- roda em ambiente temporário;
- nunca reutiliza a sessão operacional como ambiente principal de diagnóstico.

4. `consumer`
- `status`, `skills`, `bootstrap`, `runbooks` e agentes consomem esse contrato;
- não reinventam checagem nem reproduzem tentativa manual.

## Estado atual vs arquitetura alvo

### Estado atual

Hoje o ACOO já tem:

- `PlaywrightSessionOwner` com ownership local de `profile + processo + BrowserContext`;
- lease de profile para evitar concorrência local;
- healthcheck real via `connectOverCDP` com evidência do owner local;
- `doctor` oficial exposto como comando do servidor;
- documentação operacional do runbook;
- melhorias recentes para evitar falso positivo simples de CDP.

Hoje o ACOO ainda não tem:

- skill atualizada para tratar o owner local como contrato dominante sem recorrer a linguagem legada;
- eliminação completa do launcher externo como fallback estrutural;
- isolamento completo entre fluxo operacional e fluxo de diagnóstico em toda a superfície textual do projeto.

### Arquitetura alvo restante

O estado desejado é:

- `status`, `launcher`, `healthcheck` e `bootstrap` usando o owner local como fonte principal de verdade;
- skill chamando o caminho de diagnóstico em vez de improvisar;
- revisão operacional impedida de entrar em depuração ad hoc;
- fallback externo reduzido a contingência explícita, não mais a arquitetura implícita.

Este documento descreve a arquitetura alvo remanescente, explicitando acima o que já existe e o que ainda falta.

## Contrato único de saúde

O ACOO precisa adotar uma única definição de `runtime saudável`.

Um runtime `playwright` só é considerado saudável quando passa nesta ordem:

1. o `owner local` existe e resolve `profile + lease + processo`;
2. a sessão operacional publicada pelo owner responde como anexável;
3. `GET /json/version` responde com `webSocketDebuggerUrl`;
4. `chromium.connectOverCDP(...)` funciona.

Qualquer camada que use outro critério gera falso positivo operacional.

## Separação de perfis

### Profile operacional

Usado para:

- WhatsApp;
- Gmail;
- Notion;
- Workspace;
- Clockify;
- qualquer sessão autenticada real do dia a dia.

Características:

- persistente;
- autenticado;
- sujeito a handoff manual;
- não deve ser usado como ambiente principal de debug.

### Profile de diagnóstico

Usado para:

- validar flags;
- validar launcher;
- validar porta e attach;
- reproduzir falhas de `visible` e `headless`.

Características:

- temporário;
- descartável;
- isolado por porta e diretório;
- limpo ao final do diagnóstico.

## Comando doctor

O `doctor` deve existir como capabilidade nativa do ACOO.

Superfície desejada:

```bash
npm run server:mcp -- doctor playwright --json
```

Responsabilidades do `doctor`:

- inspecionar primeiro a sessão operacional possuída pelo ACOO;
- criar `porta temporária`;
- criar `profile temporário`;
- testar `visible` e `headless` separadamente;
- validar `processo`, `porta`, `/json/version` e `connectOverCDP`;
- classificar a falha;
- devolver diagnóstico estruturado;
- limpar recursos temporários.

Saída mínima esperada:

- modo testado;
- comando usado;
- profile usado;
- porta usada;
- resultado de cada etapa;
- causa provável;
- próxima ação recomendada.

## O que pertence em cada artefato

### Script

Deve conter:

- lógica técnica de diagnóstico;
- coleta de evidência;
- classificação da falha;
- limpeza de ambiente temporário.

Não deve conter:

- regra de negócio operacional;
- política textual de agente;
- instrução de revisão operacional.

### Server command

Deve conter:

- superfície oficial do backend;
- saída `json` e humana;
- integração com observabilidade e status.

Não deve conter:

- tutorial;
- política de skill;
- identidade de agente.

### Doc de arquitetura

Deve conter:

- contrato;
- fronteiras;
- decisões;
- alvo estrutural;
- diferença entre atual e desejado.

Não deve conter:

- troubleshooting ad hoc;
- log de experimento;
- improviso de turno.

### Runbook

Deve conter:

- passos operacionais do estado atual;
- comandos usados hoje;
- sinais esperados;
- erros comuns do setup real.

Não deve conter:

- arquitetura alvo inteira;
- regras profundas de modelagem;
- ambição de substituir o `doctor`.

### Skill

Deve conter:

- gatilho de uso;
- sequência para o agente;
- critério de bloqueio;
- fallback permitido.

Não deve conter:

- implementação técnica completa do `doctor`;
- contrato arquitetural de baixo nível;
- dependência em tentativa manual.

### Prompt

Deve conter:

- regra de comportamento;
- limite de atuação;
- decisão de quando parar e escalar.

Não deve conter:

- comando técnico detalhado;
- lógica de launcher;
- roteiros de debugging passo a passo.

## Decisão operacional obrigatória

Quando o runtime `playwright` estiver `unhealthy`, a regra do ACOO deve ser:

1. não improvisar tentativa manual dentro da revisão operacional;
2. não usar a sessão operacional como ambiente de diagnóstico;
3. chamar o caminho oficial de `doctor`;
4. só depois decidir entre:
- corrigir infraestrutura;
- reautenticar sessão;
- reportar bloqueio;
- retomar a operação.

Enquanto o `doctor` oficial ainda não existir, o máximo permitido é:

- `pré-contexto local` na revisão operacional;
- ou diagnóstico técnico explícito, fora da revisão operacional.

O que não é permitido:

- transformar uma revisão operacional em troubleshooting aberto;
- abrir browser, trocar flags e testar perfis ad hoc no meio do fluxo operacional;
- misturar debug de runtime com leitura de status de cliente/projeto.

## Papel de cada peça

### Script

Responsável por:

- implementar o diagnóstico real;
- produzir saída reproduzível;
- operar no nível técnico.

Exemplo de localização:

- `scripts/playwright-mcp-doctor.mjs`

### Server command

Responsável por:

- expor o diagnóstico como superfície oficial do ACOO;
- padronizar saída humana e `json`;
- integrar com status, observabilidade e troubleshooting.

Exemplo de localização:

- `server/commands/mcp.ts`

### Skill

Responsável por:

- definir quando usar `doctor`;
- impedir improviso manual;
- orientar fluxo do agente.

A skill `playwright-mcp-brave-session` deve dizer explicitamente:

- se o runtime falhar, usar `doctor`;
- não abrir fluxo de tentativa manual dentro da revisão operacional;
- sem `doctor` ou validação do canal, no máximo `pré-contexto local`.

### Prompt

Responsável por:

- proibir que o agente transforme revisão operacional em depuração de runtime;
- apontar para o caminho correto;
- manter comportamento consistente.

O prompt não deve carregar:

- flags;
- comandos de diagnóstico detalhados;
- lógica de runtime específica.

## Integração com o status

`server:status` deve consumir o mesmo contrato de saúde usado pelo runtime.

Consequência:

- `launcher`, `healthcheck`, `doctor` e `status` precisam concordar;
- se `doctor` afirma que a sessão está anexável, `status` não pode dizer o oposto sem evidência mais nova;
- se `status` acusa indisponibilidade, a skill deve saber chamar o `doctor`, não improvisar.

## Integração com o roadmap

Esta arquitetura expande a governança de MCP já prevista no ACOO.

Ela não cria uma arquitetura paralela.

Ela detalha, para o caso específico do `playwright`, como o backend deve:

- governar runtime local;
- manter previsibilidade operacional;
- evitar mistura entre `infra` e `operação`.

## Fluxos oficiais

### Fluxo 1: operação normal

1. rodar `server:status`;
2. se o runtime estiver saudável, seguir com a skill;
3. se o runtime estiver indisponível, não improvisar.

### Fluxo 2: startup manual

1. subir launcher operacional;
2. validar com healthcheck oficial;
3. só depois operar.

### Fluxo 3: diagnóstico

1. rodar `doctor playwright`;
2. analisar causa;
3. decidir entre:
- corrigir launcher;
- corrigir flags;
- reautenticar sessão;
- reportar bloqueio de infraestrutura.

## O que não fazer

- não depurar runtime dentro da revisão operacional;
- não usar `prompt` como lugar de lógica de diagnóstico;
- não esconder regras técnicas importantes só em `skill`;
- não tratar `browser abriu` como sinônimo de `runtime saudável`;
- não usar a sessão operacional como playground de teste.

## Critério de pronto

Esta arquitetura só estará realmente pronta quando:

- existir `doctor` oficial;
- `status`, `launcher` e `healthcheck` usarem o mesmo contrato;
- `playwright-mcp-brave-session` parar de permitir tentativa manual;
- revisão operacional nunca mais abrir fluxo de debug no meio da operação;
- os testes mínimos cobrirem os cenários críticos.

## Cenários mínimos de validação

1. browser sobe e CDP anexa normalmente;
2. browser abre sem porta CDP;
3. `/json/version` responde, mas `connectOverCDP` falha;
4. `headless` cai;
5. sessão autenticada existe, mas o runtime operacional está indisponível;
6. skill bloqueia corretamente e chama o caminho de diagnóstico.

## Resposta curta à proposta do ACOO

Esta arquitetura está alinhada com a proposta do ACOO porque:

- coloca a capacidade no sistema;
- mantém `prompt` enxuto;
- deixa `skill` como rito;
- preserva a Codex CLI como runtime real;
- evita transformar o agente em um depurador ad hoc.
