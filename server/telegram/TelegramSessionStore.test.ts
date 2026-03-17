import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { TelegramSessionStore } from "./TelegramSessionStore.js";

test("replaceAgentSlug rewrites matching chats and clears attached sessions", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "acoo-telegram-session-store-"));
  const store = new TelegramSessionStore(repoRoot, "coo");

  try {
    await store.switchAgent(101, "ops", { preserveActive: true });
    await store.attachSession(101, "thread-ops");
    await store.switchAgent(202, "coo", { preserveActive: true });
    await store.attachSession(202, "thread-coo");

    const replaced = await store.replaceAgentSlug("ops", "coo");

    assert.equal(replaced, 1);

    const firstChat = await store.load(101);
    const secondChat = await store.load(202);

    assert.equal(firstChat.activeAgentSlug, "coo");
    assert.equal(firstChat.sessionId, null);
    assert.equal(secondChat.activeAgentSlug, "coo");
    assert.equal(secondChat.sessionId, "thread-coo");
  } finally {
    await rm(repoRoot, { force: true, recursive: true });
  }
});

test("load falls back to configured default agent slug", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "acoo-telegram-session-store-"));
  const store = new TelegramSessionStore(repoRoot, "ops");

  try {
    const chat = await store.load(303);

    assert.equal(chat.activeAgentSlug, "ops");
    assert.equal(chat.active, false);
    assert.equal(chat.sessionId, null);
  } finally {
    await rm(repoRoot, { force: true, recursive: true });
  }
});
