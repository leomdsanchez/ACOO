import test from "node:test";
import assert from "node:assert/strict";
import { getUserFacingErrorMessage } from "./UserFacingError.js";
import { ManagedRuntimeUnavailableError } from "../mcp/ManagedRuntimeUnavailableError.js";
import {
  CodexCliAbortedError,
  CodexCliResumeError,
  CodexCliTimeoutError,
} from "../codex/CodexCliService.js";

test("returns the public message for managed runtime blockers", () => {
  const error = new ManagedRuntimeUnavailableError("technical", "public");
  assert.equal(getUserFacingErrorMessage(error), "public");
});

test("returns null for unknown errors", () => {
  assert.equal(getUserFacingErrorMessage(new Error("generic")), null);
});

test("returns a stable message for codex execution timeouts", () => {
  assert.equal(
    getUserFacingErrorMessage(new CodexCliTimeoutError(120_000)),
    "A execução do agente expirou e foi encerrada para não travar o processo. Tente novamente.",
  );
});

test("returns a stable message for codex resume failures", () => {
  assert.equal(
    getUserFacingErrorMessage(new CodexCliResumeError("resume failed", "timeout")),
    "A sessão anterior do agente falhou ao retomar e foi descartada. Tente novamente.",
  );
});

test("returns the underlying cause for non-retryable resume failures", () => {
  assert.equal(
    getUserFacingErrorMessage(
      new CodexCliResumeError("resume failed", "Insufficient credits for this run.", false),
    ),
    "Insufficient credits for this run.",
  );
});

test("returns a stable message for codex aborts", () => {
  assert.equal(
    getUserFacingErrorMessage(new CodexCliAbortedError()),
    "A execução anterior foi interrompida para liberar o processo.",
  );
});
