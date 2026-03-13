import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AgentRecord } from "../domain/models.js";

export class AgentPromptLoader {
  public async load(agent: AgentRecord | null, cwd: string): Promise<string | null> {
    if (!agent?.promptTemplatePath) {
      return null;
    }

    const templatePath = path.isAbsolute(agent.promptTemplatePath)
      ? agent.promptTemplatePath
      : path.join(cwd, agent.promptTemplatePath);

    try {
      const promptTemplate = await readFile(templatePath, "utf8");
      const normalized = promptTemplate.trim();
      return normalized ? normalized : null;
    } catch {
      return `Prompt template esperado em ${agent.promptTemplatePath}, mas o arquivo nao foi lido.`;
    }
  }
}
