import type { OperationalWorkspace } from "../application/services/OperationalWorkspace.js";
import type { ThreadRecord } from "../domain/models.js";

export class OperationalContextAssembler {
  public constructor(private readonly workspace: OperationalWorkspace) {}

  public async buildContext(prompt: string, preferredThreadSlugs: string[] = []): Promise<string> {
    const threads = await this.resolveThreads(preferredThreadSlugs);
    const fronts = await this.workspace.fronts.listFronts();

    return [
      "## Operational Fronts",
      fronts
        .map((front) => `- ${front.label}: ${front.status ?? "sem status"} | ${front.nextBlocker ?? "sem trava"}`)
        .join("\n"),
      "",
      "## Relevant Threads",
      threads
        .map((thread) => [
          `### ${thread.title}`,
          `- Status: ${thread.status ?? "sem status"}`,
          `- Próxima trava: ${thread.nextBlocker ?? "sem trava"}`,
        ].join("\n"))
        .join("\n\n"),
      "",
      "## Current Prompt",
      prompt,
    ].join("\n");
  }

  private async resolveThreads(preferredThreadSlugs: string[]): Promise<ThreadRecord[]> {
    if (preferredThreadSlugs.length === 0) {
      const activeThreads = await this.workspace.threads.listThreads({ includeArchived: false });
      const topThreads = activeThreads.slice(0, 5);
      const hydrated = await Promise.all(topThreads.map((thread) => this.workspace.threads.getThread(thread.slug)));
      return hydrated.filter((thread): thread is ThreadRecord => thread !== null);
    }

    const hydrated = await Promise.all(
      preferredThreadSlugs.map((slug) => this.workspace.threads.getThread(slug)),
    );
    return hydrated.filter((thread): thread is ThreadRecord => thread !== null);
  }
}
