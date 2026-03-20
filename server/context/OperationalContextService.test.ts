import test from "node:test";
import assert from "node:assert/strict";
import { OperationalContextService } from "./OperationalContextService.js";

test("builds operational context without embedding the current prompt", async () => {
  const service = new OperationalContextService({
    fronts: {
      listFronts: async () => [
        {
          label: "UTEC",
          nextBlocker: "sem trava",
          status: "Aguardando execução",
        },
      ],
    },
    threads: {
      getThread: async (slug: string) => ({
        createdAt: "2026-03-19T00:00:00.000Z",
        lastUpdatedAt: "2026-03-19T00:00:00.000Z",
        nextBlocker: "sem trava",
        project: null,
        slug,
        sourceReferences: [],
        status: "Aguardando execução",
        tags: [],
        title: "UTEC - curso incubados proposta",
      }),
      listThreads: async () => [
        {
          createdAt: "2026-03-19T00:00:00.000Z",
          lastUpdatedAt: "2026-03-19T00:00:00.000Z",
          nextBlocker: "sem trava",
          project: null,
          slug: "2026-03-18_utec-curso-incubados-proposta",
          status: "Aguardando execução",
          title: "UTEC - curso incubados proposta",
        },
      ],
    },
  } as never);

  const context = await service.build(["2026-03-18_utec-curso-incubados-proposta"], {
    channel: "telegram",
    inputMode: "text",
    requestedOutputMode: "text",
    senderId: "8523829645",
  });

  assert.match(context, /## Interaction/);
  assert.match(context, /## Operational Fronts/);
  assert.match(context, /## Relevant Threads/);
  assert.doesNotMatch(context, /## Current Prompt/);
});
