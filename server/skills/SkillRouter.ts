import type { LoadedSkill } from "./Skill.js";

export class SkillRouter {
  public async chooseSkill(prompt: string, skills: LoadedSkill[]): Promise<LoadedSkill | null> {
    const normalizedPrompt = prompt.toLowerCase();

    const exactMatch = skills.find((skill) =>
      normalizedPrompt.includes(skill.name.toLowerCase()),
    );
    if (exactMatch) {
      return exactMatch;
    }

    return (
      skills.find((skill) =>
        skill.keywords.some((keyword) => normalizedPrompt.includes(keyword.toLowerCase())),
      ) ?? null
    );
  }
}
