# Thread: MCP Playwright no Chrome - sessão persistente operacional

## Contexto Inicial
- Assunto: migração do fluxo Playwright MCP para Chrome com sessão persistente isolada, sem impactar sessões pessoais do navegador.
- Pessoas: Leonardo Sánchez, Alfredo (assistente IA).
- Objetivo: estabilizar automação browser com login persistente e reduzir risco de logout/relogin em massa.
- Grupo(s): não aplicável nesta thread.
- WhatsApp (contato/nome): aplicável apenas como sistema a manter logado no perfil MCP.
- E-mail(s): Gmail `leosanchez@neuralthink.io` (validação de persistência de sessão).
- Outros canais: VS Code (MCP Marketplace), Playwright MCP, Bubble (Neuralthink), Clockify, Notion, Nômades Workspace.

## Logs
### 2026-03-05 12:23 | Reconfiguração segura do MCP
- Backup criado de `~/.codex/config.toml` e do wrapper antigo.
- Novo wrapper criado: `~/.local/bin/playwright-mcp-chrome-persistent`.
- Perfil persistente isolado definido em `~/Library/Application Support/PlaywrightMCP/chrome-profile`.
- `config.toml` atualizado para apontar o servidor `playwright` para o novo wrapper.

### 2026-03-05 12:24 | Validação técnica do wrapper
- Wrapper validado com `--help` e `--version`.
- Versão confirmada do Playwright MCP: `0.0.68`.
- Confirmação de que o bloco Notion foi preservado no `config.toml`.

### 2026-03-05 15:27 | Teste funcional do browser MCP
- Navegação e interação testadas com sucesso (`navigate`, `click`, `goBack`).
- Persistência em disco confirmada para o profile dedicado.

### 2026-03-05 15:35 | Abertura de abas para login operacional
- Abas abertas para: WhatsApp, Gmail, Notion, Clockify, Nômades e Neural.
- Após login manual, persistência validada:
- WhatsApp: logado.
- Gmail: logado.
- Notion: logado.
- Clockify: logado.
- Nômades: logado.
- Neural Board direto: permaneceu `unauthorized` (dependência de acesso via Bubble).

### 2026-03-05 15:37 | Definição de URLs oficiais de operação
- Nômades Workspace fixado em: `https://plataformanomades.com.br/workspace3/nomades`.
- Bubble (Neuralthink / Data / App Data) fixado em:
- `https://bubble.io/page?id=neuralthink&tab=Data&name=index&type_id=user&version=live&subtab=App+Data&view_id=1689857319312x369693018949947200`.
- Regra operacional confirmada para Neural:
- buscar cliente por nome/e-mail no DB.
- executar acesso via `Run as ->` na conta correta.

### 2026-03-05 --:-- | Próximo passo estruturante
- Proposta de skill dedicada para fluxo Bubble `Run as ->` registrada para reduzir erro operacional em seleção de conta.
