import type { OperationalWorkspace } from "../application/services/OperationalWorkspace.js";
import type { ThreadRecord } from "../domain/models.js";
import type { AgentInteractionContext } from "../controller/AgentController.js";

export class OperationalContextService {
  public constructor(private readonly workspace: OperationalWorkspace) {}

  public async build(
    prompt: string,
    preferredThreadSlugs: string[] = [],
    interaction?: AgentInteractionContext,
  ): Promise<string> {
    const [fronts, threads] = await Promise.all([
      this.workspace.fronts.listFronts(),
      this.resolveThreads(preferredThreadSlugs),
    ]);

    return [
      "## Interaction",
      formatInteraction(interaction),
      "",
      "## Operational Fronts",
      formatFronts(fronts),
      "",
      "## Relevant Threads",
      formatThreads(threads),
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

function formatInteraction(interaction?: AgentInteractionContext): string {
  if (!interaction) {
    return "- Channel: cli\n- Input: text\n- Requested output: text";
  }

  return [
    `- Channel: ${interaction.channel}`,
    `- Input: ${interaction.inputMode}`,
    `- Requested output: ${interaction.requestedOutputMode}`,
    interaction.senderId ? `- Sender: ${interaction.senderId}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function formatFronts(
  fronts: Awaited<ReturnType<OperationalWorkspace["fronts"]["listFronts"]>>,
): string {
  if (fronts.length === 0) {
    return "- Nenhuma frente ativa identificada.";
  }

  return fronts
    .map(
      (front) =>
        `- ${front.label}: ${front.status ?? "sem status"} | ${front.nextBlocker ?? "sem trava"}`,
    )
    .join("\n");
}

function formatThreads(threads: ThreadRecord[]): string {
  if (threads.length === 0) {
    return "- Nenhuma thread relevante encontrada.";
  }

  return threads
    .map((thread) =>
      [
        `### ${thread.title}`,
        `- Slug: ${thread.slug}`,
        `- Status: ${thread.status ?? "sem status"}`,
        `- Próxima trava: ${thread.nextBlocker ?? "sem trava"}`,
      ].join("\n"),
    )
    .join("\n\n");
}
