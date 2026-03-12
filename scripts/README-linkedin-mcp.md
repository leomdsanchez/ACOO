# LinkedIn MCP Helpers

Este diretório contém helpers locais para reduzir leitura manual da UI ao trabalhar com LinkedIn via Playwright MCP.

## Gerar inventário dos posts visíveis

Com a aba já aberta na página de atividades do lead:

```bash
node scripts/linkedin-activity-snippet.mjs 15
```

Isso imprime um snippet pronto para colar no `browser_run_code`.

Se a aba atual não estiver em `recent-activity/all`, o snippet falha de propósito.

O retorno do MCP vem em JSON com:

- `id`
- `actor`
- `actorHref`
- `type`
- `timestamp`
- `snippet`
- `publicationHref`
- `menuAria`

## Uso operacional

1. Abrir a página `recent-activity/all` do lead.
2. Gerar o snippet acima.
3. Rodar o snippet no `browser_run_code`.
4. Escolher o `id` do card alvo sem precisar ler o feed inteiro.
5. Só então seguir o fluxo seguro da skill:
   `3 pontinhos -> copiar link -> abrir link -> reconfirmar -> agir`

## Limite

Esse helper acelera o inventário e a seleção do alvo, mas não substitui a validação final na UI antes de comentar, dar like ou mandar mensagem.

## Fallback confiável com snapshot

Quando o `browser_run_code` não conseguir ler os cards do LinkedIn:

1. Salvar o snapshot MCP em arquivo markdown.
2. Rodar:

```bash
npm run linkedin:snapshot-parse -- tmp/linkedin-guzman-snapshot.md
```

Isso devolve um inventário parseado do snapshot com:

- `id`
- `actor`
- `type`
- `timestamp`
- `menuRef`
- `commentRef`
- `likeRef`
- `snippet`
