---
name: operational-registry-tool
description: "Use the local ACOO operational registry tool to inspect the Prisma-backed blueprint, summary and structured lists for projects, people, threads and tasks. Prefer this when the user asks about the new registry/tool, its current model, or wants the ACOO agent to interact with the local registry surface."
---

# Operational Registry Tool

Use this skill when the task is about the local ACOO operational registry backed by SQLite/Prisma.

## Purpose

- inspect the current registry blueprint
- inspect structured counts and records
- verify whether the runtime surface is available
- interact with the registry through the supported local commands

## Primary Surface

Run commands through the repo environment with `direnv`:

```bash
direnv exec . bash -lc 'npm run server:registry -- blueprint --json'
direnv exec . bash -lc 'npm run server:registry -- summary --json'
direnv exec . bash -lc 'npm run server:registry -- projects --json'
direnv exec . bash -lc 'npm run server:registry -- people --json'
direnv exec . bash -lc 'npm run server:registry -- threads --json'
direnv exec . bash -lc 'npm run server:registry -- tasks --json'
```

## Optional HTTP Surface

If the local API server is already running, the same data is available at:

- `GET /api/registry/blueprint`
- `GET /api/registry/summary`
- `GET /api/registry/projects`
- `GET /api/registry/people`
- `GET /api/registry/threads`
- `GET /api/registry/tasks`

## Rules

- Prefer the CLI surface first because it does not require the API server to be up.
- Always use `direnv exec .` so the repo environment loads `node` and `npm`.
- Treat `operations/*` as operational context and audit trail, not the primary source of truth for this tool.
- Do not claim write support unless a write command or endpoint actually exists.

## Completion Criteria

- You used the registry CLI or HTTP surface successfully.
- You reported the result in structured operational terms.
- You did not infer write capability that is not implemented.
