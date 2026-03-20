import { ManagedRuntimeUnavailableError } from "../mcp/ManagedRuntimeUnavailableError.js";
import {
  CodexCliAbortedError,
  CodexCliResumeError,
  CodexCliTimeoutError,
} from "../codex/CodexCliService.js";

export function getUserFacingErrorMessage(error: unknown): string | null {
  if (error instanceof ManagedRuntimeUnavailableError) {
    return error.publicMessage;
  }

  if (error instanceof CodexCliTimeoutError) {
    return "A execução do agente expirou e foi encerrada para não travar o processo. Tente novamente.";
  }

  if (error instanceof CodexCliResumeError) {
    if (!error.retryable) {
      return error.causeMessage;
    }
    return "A sessão anterior do agente falhou ao retomar e foi descartada. Tente novamente.";
  }

  if (error instanceof CodexCliAbortedError) {
    return "A execução anterior foi interrompida para liberar o processo.";
  }

  return null;
}
