import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { LoadedSkill } from "./Skill.js";

export interface SkillLoaderOptions {
  roots: string[];
}

export class SkillLoader {
  public constructor(private readonly options: SkillLoaderOptions) {}

  public async loadAll(): Promise<LoadedSkill[]> {
    const files = await this.findSkillFiles();
    const loaded = await Promise.all(files.map((filePath) => this.loadSkillFile(filePath)));
    return loaded.filter((skill): skill is LoadedSkill => skill !== null);
  }

  private async findSkillFiles(): Promise<string[]> {
    const results = new Set<string>();

    for (const root of this.options.roots) {
      const entries = await safeReadDir(root);
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const skillMd = path.join(root, entry.name, "SKILL.md");
        const agentMd = path.join(root, entry.name, "AGENT.md");
        if (await fileExists(skillMd)) {
          results.add(skillMd);
        }
        if (await fileExists(agentMd)) {
          results.add(agentMd);
        }
      }
    }

    return [...results].sort();
  }

  private async loadSkillFile(filePath: string): Promise<LoadedSkill | null> {
    const content = await readFile(filePath, "utf8");
    const lines = content.split("\n");
    const firstHeading = lines.find((line) => line.startsWith("# "));
    const summary = lines.find((line) => line.trim().startsWith("- ")) ?? "";
    const baseName = path.basename(path.dirname(filePath));

    return {
      id: baseName,
      name: firstHeading ? firstHeading.replace(/^#\s+/, "").trim() : baseName,
      description: summary.replace(/^- /, "").trim() || `Skill carregada de ${filePath}`,
      keywords: deriveKeywords(baseName, content),
      sourcePath: filePath,
      content,
    };
  }
}

async function safeReadDir(directoryPath: string) {
  try {
    return await readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath, "utf8");
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function deriveKeywords(baseName: string, content: string): string[] {
  const normalized = `${baseName} ${content}`
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ");

  return [...new Set(normalized.split(/\s+/).filter((token) => token.length > 4))].slice(0, 12);
}
