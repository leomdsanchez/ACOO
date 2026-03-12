import type { SkillRoutingProvider } from "../llm/SkillRoutingProvider.js";
import type { LoadedSkill } from "./Skill.js";

export class SkillRouter {
  public constructor(private readonly provider: SkillRoutingProvider) {}

  public chooseSkill(prompt: string, skills: LoadedSkill[]): Promise<LoadedSkill | null> {
    return this.provider.chooseSkill(prompt, skills);
  }
}
