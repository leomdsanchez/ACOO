import type { LlmProvider } from "./LlmProvider.js";
import type { LoadedSkill } from "../skills/Skill.js";

export class SkillRoutingProvider {
  public constructor(private readonly providerName: string) {}

  public getName(): string {
    return this.providerName;
  }

  public async chooseSkill(prompt: string, skills: LoadedSkill[]): Promise<LoadedSkill | null> {
    const normalizedPrompt = prompt.toLowerCase();

    const exactMatch = skills.find((skill) =>
      normalizedPrompt.includes(skill.name.toLowerCase()),
    );
    if (exactMatch) {
      return exactMatch;
    }

    const keywordMatch = skills.find((skill) =>
      skill.keywords.some((keyword) => normalizedPrompt.includes(keyword.toLowerCase())),
    );

    return keywordMatch ?? null;
  }
}

export function ensureProvider(provider: LlmProvider): LlmProvider {
  return provider;
}
