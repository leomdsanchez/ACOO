import type { LoadedSkill } from "./Skill.js";

const skillMcpDependencies = new Map<string, string[]>([
  ["bubble-neural-run-as", ["playwright"]],
  ["linkedin-lead-warmup", ["playwright"]],
  ["playwright-mcp-brave-session", ["playwright"]],
]);

export class SkillDependencyResolver {
  public resolveRequiredMcpServers(skill: LoadedSkill | null, prompt = ""): string[] {
    if (!skill) {
      return [];
    }

    if (skill.id === "revisao-operacional-coo") {
      return requiresOperationalChannelValidation(prompt) ? ["playwright"] : [];
    }

    return skillMcpDependencies.get(skill.id) ?? [];
  }
}

function requiresOperationalChannelValidation(prompt: string): boolean {
  const normalized = normalize(prompt);
  if (!normalized) {
    return false;
  }

  const indicators = [
    "abrir",
    "bubble",
    "canal",
    "canais",
    "checar",
    "clockify",
    "conversa",
    "conversa real",
    "email",
    "e-mail",
    "gmail",
    "login",
    "mensagem",
    "mensagens",
    "notion",
    "origem",
    "playwright",
    "run as",
    "sessao do browser",
    "validar",
    "whatsapp",
    "workspace",
  ];

  return indicators.some((indicator) => normalized.includes(normalize(indicator)));
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
