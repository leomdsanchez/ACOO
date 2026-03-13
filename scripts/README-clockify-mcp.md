# Clockify MCP Helpers

Helpers locais para repetir no Playwright MCP o preparo do relatório resumido do Clockify antes de emitir cobrança.

## Gerar snippet para o `browser_run_code`

Com a aba do Clockify já aberta na sessão autenticada:

```bash
npm run clockify:summary-snippet -- NOZ
```

Opcionalmente, dá para sobrescrever o agrupamento:

```bash
npm run clockify:summary-snippet -- NOZ "Projeto,Utilizador,Descrição"
```

O helper:

- garante o workspace `Nomades`
- garante a página `https://app.clockify.me/reports/summary`
- valida o período e seleciona `Último mês` pelo dropdown quando necessário
- valida o filtro de cliente informado antes de aplicar mudanças
- valida `Agrupado por` e só corrige quando houver divergência
- cria a pasta de destino se ainda não existir
- baixa o PDF para `Documents/Nômades/Financeiro [ano atual]/[mês atual]/Clockify`
- salva como `Relatório_[cliente].pdf`

## Saída

O comando imprime um snippet pronto para colar no `browser_run_code`.

O retorno esperado do MCP vem em JSON com:

- `url`
- `workspace`
- `summaryPage`
- `previousMonth`
- `clientApplied`
- `grouping`
- `download`

## Limite

Esse helper automatiza a preparação da tela, mas não substitui a conferência final antes de criar a fatura.

## Notas operacionais

- O workspace operacional esperado é `Nomades`.
- Para onboarding, a API do Clockify pode responder `501` em workspaces sem plano compatível para criação de usuários via API.
- Nesse caso, o fluxo correto é:
  1. convidar manualmente pela UI em `Equipe`;
  2. confirmar que o usuário apareceu na lista, mesmo que como `ainda não aderiu`;
  3. buscar o `Clockify User ID` pela sessão autenticada do browser.
- Na sessão web do Clockify, a leitura autenticada de `/api/v1/workspaces/{workspaceId}/users` funciona com o header `X-Auth-Token`.
