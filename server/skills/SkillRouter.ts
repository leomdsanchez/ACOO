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

    let bestMatch: { score: number; skill: LoadedSkill } | null = null;

    for (const skill of skills) {
      const matchedKeywords = skill.keywords.filter((keyword) =>
        normalizedPrompt.includes(normalize(keyword)),
      );
      if (matchedKeywords.length === 0) {
        continue;
      }

      const strongMatches = matchedKeywords.filter((keyword) => !LOW_SIGNAL_KEYWORDS.has(normalize(keyword)));
      if (strongMatches.length === 0) {
        continue;
      }

      const score = (strongMatches.length * 10) + matchedKeywords.length;
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { score, skill };
      }
    }

    return bestMatch?.skill ?? null;
  }
}

const LOW_SIGNAL_KEYWORDS = new Set([
  "assunto",
  "canais",
  "canal",
  "contato",
  "contatos",
  "contexto",
  "decisao",
  "decisoes",
  "documentacao",
  "execucao",
  "operacao",
  "operacional",
  "pessoa",
  "pessoas",
  "processo",
  "processos",
  "projeto",
  "projetos",
  "status",
  "task",
  "tasks",
  "thread",
  "threads",
]);

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
