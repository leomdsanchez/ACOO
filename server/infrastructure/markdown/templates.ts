import path from "node:path";
import type {
  AppendThreadLogInput,
  CreateTaskInput,
  CreateThreadInput,
  OperationalStatus,
  TaskRecord,
  ThreadRecord,
} from "../../domain/models.js";

export function renderThreadMarkdown(input: CreateThreadInput): string {
  const people = renderListValue(input.people);
  const groups = renderListValue(input.groups);
  const emails = renderListValue(input.emails);
  const otherChannels = renderListValue(input.otherChannels);

  return [
    `# Thread: ${input.title}`,
    "",
    "## Contexto Inicial",
    `- Assunto: ${input.subject}`,
    `- Pessoas: ${people}`,
    `- Objetivo: ${input.objective}`,
    `- Grupo(s): ${groups}`,
    `- WhatsApp (contato/nome): ${input.whatsapp ?? "não aplicável."}`,
    `- E-mail(s): ${emails}`,
    `- Outros canais: ${otherChannels}`,
    "",
    "## Logs",
    renderThreadLogBlockSection({
      timestamp: input.timestamp,
      title: "Abertura da thread",
      entries: ["Thread criada pelo core operacional local."],
      status: input.status ?? "Aguardando decisão",
      nextBlocker:
        input.nextBlocker ?? "definir após primeira validação em canal de origem.",
    }),
    "",
  ].join("\n");
}

export function renderThreadLogBlock(input: AppendThreadLogInput): string {
  return renderThreadLogBlockSection({
    timestamp: input.timestamp,
    title: input.title,
    entries: input.entries,
    status: input.status,
    nextBlocker: input.nextBlocker,
  });
}

export function renderThreadLogBlockSection(input: {
  timestamp: string;
  title: string;
  entries: string[];
  status?: OperationalStatus;
  nextBlocker?: string;
}): string {
  const lines = [
    `### ${input.timestamp} | ${input.title}`,
    ...input.entries.map((entry) => `- ${entry}`),
  ];

  if (input.status) {
    lines.push(`- Estado atual: \`${input.status}\`.`);
  }

  if (input.nextBlocker) {
    lines.push(`- Próxima trava real: ${input.nextBlocker}`);
  }

  return lines.join("\n");
}

export function appendThreadLogMarkdown(
  currentContent: string,
  input: AppendThreadLogInput,
): string {
  const trimmed = currentContent.trimEnd();
  const hasLogsSection = trimmed.includes("\n## Logs");

  if (!hasLogsSection) {
    return `${trimmed}\n\n## Logs\n${renderThreadLogBlock(input)}\n`;
  }

  return `${trimmed}\n\n${renderThreadLogBlock(input)}\n`;
}

export function renderTaskMarkdown(
  input: CreateTaskInput,
  relatedThread: ThreadRecord | null,
  taskFilePath: string,
): string {
  const contextLines = input.contextLines ?? ["Definir contexto validado na primeira execução."];
  const executionLines = input.executionLines ?? [
    "Definir frente de execução principal.",
  ];
  const checklist = input.checklist ?? ["Validar a próxima ação em canal de origem."];
  const completionCriteria = input.completionCriteria ?? [
    "Existe evidência objetiva do fechamento e registro correspondente na thread.",
  ];

  return [
    `# Task: ${input.title}`,
    "",
    "## Metadados",
    `- ID: \`${buildTaskId(input)}\``,
    `- Criada em: \`${input.timestamp}\` (America/Montevideo)`,
    `- Dono: \`${input.owner}\``,
    `- Prioridade: \`${input.priority}\``,
    `- Status: \`${input.status}\``,
    "",
    "## Objetivo",
    input.objective,
    "",
    "## Data de execução",
    `- Planejada: \`${input.plannedDate}\``,
    "",
    "## Thread relacionada",
    renderThreadReference(relatedThread),
    "",
    "## Contexto validado",
    ...contextLines.map((line) => `- ${line}`),
    "",
    "## Frentes de execução",
    ...executionLines.map((line) => `- ${line}`),
    "",
    "## Checklist de execução",
    ...checklist.map((line) => `- [ ] ${line}`),
    "",
    "## Atualização operacional",
    `- \`${input.timestamp}\`: task criada pelo core operacional em \`${path.basename(taskFilePath)}\`.`,
    "",
    "## Critério de conclusão",
    ...completionCriteria.map((line) => `- ${line}`),
    "",
  ].join("\n");
}

export function appendTaskStatusUpdate(currentContent: string, task: TaskRecord, note: string): string {
  const replacedStatus = currentContent.replace(
    /^- Status:\s*`([^`]+)`/m,
    `- Status: \`${task.status ?? "Aguardando execução"}\``,
  );

  const trimmed = replacedStatus.trimEnd();
  const updateLine = `- \`${note}\``;

  if (trimmed.includes("\n## Atualização operacional")) {
    return `${trimmed}\n${updateLine}\n`;
  }

  return `${trimmed}\n\n## Atualização operacional\n${updateLine}\n`;
}

function buildTaskId(input: CreateTaskInput): string {
  return `task-${input.slug}-${input.plannedDate}`;
}

function renderThreadReference(thread: ThreadRecord | null): string {
  if (!thread) {
    return "- Não vinculada.";
  }

  return `- [${path.basename(thread.filePath)}](${thread.filePath})`;
}

function renderListValue(values: string[] | undefined): string {
  if (!values || values.length === 0) {
    return "não aplicável.";
  }

  return values.join(", ");
}
