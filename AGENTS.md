# ACOO Repository Instructions

- Treat the ACOO as a control plane on top of Codex CLI, not as a fake local agent runtime.
- Keep `AGENTS.md`, agent prompts and skills as separate concepts.
- Use `agents/<slug>/prompt.md` for agent overlays.
- Use `.agents/skills/` for project-local skills and `~/.codex/skills/` for global skills.
- When a relevant skill exists, use it first and execute the local commands or workflow it defines; do not wait for a separate MCP tool if the skill already specifies the repo command surface.
- Preserve `operations/threads/` and `operations/tasks/` as operational context sources.
- Before any message send, reply, or operational log update, classify the target channel as `internal` or `external` and keep that classification explicit in reasoning.
- Never copy internal-only financial, legal, strategic, or diagnostic discussion into an external client/vendor channel without deliberate reframing for that external audience.
- If the source context is internal and the destination channel is external, stop and rewrite from first principles for the external recipient instead of forwarding internal wording or conclusions directly.
- If channel ownership or audience is ambiguous, do not send or log the action as final until the target is validated.
- When updating prompts or operating instructions for agents in this repo, prefer explicit stop conditions over soft recommendations for channel-mismatch risks.
- For Playwright usage in the ACOO, treat the local `PlaywrightSessionOwner` as the primary runtime model; use `npm run server:status -- --pretty` and `npm run server:mcp -- doctor playwright --pretty` before assuming the browser session is unavailable, and treat `~/.local/bin/playwright-mcp-brave-open` as manual fallback rather than the default architecture.
