import path from "node:path";
import type {
  TaskRecord,
  TaskStorageKind,
  ThreadRecord,
  ThreadSourceReference,
  ThreadStorageKind,
} from "../../domain/models.js";

const THREAD_STATUS_PATTERN =
  /Estado(?: atual| operacional| consolidado da thread)?\:\s*`([^`]+)`/g;
const NEXT_BLOCKER_PATTERN = /Próxima trava real\:\s*(.+)/g;
const THREAD_LOG_PATTERN = /^###\s+([0-9]{4}-[0-9]{2}-[0-9]{2}(?: [0-9x:]{2,5})?)\s+\|/gm;
const TASK_FIELD_PATTERN = /^- ([^:]+):\s*(.+)$/gm;

export function parseThreadRecord(
  filePath: string,
  content: string,
  storage: ThreadStorageKind,
): ThreadRecord {
  const slug = path.basename(filePath, ".md");
  const title = readHeading(content, "# Thread: ") ?? slug;

  return {
    id: slug,
    slug,
    title,
    storage,
    filePath,
    status: readLastCapture(content, THREAD_STATUS_PATTERN),
    nextBlocker: readLastCapture(content, NEXT_BLOCKER_PATTERN),
    lastLogAt: readLastCapture(content, THREAD_LOG_PATTERN),
    sourceReferences: readThreadSourceReferences(content),
    content,
  };
}

export function parseTaskRecord(
  filePath: string,
  content: string,
  storage: TaskStorageKind,
): TaskRecord {
  const slug = path.basename(filePath, ".md");
  const title = readHeading(content, "# Task: ") ?? slug;
  const fields = readTaskFields(content);

  return {
    id: readBacktickedValue(fields.get("ID")) ?? slug,
    slug,
    title,
    storage,
    filePath,
    status: readBacktickedValue(fields.get("Status")) ?? null,
    priority: readBacktickedValue(fields.get("Prioridade")) ?? null,
    relatedThreadPath: readMarkdownLinkTarget(content, "## Thread relacionada"),
    createdAt: fields.get("Criada em") ?? null,
    content,
  };
}

export function toFileSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readHeading(content: string, prefix: string): string | null {
  const firstLine = content.split("\n", 1)[0]?.trim() ?? "";
  return firstLine.startsWith(prefix) ? firstLine.slice(prefix.length).trim() : null;
}

function readLastCapture(content: string, pattern: RegExp): string | null {
  const matches = [...content.matchAll(pattern)];
  const lastMatch = matches.at(-1);
  return lastMatch?.[1]?.trim() ?? null;
}

function readTaskFields(content: string): Map<string, string> {
  const matches = [...content.matchAll(TASK_FIELD_PATTERN)];
  return new Map(matches.map((match) => [match[1].trim(), match[2].trim()]));
}

function readBacktickedValue(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const match = value.match(/`([^`]+)`/);
  return match?.[1]?.trim() ?? value.trim();
}

function readMarkdownLinkTarget(content: string, sectionHeading: string): string | null {
  const sectionIndex = content.indexOf(sectionHeading);
  if (sectionIndex === -1) {
    return null;
  }

  const afterSection = content.slice(sectionIndex);
  const match = afterSection.match(/\[[^\]]+\]\(([^)]+)\)/);
  return match?.[1] ?? null;
}

function readThreadSourceReferences(content: string): ThreadSourceReference[] {
  const section = readMarkdownSection(content, "## Referências de Origem");
  if (!section) {
    return [];
  }

  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .map(parseThreadSourceReference)
    .filter((reference): reference is ThreadSourceReference => reference !== null);
}

function readMarkdownSection(content: string, heading: string): string | null {
  const start = content.indexOf(heading);
  if (start === -1) {
    return null;
  }

  const afterHeading = content.slice(start + heading.length);
  const nextHeadingIndex = afterHeading.search(/\n##\s+/);
  if (nextHeadingIndex === -1) {
    return afterHeading.trim();
  }

  return afterHeading.slice(0, nextHeadingIndex).trim();
}

function parseThreadSourceReference(line: string): ThreadSourceReference | null {
  if (line === "Não vinculada a um canal de origem específico ainda.") {
    return null;
  }

  const fields = new Map(
    [...line.matchAll(/([^:;]+):\s*`([^`]+)`/g)].map((match) => [
      normalizeFieldLabel(match[1] ?? ""),
      match[2]?.trim() ?? "",
    ]),
  );
  const channel = fields.get("canal");
  if (!channel) {
    return null;
  }

  return {
    channel,
    account: fields.get("conta") ?? null,
    chatId: fields.get("chat") ?? null,
    messageId: fields.get("mensagem") ?? null,
    threadRef: fields.get("referencia") ?? null,
    note: fields.get("observacao") ?? null,
  };
}

function normalizeFieldLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
