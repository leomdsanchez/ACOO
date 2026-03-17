import test from "node:test";
import assert from "node:assert/strict";
import { resolveDefaultAgentResolution } from "./DefaultAgentResolution.js";

test("keeps configured source when configured default is active", () => {
  const resolution = resolveDefaultAgentResolution(
    [
      { slug: "coo" },
      { slug: "ops" },
    ] as never,
    "coo",
  );

  assert.deepEqual(resolution, {
    effectiveSlug: "coo",
    source: "configured",
  });
});

test("falls back to backup when configured default is unavailable", () => {
  const resolution = resolveDefaultAgentResolution(
    [
      { slug: "ops" },
      { slug: "sales" },
    ] as never,
    "coo",
    "sales",
  );

  assert.deepEqual(resolution, {
    effectiveSlug: "sales",
    source: "backup",
  });
});

test("returns unresolved when active agents do not match configured default or backup", () => {
  const resolution = resolveDefaultAgentResolution(
    [
      { slug: "ops" },
      { slug: "support" },
    ] as never,
    "coo",
    "sales",
  );

  assert.deepEqual(resolution, {
    effectiveSlug: null,
    source: "unresolved",
  });
});

test("returns unresolved when no active agents exist", () => {
  const resolution = resolveDefaultAgentResolution([] as never, "coo");

  assert.deepEqual(resolution, {
    effectiveSlug: null,
    source: "unresolved",
  });
});
