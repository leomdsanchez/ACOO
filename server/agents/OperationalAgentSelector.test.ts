import test from "node:test";
import assert from "node:assert/strict";
import { AgentRegistryConflictError } from "./AgentRegistryErrors.js";
import { selectOperationalActiveAgentFromList } from "./OperationalAgentSelector.js";

test("selects preferred active agent when available", () => {
  const selection = selectOperationalActiveAgentFromList(
    [
      { slug: "coo", role: "primary", createdAt: "2026-03-17T00:00:00.000Z" },
      { slug: "ops", role: "specialist", createdAt: "2026-03-17T00:00:00.000Z" },
    ],
    {
      defaultAgentSlug: "coo",
      preferredSlug: "ops",
    },
  );

  assert.equal(selection.agent.slug, "ops");
  assert.equal(selection.source, "preferred");
});

test("selects configured default when no preferred slug is provided", () => {
  const selection = selectOperationalActiveAgentFromList(
    [
      { slug: "coo", role: "primary", createdAt: "2026-03-17T00:00:00.000Z" },
      { slug: "ops", role: "specialist", createdAt: "2026-03-17T00:00:00.000Z" },
    ],
    {
      defaultAgentSlug: "ops",
    },
  );

  assert.equal(selection.agent.slug, "ops");
  assert.equal(selection.source, "configured-default");
});

test("falls back to configured backup when preferred/default are unavailable", () => {
  const selection = selectOperationalActiveAgentFromList(
    [
      { slug: "sales", role: "automation", createdAt: "2026-03-17T00:00:00.000Z" },
      { slug: "ops", role: "specialist", createdAt: "2026-03-17T00:00:00.000Z" },
      { slug: "coo", role: "primary", createdAt: "2026-03-17T00:00:00.000Z" },
    ],
    {
      defaultAgentSlug: "coo",
      backupAgentSlug: "ops",
      preferredSlug: "ghost",
    },
  );

  assert.equal(selection.agent.slug, "ops");
  assert.equal(selection.source, "configured-backup");
});

test("throws conflict when active agents exist but default and backup are unavailable", () => {
  assert.throws(
    () =>
      selectOperationalActiveAgentFromList(
        [
          { slug: "ops" },
          { slug: "sales" },
        ],
        {
          defaultAgentSlug: "coo",
          backupAgentSlug: "ghost",
          preferredSlug: "ghost",
        },
      ),
    AgentRegistryConflictError,
  );
});

test("throws conflict when no active agents exist", () => {
  assert.throws(
    () =>
      selectOperationalActiveAgentFromList([], {
        defaultAgentSlug: "coo",
      }),
    AgentRegistryConflictError,
  );
});
