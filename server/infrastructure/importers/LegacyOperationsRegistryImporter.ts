import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { TaskWorkflowStatus, ThreadLifecycleStatus } from "@prisma/client";
import { getPrismaClient } from "../../prisma/client.js";

interface LegacyPersonSeed {
  name: string;
  company: string | null;
  contacts: Array<{ name: string; value: string }>;
  notes: string | null;
  relationshipDescription: string | null;
}

interface LegacyProjectSeed {
  slug: string;
  name: string;
  description: string;
  sourceLinks: string[];
  sourcePrimary: string | null;
  stakeholderNames: string[];
  stakeholderRoles: Map<string, string>;
  threadSlugs: string[];
}

interface LegacyThreadLogSeed {
  title: string;
  content: string;
  createdAt: Date;
}

interface LegacyThreadSeed {
  slug: string;
  name: string;
  objective: string;
  personNames: string[];
  channels: Array<{ name: string; value: string }>;
  logs: LegacyThreadLogSeed[];
  status: ThreadLifecycleStatus;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

interface LegacyTaskSeed {
  slug: string;
  name: string;
  objective: string;
  description: string;
  status: TaskWorkflowStatus;
  threadSlug: string | null;
  logItems: Array<{ title: string; content: string; createdAt: Date }>;
  createdAt: Date;
  updatedAt: Date;
  doneAt: Date | null;
  archivedAt: Date | null;
}

export interface LegacyImportResult {
  people: number;
  projects: number;
  tasks: number;
  threads: number;
}

export class LegacyOperationsRegistryImporter {
  private readonly prisma;

  public constructor(private readonly repoRoot: string) {
    this.prisma = getPrismaClient(repoRoot);
  }

  public async import(): Promise<LegacyImportResult> {
    const [peopleSeed, projects, activeThreads, archivedThreads, activeTasks, doneTasks] = await Promise.all([
      this.readPeopleSeed(),
      this.readProjects(),
      this.readThreads("operations/threads", "ativo"),
      this.readThreads("operations/threads-arquivadas", "arquivado"),
      this.readTasks("operations/tasks", "backlog"),
      this.readTasks("operations/tasks-finalizadas", "done"),
    ]);

    const personSeeds = new Map<string, LegacyPersonSeed>();
    for (const person of peopleSeed.values()) {
      personSeeds.set(normalizeKey(person.name), person);
    }

    for (const project of projects) {
      for (const stakeholderName of project.stakeholderNames) {
        this.ensurePersonSeed(personSeeds, stakeholderName);
      }
    }

    const threads = [...activeThreads, ...archivedThreads];
    for (const thread of threads) {
      for (const personName of thread.personNames) {
        this.ensurePersonSeed(personSeeds, personName);
      }
    }

    const projectByThreadSlug = new Map<string, LegacyProjectSeed>();
    for (const project of projects) {
      for (const threadSlug of project.threadSlugs) {
        projectByThreadSlug.set(threadSlug, project);
      }
    }

    const projectIdBySlug = new Map<string, string>();
    const personIdByKey = new Map<string, string>();
    const threadIdBySlug = new Map<string, string>();
    const threadProjectSlugByThreadSlug = new Map<string, string>();

    await this.prisma.$transaction(async (tx) => {
      await tx.taskLog.deleteMany();
      await tx.task.deleteMany();
      await tx.threadLog.deleteMany();
      await tx.threadChannel.deleteMany();
      await tx.threadPerson.deleteMany();
      await tx.thread.deleteMany();
      await tx.projectChannel.deleteMany();
      await tx.projectStakeholder.deleteMany();
      await tx.project.deleteMany();
      await tx.personContact.deleteMany();
      await tx.person.deleteMany();

      for (const person of [...personSeeds.values()].sort((left, right) => left.name.localeCompare(right.name))) {
        const created = await tx.person.create({
          data: {
            company: person.company,
            contacts: {
              create: dedupeNameValues(person.contacts),
            },
            name: person.name,
            notes: person.notes,
            relationshipDescription: person.relationshipDescription,
          },
        });
        personIdByKey.set(normalizeKey(person.name), created.id);
      }

      for (const project of projects.sort((left, right) => left.name.localeCompare(right.name))) {
        const created = await tx.project.create({
          data: {
            channels: {
              create: dedupeNameValues([
                ...project.sourceLinks.map((value) => ({ name: "source", value })),
                ...(project.sourcePrimary ? [{ name: "source_primary", value: project.sourcePrimary }] : []),
              ]),
            },
            description: project.description,
            name: project.name,
            slug: project.slug,
            status: "ativo",
            stakeholders: {
              create: project.stakeholderNames
                .map((name) => {
                  const personId = personIdByKey.get(normalizeKey(name));
                  if (!personId) {
                    return null;
                  }

                  return {
                    personId,
                    role: project.stakeholderRoles.get(normalizeKey(name)) ?? "stakeholder",
                  };
                })
                .filter((item): item is { personId: string; role: string } => item !== null),
            },
          },
        });
        projectIdBySlug.set(project.slug, created.id);
      }

      for (const thread of threads.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())) {
        const linkedProject = projectByThreadSlug.get(thread.slug) ?? inferProjectFromThread(thread, projects);
        const created = await tx.thread.create({
          data: {
            archivedAt: thread.archivedAt,
            channels: {
              create: dedupeNameValues(thread.channels),
            },
            createdAt: thread.createdAt,
            logs: {
              create: thread.logs.map((log) => ({
                authorName: log.title,
                content: log.content,
                createdAt: log.createdAt,
              })),
            },
            name: thread.name,
            objective: thread.objective,
            people: {
              create: thread.personNames
                .map((personName) => {
                  const personId = personIdByKey.get(normalizeKey(personName));
                  if (!personId) {
                    return null;
                  }

                  return { personId };
                })
                .filter((item): item is { personId: string } => item !== null),
            },
            projectId: linkedProject ? projectIdBySlug.get(linkedProject.slug) ?? null : null,
            slug: thread.slug,
            status: thread.status,
            updatedAt: thread.updatedAt,
          },
        });

        threadIdBySlug.set(thread.slug, created.id);
        if (linkedProject) {
          threadProjectSlugByThreadSlug.set(thread.slug, linkedProject.slug);
        }
      }

      const tasks = [...activeTasks, ...doneTasks];
      for (const task of tasks.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())) {
        const projectSlug =
          (task.threadSlug ? threadProjectSlugByThreadSlug.get(task.threadSlug) : undefined) ??
          inferProjectSlugFromTask(task, projects);

        await tx.task.create({
          data: {
            archivedAt: task.archivedAt,
            createdAt: task.createdAt,
            description: task.description,
            doneAt: task.doneAt,
            logs: {
              create: task.logItems.map((item) => ({
                authorName: item.title,
                content: item.content,
                createdAt: item.createdAt,
              })),
            },
            name: task.name,
            objective: task.objective,
            projectId: projectSlug ? projectIdBySlug.get(projectSlug) ?? null : null,
            slug: task.slug,
            status: task.status,
            threadId: task.threadSlug ? threadIdBySlug.get(task.threadSlug) ?? null : null,
            updatedAt: task.updatedAt,
          },
        });
      }
    });

    return {
      people: personSeeds.size,
      projects: projects.length,
      tasks: activeTasks.length + doneTasks.length,
      threads: threads.length,
    };
  }

  private async readPeopleSeed(): Promise<Map<string, LegacyPersonSeed>> {
    const filePath = path.join(this.repoRoot, "operations/people/PESSOAS.md");
    const raw = await readFile(filePath, "utf8");
    const sections = splitSections(raw, "## ");
    const seeds = new Map<string, LegacyPersonSeed>();

    for (const section of sections) {
      const body = section.body.trim();
      const name = getBulletValue(body, "Nome") ?? section.title.trim();
      if (!name || /^nenhuma pessoa/i.test(name)) {
        continue;
      }

      const contacts: Array<{ name: string; value: string }> = [];
      const email = getBulletValue(body, "E-mail");
      if (isConcreteValue(email)) {
        contacts.push({ name: "email", value: email! });
      }

      const whatsapp = getBulletValue(body, "WhatsApp");
      if (isConcreteValue(whatsapp)) {
        contacts.push({ name: "whatsapp", value: whatsapp! });
      }

      seeds.set(normalizeKey(name), {
        company: cleanFieldValue(getBulletValue(body, "Empresa")),
        contacts,
        name,
        notes: cleanFieldValue(getBulletValue(body, "Observacoes relevantes")),
        relationshipDescription: cleanFieldValue(getBulletValue(body, "Papel")),
      });
    }

    return seeds;
  }

  private async readProjects(relativeDir: string = "operations/projects"): Promise<LegacyProjectSeed[]> {
    const dirPath = path.join(this.repoRoot, relativeDir);
    const fileNames = (await readdir(dirPath))
      .filter((fileName) => fileName.endsWith(".md") && fileName !== "PROJETOS.md")
      .sort();

    const items: LegacyProjectSeed[] = [];
    for (const fileName of fileNames) {
      const raw = await readFile(path.join(dirPath, fileName), "utf8");
      const lines = raw.split(/\r?\n/);
      const stakeholderEntries = parseIndentedList(lines, "Stakeholders");
      const stakeholderRoleEntries = parseIndentedList(lines, "Papel de cada stakeholder");
      const sourceEntries = parseIndentedList(lines, "Fontes vinculadas");
      const sourcePrimary = getBulletValue(raw, "Fonte principal");
      const linkedThreadSlugs = sourceEntries
        .map(extractLinkedThreadSlug)
        .filter((value): value is string => value !== null);

      const stakeholderNames = stakeholderEntries
        .map((entry) => splitLead(entry))
        .filter((value): value is string => value !== null);

      const stakeholderRoles = new Map<string, string>();
      for (const entry of stakeholderRoleEntries) {
        const lead = splitLead(entry);
        if (!lead) {
          continue;
        }

        stakeholderRoles.set(normalizeKey(lead), entry);
      }

      items.push({
        description: cleanFieldValue(getBulletValue(raw, "Descricao curta")) ?? "",
        name: extractTitle(raw, "# Projeto:"),
        slug: path.basename(fileName, ".md"),
        sourceLinks: sourceEntries.map(cleanListValue).filter(Boolean),
        sourcePrimary: cleanFieldValue(sourcePrimary),
        stakeholderNames,
        stakeholderRoles,
        threadSlugs: [...new Set(linkedThreadSlugs)],
      });
    }

    return items;
  }

  private async readThreads(
    relativeDir: string,
    status: ThreadLifecycleStatus,
  ): Promise<LegacyThreadSeed[]> {
    const dirPath = path.join(this.repoRoot, relativeDir);
    const fileNames = (await readdir(dirPath))
      .filter((fileName) => fileName.endsWith(".md"))
      .sort();

    const items: LegacyThreadSeed[] = [];
    for (const fileName of fileNames) {
      const raw = await readFile(path.join(dirPath, fileName), "utf8");
      const sections = splitSections(raw, "## ");
      const contextSection = sections.find((section) => normalizeKey(section.title) === "contexto inicial");
      const referencesSection = sections.find(
        (section) => normalizeKey(section.title) === normalizeKey("Referências de Origem"),
      );
      const logs = parseThreadLogs(raw, fileName);
      const createdAt = logs[0]?.createdAt ?? deriveDateFromSlug(path.basename(fileName, ".md"));
      const updatedAt = logs.at(-1)?.createdAt ?? createdAt;

      const personNames = splitPeopleList(getBulletValue(contextSection?.body ?? "", "Pessoas"));
      const channels = dedupeNameValues([
        ...extractContextChannels(contextSection?.body ?? ""),
        ...extractReferenceChannels(referencesSection?.body ?? ""),
      ]);

      items.push({
        archivedAt: status === "arquivado" ? updatedAt : null,
        channels,
        createdAt,
        logs,
        name: extractTitle(raw, "# Thread:"),
        objective: cleanFieldValue(getBulletValue(contextSection?.body ?? "", "Objetivo")) ?? "",
        personNames,
        slug: path.basename(fileName, ".md"),
        status,
        updatedAt,
      });
    }

    return items;
  }

  private async readTasks(relativeDir: string, status: TaskWorkflowStatus): Promise<LegacyTaskSeed[]> {
    const dirPath = path.join(this.repoRoot, relativeDir);
    const fileNames = (await readdir(dirPath))
      .filter((fileName) => fileName.endsWith(".md") && !fileName.startsWith("TAREFAS_"))
      .sort();

    const items: LegacyTaskSeed[] = [];
    for (const fileName of fileNames) {
      const raw = await readFile(path.join(dirPath, fileName), "utf8");
      const sections = splitSections(raw, "## ");
      const sectionMap = new Map(sections.map((section) => [normalizeKey(section.title), section.body.trim()]));
      const createdAt = deriveDateFromSlug(path.basename(fileName, ".md"));
      const updateDates = sections
        .map((section) => extractDateFromHeading(section.title))
        .filter((value): value is Date => value !== null);
      const updatedAt = updateDates.at(-1) ?? createdAt;
      const threadSlug = extractTaskThreadSlug(raw);

      items.push({
        archivedAt: null,
        createdAt,
        description: raw.trim(),
        doneAt: status === "done" ? updatedAt : null,
        logItems: sections
          .filter((section) => section.body.trim().length > 0)
          .map((section) => ({
            content: section.body.trim(),
            createdAt: extractDateFromHeading(section.title) ?? createdAt,
            title: section.title.trim(),
          })),
        name: extractTaskTitle(raw),
        objective:
          cleanFieldValue(sectionMap.get("objective")) ??
          cleanFieldValue(sectionMap.get("objetivo")) ??
          extractTaskTitle(raw),
        slug: path.basename(fileName, ".md"),
        status,
        threadSlug,
        updatedAt,
      });
    }

    return items;
  }

  private ensurePersonSeed(seeds: Map<string, LegacyPersonSeed>, personName: string): void {
    const cleanName = cleanPersonName(personName);
    if (!cleanName || !looksLikePersonName(cleanName)) {
      return;
    }

    const key = normalizeKey(cleanName);
    if (seeds.has(key)) {
      return;
    }

    seeds.set(key, {
      company: null,
      contacts: [],
      name: cleanName,
      notes: null,
      relationshipDescription: null,
    });
  }
}

function extractTitle(raw: string, prefix: string): string {
  const firstLine = raw.split(/\r?\n/, 1)[0] ?? "";
  return firstLine.replace(prefix, "").trim();
}

function extractTaskTitle(raw: string): string {
  const firstLine = raw.split(/\r?\n/, 1)[0] ?? "";
  return firstLine.replace(/^#\s*(Task:|Plano -|Item -)\s*/i, "").trim();
}

function getBulletValue(raw: string, label: string): string | null {
  const matcher = new RegExp(`^-\\s+${escapeRegExp(label)}:\\s+(.+)$`, "im");
  const match = raw.match(matcher);
  return match ? cleanFieldValue(match[1]) : null;
}

function parseIndentedList(lines: string[], label: string): string[] {
  const startIndex = lines.findIndex((line) => line.trim() === `- ${label}:`);
  if (startIndex === -1) {
    return [];
  }

  const values: string[] = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^  - /.test(line)) {
      values.push(line.replace(/^  - /, "").trim());
      continue;
    }

    if (line.trim() === "") {
      continue;
    }

    break;
  }

  return values;
}

function cleanFieldValue(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  let next = value.trim();
  next = next.replace(/^\[([^\]]+)\]\([^)]+\)$/, "$1");
  next = next.replace(/^`(.+)`$/, "$1");
  next = next.replace(/\s+/g, " ").trim();
  if (!next) {
    return null;
  }

  return next;
}

function cleanListValue(value: string): string {
  return cleanFieldValue(value) ?? "";
}

function cleanPersonName(value: string | null | undefined): string | null {
  const clean = cleanFieldValue(value);
  if (!clean) {
    return null;
  }

  return clean.replace(/[.;:,]+$/g, "").trim() || null;
}

function splitLead(value: string): string | null {
  const cleaned = cleanFieldValue(value);
  if (!cleaned) {
    return null;
  }

  const parts = cleaned.split(/\s+-\s+/);
  return cleanFieldValue(parts[0]);
}

function splitPeopleList(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map(cleanPersonName)
    .filter((item): item is string => Boolean(item))
    .filter(looksLikePersonName);
}

function extractContextChannels(raw: string): Array<{ name: string; value: string }> {
  const labels = [
    "Grupo(s)",
    "WhatsApp (contato/nome)",
    "E-mail(s)",
    "Outros canais",
  ] as const;

  return labels
    .map((label) => {
      const value = cleanFieldValue(getBulletValue(raw, label));
      if (!isConcreteValue(value)) {
        return null;
      }

      return {
        name: normalizeChannelLabel(label),
        value: value!,
      };
    })
    .filter((item): item is { name: string; value: string } => item !== null);
}

function extractReferenceChannels(raw: string): Array<{ name: string; value: string }> {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^- /, ""))
    .map((line) => {
      const parts = line
        .split(";")
        .map((item) => cleanFieldValue(item))
        .filter((item): item is string => Boolean(item));

      if (parts.length === 0) {
        return null;
      }

      return {
        name: "source_reference",
        value: parts.join(" | "),
      };
    })
    .filter((item): item is { name: string; value: string } => item !== null);
}

function normalizeChannelLabel(label: string): string {
  const key = normalizeKey(label);
  if (key.includes("grupo")) {
    return "group";
  }
  if (key.includes("whatsapp")) {
    return "whatsapp";
  }
  if (key.includes("mail")) {
    return "email";
  }
  return "other";
}

function parseThreadLogs(raw: string, fileName: string): LegacyThreadLogSeed[] {
  const logsSectionIndex = raw.indexOf("## Logs");
  if (logsSectionIndex === -1) {
    return [];
  }

  const logsRaw = raw.slice(logsSectionIndex);
  const sections = splitSections(logsRaw, "### ");
  return sections.map((section, index) => {
    const [timestamp = "", title = "Log"] = section.title.split("|").map((item) => item.trim());
    const createdAt =
      parseDateTime(timestamp) ??
      shiftDateByMinutes(deriveDateFromSlug(path.basename(fileName, ".md")), index);

    return {
      content: section.body.trim(),
      createdAt,
      title,
    };
  });
}

function extractTaskThreadSlug(raw: string): string | null {
  const match = raw.match(/\[.+?\]\([^)]*operations\/threads\/([^)/]+)\.md\)/i);
  return match?.[1] ?? null;
}

function extractLinkedThreadSlug(value: string): string | null {
  const match = value.match(/\((?:[^)]*\/)?operations\/threads\/([^)/]+)\.md\)/i);
  return match?.[1] ?? null;
}

function splitSections(raw: string, marker: string): Array<{ title: string; body: string }> {
  const escaped = escapeRegExp(marker);
  const regex = new RegExp(`^${escaped}(.+)$`, "gm");
  const matches = [...raw.matchAll(regex)];
  const sections: Array<{ title: string; body: string }> = [];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index ?? raw.length : raw.length;
    sections.push({
      body: raw.slice(start, end).trim(),
      title: match[1].trim(),
    });
  }

  return sections;
}

function deriveDateFromSlug(slug: string): Date {
  const match = slug.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) {
    return new Date("1970-01-01T00:00:00.000Z");
  }

  return new Date(`${match[1]}T12:00:00-03:00`);
}

function parseDateTime(raw: string): Date | null {
  const clean = raw.trim();
  const match = clean.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2}|--)/);
  if (!match) {
    return null;
  }

  const [, datePart, hourPart, minutePart] = match;
  const minutes = minutePart === "--" ? "00" : minutePart;
  return new Date(`${datePart}T${hourPart}:${minutes}:00-03:00`);
}

function extractDateFromHeading(raw: string): Date | null {
  const match = raw.match(/(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}):(\d{2}))?/);
  if (!match) {
    return null;
  }

  const [, datePart, hourPart = "12", minutePart = "00"] = match;
  return new Date(`${datePart}T${hourPart}:${minutePart}:00-03:00`);
}

function inferProjectFromThread(thread: LegacyThreadSeed, projects: LegacyProjectSeed[]): LegacyProjectSeed | null {
  const threadKey = normalizeKey(thread.name);
  return (
    projects.find((project) => threadKey.includes(normalizeKey(project.name))) ??
    projects.find((project) => normalizeKey(thread.slug).includes(normalizeKey(project.slug))) ??
    null
  );
}

function inferProjectSlugFromTask(task: LegacyTaskSeed, projects: LegacyProjectSeed[]): string | null {
  const nameKey = normalizeKey(task.name);
  const byName =
    projects.find((project) => nameKey.startsWith(normalizeKey(project.name))) ??
    projects.find((project) => nameKey.includes(normalizeKey(project.slug)));

  return byName?.slug ?? null;
}

function dedupeNameValues<T extends { name: string; value: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    const name = cleanFieldValue(item.name);
    const value = cleanFieldValue(item.value);
    if (!name || !value) {
      continue;
    }

    const dedupeKey = `${normalizeKey(name)}::${normalizeKey(value)}`;
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    result.push({ ...item, name, value });
  }

  return result;
}

function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function looksLikePersonName(value: string): boolean {
  const clean = cleanFieldValue(value);
  if (!clean) {
    return false;
  }

  if (/^\+?\d/.test(clean)) {
    return true;
  }

  const normalized = normalizeKey(clean);
  const blockedTerms = ["envolvidos", "contatos", "nao aplicavel", "sem grupo", "grupo", "thread", "docs internos"];
  if (blockedTerms.some((term) => normalized.includes(term))) {
    return false;
  }

  const tokens = clean.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) {
    return /^[A-ZÁÉÍÓÚÑÜ][\p{L}.']+$/u.test(tokens[0] ?? "");
  }

  return tokens.every((token) => {
    if (/^(da|de|do|dos|del|la|las|los|e|y|j\.)$/i.test(token)) {
      return true;
    }

    return /^[A-ZÁÉÍÓÚÑÜ+][\p{L}\d.'-]*$/u.test(token);
  });
}

function isConcreteValue(value: string | null | undefined): boolean {
  const clean = cleanFieldValue(value);
  if (!clean) {
    return false;
  }

  const normalized = normalizeKey(clean);
  const placeholders = [
    "nao aplicavel",
    "nao validado",
    "nao consolidado",
    "sem vinculo explicito",
    "validado em origem",
    "endereco exato nao consolidado",
  ];

  return !placeholders.some((term) => normalized.includes(term));
}

function shiftDateByMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
