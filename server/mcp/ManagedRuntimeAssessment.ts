import type { McpBootstrapResult, ManagedMcpRuntimeHealth } from "./McpSessionBootstrapper.js";

export type ManagedRuntimeSeverity = "low" | "medium" | "high";

export interface ManagedRuntimeAssessment {
  nextAction: string;
  severity: ManagedRuntimeSeverity | null;
  summary: string;
}

export function assessManagedRuntimeHealth(
  runtime: ManagedMcpRuntimeHealth,
): ManagedRuntimeAssessment {
  if (runtime.healthy) {
    return {
      nextAction: "Nenhuma. Runtime saudável.",
      severity: null,
      summary: "Runtime saudável e anexável.",
    };
  }

  const doctorStep = runtime.doctorCommand
    ? `Diagnostique com: ${runtime.doctorCommand}.`
    : "Diagnostique o runtime.";
  const startupStep = runtime.autostart
    ? "Se quiser antecipar a recuperação, rode: npm run server:mcp -- ensure playwright --pretty."
    : `Se a sessão operacional realmente estiver ausente, inicie com: ${runtime.startupCommand}.`;

  return {
    nextAction: runtime.autostart ? startupStep : `${doctorStep} ${startupStep}`.trim(),
    severity: "medium",
    summary: runtime.autostart
      ? "Sessão persistente fora do ar; o sistema tentará recuperar no próximo uso."
      : "Sessão persistente indisponível; pode ser ausência da sessão operacional.",
  };
}

export function assessManagedRuntimeBootstrap(
  result: McpBootstrapResult,
): ManagedRuntimeAssessment {
  if (result.healthy) {
    return {
      nextAction: "Nenhuma. Runtime pronto para uso.",
      severity: null,
      summary: "Runtime pronto para uso.",
    };
  }

  if (result.manualStartRequired && !result.startupAttempted) {
    return {
      nextAction: result.startupCommand
        ? `Rode o doctor e, se a sessão estiver ausente, inicie com: ${result.startupCommand}.`
        : "Rode o doctor do runtime e valide a sessão operacional.",
      severity: "low",
      summary: "Skill bloqueada por sessão operacional indisponível antes do bootstrap.",
    };
  }

  return {
    nextAction: "Rode o doctor do runtime antes de nova tentativa operacional.",
    severity: "high",
    summary: "Falha de runtime durante o bootstrap operacional.",
  };
}
