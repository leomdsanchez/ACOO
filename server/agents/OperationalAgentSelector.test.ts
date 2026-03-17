import test from "node:test";
import assert from "node:assert/strict";
import { AgentRegistryConflictError } from "./AgentRegistryErrors.js";
import { selectOperationalActiveAgentFromList } from "./OperationalAgentSelector.js";

test("selects preferred active agent when available", () => {
  const selection = selectOperationalActiveAgentFromList(
    [{ slug: "coo" }, { slug: "ops" }],
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
    [{ slug: "coo" }, { slug: "ops" }],
    {
      defaultAgentSlug: "ops",
    },
  );

  assert.equal(selection.agent.slug, "ops");
  assert.equal(selection.source, "configured-default");
});

test("falls back to first active when preferred/default are unavailable", () => {
  const selection = selectOperationalActiveAgentFromList(
    [{ slug: "ops" }, { slug: "sales" }],
    {
      defaultAgentSlug: "coo",
      preferredSlug: "ghost",
    },
  );

  assert.equal(selection.agent.slug, "ops");
  assert.equal(selection.source, "fallback-first-active");
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
