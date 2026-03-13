# ACOO Repository Instructions

- Treat the ACOO as a control plane on top of Codex CLI, not as a fake local agent runtime.
- Keep `AGENTS.md`, agent prompts and skills as separate concepts.
- Use `agents/<slug>/prompt.md` for agent overlays.
- Use `.agents/skills/` for project-local skills and `~/.codex/skills/` for global skills.
- Preserve `threads/` and `tasks/` as operational context sources.
