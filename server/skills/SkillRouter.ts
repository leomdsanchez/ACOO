import type { LoadedSkill } from "./Skill.js";

export class SkillRouter {
  public async chooseSkill(prompt: string, skills: LoadedSkill[]): Promise<LoadedSkill | null> {
    const normalizedPrompt = normalize(prompt);

    const exactMatch = skills.find((skill) => {
      const candidates = [
        normalize(skill.id),
        normalize(skill.name),
        `$${normalize(skill.id)}`,
        `$${normalize(skill.name)}`,
      ];

      return candidates.some((candidate) => normalizedPrompt.includes(candidate));
    });
    if (exactMatch) {
      return exactMatch;
    }

    return (
      skills.find((skill) =>
        skill.keywords.some((keyword) => normalizedPrompt.includes(normalize(keyword))),
      ) ?? null
    );
  }
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
