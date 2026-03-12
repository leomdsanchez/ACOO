import type { LoadedSkill } from "./Skill.js";

export class SkillExecutor {
  public buildSkillContext(skill: LoadedSkill | null): string | null {
    if (!skill) {
      return null;
    }

    return [
      `## Active Skill`,
      `- Name: ${skill.name}`,
      `- Source: ${skill.sourcePath}`,
      "",
      skill.content,
    ].join("\n");
  }
}
