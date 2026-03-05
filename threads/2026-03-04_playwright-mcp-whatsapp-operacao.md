# Thread: Playwright MCP no WhatsApp

## Contexto Inicial
- Assunto: estabilização da operação no WhatsApp via Playwright MCP na sessão real do Brave.
- Pessoas: Leonardo Sánchez, Alfredo (assistente IA).
- Objetivo: eliminar automação frágil por AppleScript e operar com confiabilidade em sessão autenticada.
- Grupo(s): aplica-se conforme grupos já existentes na sessão principal do WhatsApp Web.
- WhatsApp (contato/nome): contatos e conversas operadas diretamente na sessão do Leonardo.
- E-mail(s): não aplicável nesta thread.
- Outros canais: MCP Playwright + Brave (sessão autenticada).

## Logs
### 2026-03-04 --:-- | Validação técnica
- Confirmado funcionamento do MCP do Playwright na sessão.

### 2026-03-04 --:-- | Correção de sessão
- Identificado problema de abertura de sessão isolada.
- Ajustado para operar na sessão correta já logada do usuário.

### 2026-03-04 --:-- | Resultado operacional
- Fluxo de WhatsApp passou a ser executado por tools de browser.
- Risco residual principal: selecionar aba/sessão errada antes de enviar mensagens.
