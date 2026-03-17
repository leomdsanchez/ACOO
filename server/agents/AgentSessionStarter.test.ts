import test from "node:test";
import assert from "node:assert/strict";
import { AgentSessionStarter } from "./AgentSessionStarter.js";
import { SkillDependencyResolver } from "../skills/SkillDependencyResolver.js";
import type { LoadedSkill } from "../skills/Skill.js";
import type { McpPolicyEvaluation } from "../mcp/McpPolicyEvaluator.js";
import type { McpSessionBootstrapper } from "../mcp/McpSessionBootstrapper.js";
import { ManagedRuntimeUnavailableError } from "../mcp/ManagedRuntimeUnavailableError.js";

const PLAYWRIGHT_SKILL: LoadedSkill = {
  id: "playwright-mcp-brave-session",
  name: "Playwright MCP + Brave Persistent Session",
  description: "test skill",
  keywords: [],
  sourcePath: "/tmp/playwright-mcp-brave-session/SKILL.md",
  content: "test",
};

const MCP_POLICY: McpPolicyEvaluation = {
  blockedConfigured: [],
  configuredNames: ["playwright"],
  configuredOptional: [],
  configuredRequired: ["playwright"],
  disabledForRun: [],
  missingRequired: [],
  profile: null,
};

test("manual startup error points to doctor before operational startup", async () => {
  const bootstrapper = {
    ensureReady: async () => [
      {
        healthy: false,
        manualStartRequired: true,
        managed: true,
        name: "playwright",
        startupAttempted: false,
        startupCommand: "/Users/leosanchez/.local/bin/playwright-mcp-brave-open",
      },
    ],
  } as unknown as McpSessionBootstrapper;
  const starter = new AgentSessionStarter(
    bootstrapper,
    new SkillDependencyResolver(),
  );

  await assert.rejects(
    () => starter.prepare(PLAYWRIGHT_SKILL, MCP_POLICY),
    (error: unknown) => {
      assert.ok(error instanceof ManagedRuntimeUnavailableError);
      assert.match(String(error), /doctor playwright --pretty/);
      assert.match(String(error), /playwright-mcp-brave-open/);
      assert.match(error.publicMessage, /Runtime MCP indisponível: playwright/);
      assert.deepEqual(error.runtimeNames, ["playwright"]);
      return true;
    },
  );
});

test("failed managed runtime after startup also points to the doctor command", async () => {
  const bootstrapper = {
    ensureReady: async () => [
      {
        healthy: false,
        manualStartRequired: false,
        managed: true,
        name: "playwright",
        startupAttempted: true,
        startupCommand: "/Users/leosanchez/.local/bin/playwright-mcp-brave-open",
      },
    ],
  } as unknown as McpSessionBootstrapper;
  const starter = new AgentSessionStarter(
    bootstrapper,
    new SkillDependencyResolver(),
  );

  await assert.rejects(
    () => starter.prepare(PLAYWRIGHT_SKILL, MCP_POLICY),
    (error: unknown) => {
      assert.ok(error instanceof ManagedRuntimeUnavailableError);
      assert.match(String(error), /doctor playwright --pretty/);
      assert.match(error.publicMessage, /Diagnostique com:/);
      assert.deepEqual(error.runtimeNames, ["playwright"]);
      return true;
    },
  );
});
