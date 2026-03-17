import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateAgentTelegramOperability,
  isTelegramReservedRouteTarget,
} from "./AgentTelegramOperability.js";

test("reserved route targets are detected", () => {
  assert.equal(isTelegramReservedRouteTarget("agents"), true);
  assert.equal(isTelegramReservedRouteTarget("custom-agent"), false);
});

test("disabled/archived agents are not operable on Telegram even with known slug", () => {
  const disabled = evaluateAgentTelegramOperability({
    slug: "ops",
    status: "disabled",
  });
  const archived = evaluateAgentTelegramOperability({
    slug: "ops",
    status: "archived",
  });

  assert.equal(disabled.operable, false);
  assert.equal(archived.operable, false);
  assert.match(disabled.reasons.join(" "), /status/i);
});
