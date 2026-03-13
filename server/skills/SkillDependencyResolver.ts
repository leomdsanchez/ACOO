import type { LoadedSkill } from "./Skill.js";

const skillMcpDependencies = new Map<string, string[]>([
  ["bubble-neural-run-as", ["playwright"]],
  ["linkedin-lead-warmup", ["playwright"]],
  ["playwright-mcp-brave-session", ["playwright"]],
  ["revisao-operacional-coo", ["playwright"]],
]);

export class SkillDependencyResolver {
  public resolveRequiredMcpServers(skill: LoadedSkill | null): string[] {
    if (!skill) {
      return [];
    }

    return skillMcpDependencies.get(skill.id) ?? [];
  }
}
