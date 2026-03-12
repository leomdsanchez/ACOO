export interface SkillMetadata {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  sourcePath: string;
}

export interface LoadedSkill extends SkillMetadata {
  content: string;
}
