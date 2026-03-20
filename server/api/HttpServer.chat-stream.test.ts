import test from "node:test";
import assert from "node:assert/strict";
import { extractLatestUserMessageInput } from "./HttpServer.js";

test("extractLatestUserMessageInput prefers the latest user message and joins text parts", () => {
  const payload = extractLatestUserMessageInput([
    {
      content: "ignored assistant reply",
      role: "assistant",
    },
    {
      content: "older user message",
      role: "user",
    },
    {
      parts: [
        { text: "hello", type: "text" },
        { text: " world", type: "text" },
      ],
      role: "user",
    },
  ]);

  assert.deepEqual(payload, {
    attachments: [],
    text: "hello world",
  });
});

test("extractLatestUserMessageInput supports simple content strings", () => {
  const payload = extractLatestUserMessageInput([
    {
      content: "plain user message",
      role: "user",
    },
  ]);

  assert.equal(payload?.text, "plain user message");
  assert.equal(payload?.attachments.length, 0);
});

test("extractLatestUserMessageInput extracts file attachments even without text", () => {
  const payload = extractLatestUserMessageInput([
    {
      parts: [{ filename: "audio.webm", mediaType: "audio/webm", type: "file" }],
      role: "user",
    },
  ]);

  assert.equal(payload?.text, "");
  assert.equal(payload?.attachments[0]?.kind, "audio");
  assert.equal(payload?.attachments[0]?.filename, "audio.webm");
});

test("extractLatestUserMessageInput returns null when there is no usable user input", () => {
  const payload = extractLatestUserMessageInput([
    {
      parts: [{ data: "not text", type: "unknown" }],
      role: "user",
    },
    {
      content: "assistant only",
      role: "assistant",
    },
  ]);

  assert.equal(payload, null);
});
