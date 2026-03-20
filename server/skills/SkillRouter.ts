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
      const inferredStrongMatches = strongMatches.length === 0
        ? inferStrongMatches(normalizedPrompt, skill, matchedKeywords)
        : strongMatches;
      if (inferredStrongMatches.length === 0) {
        continue;
      }

      const score = (inferredStrongMatches.length * 10) + matchedKeywords.length;
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

const REGISTRY_ACTION_KEYWORDS = [
  "listar",
  "lista",
  "mostrar",
  "mostra",
  "consultar",
  "consulta",
  "inspecionar",
  "inspeciona",
  "resumo",
  "summary",
];

const REGISTRY_ENTITY_KEYWORDS = [
  "projeto",
  "projetos",
  "pessoa",
  "pessoas",
  "thread",
  "threads",
  "task",
  "tasks",
];

function inferStrongMatches(
  normalizedPrompt: string,
  skill: LoadedSkill,
  matchedKeywords: string[],
): string[] {
  if (skill.id !== "operational-registry-tool") {
    return [];
  }

  const hasRegistryIntent = REGISTRY_ACTION_KEYWORDS.some((keyword) => normalizedPrompt.includes(keyword));
  const hasRegistryEntity = REGISTRY_ENTITY_KEYWORDS.some((keyword) => normalizedPrompt.includes(keyword));
  if (!hasRegistryIntent || !hasRegistryEntity) {
    return [];
  }

  return matchedKeywords.length > 0 ? ["operational-registry-intent"] : [];
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
