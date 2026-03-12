import type { OperationalWorkspace } from "../application/services/OperationalWorkspace.js";
import type { ThreadRecord } from "../domain/models.js";

export class OperationalContextService {
  public constructor(private readonly workspace: OperationalWorkspace) {}

  public async build(prompt: string, preferredThreadSlugs: string[] = []): Promise<string> {
    const [fronts, threads] = await Promise.all([
      this.workspace.fronts.listFronts(),
      this.resolveThreads(preferredThreadSlugs),
    ]);

    return [
      "## Operational Fronts",
      fronts
        .map((front) => `- ${front.label}: ${front.status ?? "sem status"} | ${front.nextBlocker ?? "sem trava"}`)
        .join("\n"),
      "",
      "## Relevant Threads",
      threads
        .map((thread) =>
          [
            `### ${thread.title}`,
            `- Status: ${thread.status ?? "sem status"}`,
            `- Próxima trava: ${thread.nextBlocker ?? "sem trava"}`,
          ].join("\n"),
        )
        .join("\n\n"),
      "",
      "## Current Prompt",
      prompt,
    ].join("\n");
  }

  private async resolveThreads(preferredThreadSlugs: string[]): Promise<ThreadRecord[]> {
    if (preferredThreadSlugs.length === 0) {
      const summaries = await this.workspace.threads.listThreads({ includeArchived: false });
      const records = await Promise.all(
        summaries.slice(0, 5).map((thread) => this.workspace.threads.getThread(thread.slug)),
      );
      return records.filter((thread): thread is ThreadRecord => thread !== null);
    }

    const records = await Promise.all(
      preferredThreadSlugs.map((slug) => this.workspace.threads.getThread(slug)),
    );
    return records.filter((thread): thread is ThreadRecord => thread !== null);
  }
}
