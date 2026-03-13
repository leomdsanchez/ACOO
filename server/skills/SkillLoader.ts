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
      const files = await findInstructionFiles(root);
      for (const filePath of files) {
        results.add(filePath);
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

async function findInstructionFiles(root: string): Promise<string[]> {
  const results: string[] = [];
  const queue = [root];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const entries = await safeReadDir(current);
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        queue.push(entryPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (entry.name === "SKILL.md" || entry.name === "AGENT.md") {
        results.push(entryPath);
      }
    }
  }

  return results;
}

function deriveKeywords(baseName: string, content: string): string[] {
  const normalized = `${baseName} ${content}`
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ");

  return [...new Set(normalized.split(/\s+/).filter((token) => token.length > 4))].slice(0, 12);
}
