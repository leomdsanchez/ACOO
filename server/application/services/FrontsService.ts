import type { OperationalRepository } from "../ports/OperationalRepository.js";
import type { OperationalStatus, ThreadSummary } from "../../domain/models.js";

export interface FrontSummary {
  key: string;
  label: string;
  status: OperationalStatus | null;
  nextBlocker: string | null;
  threadCount: number;
  threads: ThreadSummary[];
}

export class FrontsService {
  public constructor(private readonly repository: OperationalRepository) {}

  public async listFronts(): Promise<FrontSummary[]> {
    const threads = await this.repository.listThreads({ includeArchived: false });
    const groups = new Map<string, ThreadSummary[]>();

    for (const thread of threads) {
      const label = deriveFrontLabel(thread.title);
      const key = toFrontKey(label);
      const current = groups.get(key) ?? [];
      current.push(thread);
      groups.set(key, current);
    }

    return [...groups.entries()]
      .map(([key, groupThreads]) => {
        const latest = [...groupThreads].sort(compareLastLogDescending)[0] ?? null;
        return {
          key,
          label: latest ? deriveFrontLabel(latest.title) : key,
          status: latest?.status ?? null,
          nextBlocker: latest?.nextBlocker ?? null,
          threadCount: groupThreads.length,
          threads: groupThreads.sort(compareLastLogDescending),
        };
      })
      .sort((left, right) => left.label.localeCompare(right.label, "pt-BR"));
  }
}

function deriveFrontLabel(title: string): string {
  const [candidate] = title.split(" - ");
  return candidate.trim();
}

function toFrontKey(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function compareLastLogDescending(left: ThreadSummary, right: ThreadSummary): number {
  return (right.lastLogAt ?? "").localeCompare(left.lastLogAt ?? "");
}
