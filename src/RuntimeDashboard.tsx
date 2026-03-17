import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import {
  archiveAgent,
  createAgent,
  deleteAgent,
  fetchAgent,
  fetchAgentProfiles,
  fetchAgents,
  fetchAgentRuns,
  fetchAgentSessions,
  fetchAgentSkills,
  fetchRuntimeStatus,
  updateAgent,
  type CreateAgentInput,
  type AgentMcpProfileRecord,
  type AgentRecord,
  type AgentRunRecord,
  type AgentSessionRecord,
  type RuntimeStatusSnapshot,
  type SkillSummaryRecord,
} from "./runtimeApi";

interface RuntimeDashboardProps {
  appName: string;
}

type AppRoute =
  | { path: "/" }
  | { path: "/agents" }
  | { path: "/agents/:slug"; slug: string };

export function RuntimeDashboard({ appName }: RuntimeDashboardProps) {
  const [route, setRoute] = useState<AppRoute>(() => readRoute(window.location.pathname));
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatusSnapshot | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [agentsLoaded, setAgentsLoaded] = useState(false);

  const upsertAgent = (nextAgent: AgentRecord) => {
    setAgents((current) => sortAgents([
      ...current.filter((agent) => agent.id !== nextAgent.id),
      nextAgent,
    ]));
  };
  const removeAgent = (agentId: string) => {
    setAgents((current) => current.filter((agent) => agent.id !== agentId));
  };

  useEffect(() => {
    const onPopState = () => {
      setRoute(readRoute(window.location.pathname));
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadStatus = async () => {
      try {
        const next = await fetchRuntimeStatus();
        if (!active) {
          return;
        }
        setRuntimeStatus(next);
        setStatusError(null);
      } catch (error) {
        if (!active) {
          return;
        }
        setStatusError(error instanceof Error ? error.message : "Falha ao carregar status.");
      }
    };

    void loadStatus();
    const timer = window.setInterval(() => {
      void loadStatus();
    }, 15_000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadAgents = async () => {
      try {
        const next = await fetchAgents({ includeDisabled: true });
        if (!active) {
          return;
        }
        setAgents(sortAgents(next));
        setAgentsError(null);
      } catch (error) {
        if (!active) {
          return;
        }
        setAgentsError(error instanceof Error ? error.message : "Falha ao carregar agentes.");
      } finally {
        if (active) {
          setAgentsLoaded(true);
        }
      }
    };

    void loadAgents();
    const timer = window.setInterval(() => {
      void loadAgents();
    }, 30_000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const pageMeta = useMemo(() => {
    switch (route.path) {
      case "/agents":
        return {
          ctaLabel: undefined,
          ctaMuted: false,
          eyebrow: "Agent Registry",
          subtitle: "Catálogo operacional com perfil, MCP e prontidão dos agentes do ACOO.",
          title: "Agents",
        };
      case "/agents/:slug": {
        const agent = agents.find((entry) => entry.slug === route.slug);
        return {
          ctaLabel: "Back to agents",
          ctaMuted: false,
          eyebrow: "Agent Detail",
          subtitle: agent
            ? `${agent.role} · ${agent.mcpProfileId} · ${agent.reasoningEffort}`
            : "Inspeção profunda de configuração, sessões e runs do agente.",
          title: agent?.displayName ?? route.slug,
        };
      }
      case "/":
      default:
        return {
          ctaLabel: "Open agents",
          ctaMuted: false,
          eyebrow: "Operational Core",
          subtitle: "Cockpit do runtime, canais e integrações do ACOO.",
          title: "Control Plane",
        };
    }
  }, [agents, route]);

  const navigate = (nextRoute: AppRoute) => {
    const nextPath = routeToPath(nextRoute);
    if (nextPath === window.location.pathname) {
      return;
    }
    window.history.pushState({}, "", nextPath);
    setRoute(nextRoute);
  };

  const onPrimaryAction = () => {
    if (route.path === "/") {
      navigate({ path: "/agents" });
      return;
    }

    if (route.path === "/agents/:slug") {
      navigate({ path: "/agents" });
    }
  };

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark">ACOO</span>
          <div>
            <strong>{appName}</strong>
            <p>Codex-backed control plane</p>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          <SidebarLink
            active={route.path === "/"}
            label="Home"
            note={runtimeStatus ? `${runtimeStatus.agents.active} agents live` : "Runtime snapshot"}
            onClick={() => navigate({ path: "/" })}
          />
          <SidebarLink
            active={route.path === "/agents" || route.path === "/agents/:slug"}
            label="Agents"
            note={agentsLoaded ? `${agents.length} listed` : "Loading registry"}
            onClick={() => navigate({ path: "/agents" })}
          />
          <SidebarStatic label="Sessions" note="next phase" />
          <SidebarStatic label="Runs" note="next phase" />
          <SidebarStatic label="MCP" note="next phase" />
          <SidebarStatic label="Channels" note="next phase" />
        </nav>

        <div className="sidebar-foot">
          <StatusBadge
            label="telegram"
            tone={runtimeStatus?.telegram.enabled ? "good" : "warn"}
            value={
              runtimeStatus?.telegram.enabled
                ? `${runtimeStatus.telegram.activeChats} active`
                : "disabled"
            }
          />
          <StatusBadge
            label="mcp"
            tone={runtimeStatus && runtimeStatus.issues.length === 0 ? "good" : "warn"}
            value={
              runtimeStatus
                ? `${runtimeStatus.integrations.configured} configured`
                : "loading"
            }
          />
        </div>
      </aside>

      <div className="app-main">
        <header className="page-header">
          <div>
            <p className="eyebrow">{pageMeta.eyebrow}</p>
            <h1>{pageMeta.title}</h1>
            <p className="page-subtitle">{pageMeta.subtitle}</p>
          </div>
          {pageMeta.ctaLabel ? (
            <button
              className={`primary-button${pageMeta.ctaMuted ? " primary-button--muted" : ""}`}
              onClick={onPrimaryAction}
              type="button"
            >
              {pageMeta.ctaLabel}
            </button>
          ) : null}
        </header>

        {route.path === "/" ? (
          <HomeScreen
            agents={agents}
            agentsError={agentsError}
            runtimeStatus={runtimeStatus}
            statusError={statusError}
            onOpenAgents={() => navigate({ path: "/agents" })}
          />
        ) : route.path === "/agents" ? (
          <AgentsScreen
            agents={agents}
            error={agentsError}
            loaded={agentsLoaded}
            onAgentDelete={removeAgent}
            onAgentUpsert={upsertAgent}
            onOpenAgent={(slug) => navigate({ path: "/agents/:slug", slug })}
            telegramEnabled={runtimeStatus?.telegram.enabled ?? false}
          />
        ) : (
          <AgentDetailScreen
            slug={route.slug}
            telegramEnabled={runtimeStatus?.telegram.enabled ?? false}
            onAgentDelete={(agentId) => {
              removeAgent(agentId);
              navigate({ path: "/agents" });
            }}
            onAgentUpsert={upsertAgent}
          />
        )}
      </div>
    </div>
  );
}

function HomeScreen({
  agents,
  agentsError,
  runtimeStatus,
  statusError,
  onOpenAgents,
}: {
  agents: AgentRecord[];
  agentsError: string | null;
  runtimeStatus: RuntimeStatusSnapshot | null;
  statusError: string | null;
  onOpenAgents: () => void;
}) {
  const issues = runtimeStatus?.issues ?? [];
  const advisories = runtimeStatus?.advisories ?? [];
  const topAgents = agents.filter((agent) => agent.status === "active").slice(0, 3);

  return (
    <main className="page-body">
      <section className="home-hero">
        <article className="hero-panel hero-panel--primary">
          <p className="eyebrow">Runtime Snapshot</p>
          <h2>
            {statusError
              ? "API offline"
              : runtimeStatus
                ? runtimeStatus.issues.length === 0
                  ? "ACOO operável"
                  : "ACOO degradado"
                : "Carregando runtime"}
          </h2>
          <p className="hero-copy">
            {statusError
              ? statusError
              : runtimeStatus
                ? `CLI ${runtimeStatus.cli.authenticated ? "autenticada" : "sem auth"}, ${runtimeStatus.integrations.configured} integrações MCP configuradas e ${runtimeStatus.telegram.activeChats} chat(s) ativos no Telegram.`
                : "Coletando snapshot do runtime local."}
          </p>
          <div className="hero-actions">
            <button className="primary-button" onClick={onOpenAgents} type="button">
              Open agents
            </button>
          </div>
        </article>

        <div className="snapshot-grid">
          <SnapshotCard
            label="Codex CLI"
            tone={runtimeStatus?.cli.authenticated ? "good" : "warn"}
            value={runtimeStatus?.cli.loginStatus ?? "loading"}
          />
          <SnapshotCard
            label="Telegram"
            tone={runtimeStatus?.telegram.enabled ? "good" : "warn"}
            value={
              runtimeStatus
                ? runtimeStatus.telegram.enabled
                  ? `${runtimeStatus.telegram.activeChats}/${runtimeStatus.telegram.totalChats} chats`
                  : "disabled"
                : "loading"
            }
          />
          <SnapshotCard
            label="MCP"
            tone={runtimeStatus && runtimeStatus.integrations.managedRuntimeHealthy.length > 0 ? "good" : "warn"}
            value={
              runtimeStatus
                ? `${runtimeStatus.integrations.configured} configured`
                : "loading"
            }
          />
          <SnapshotCard
            label="Agents"
            tone={agentsError ? "warn" : "good"}
            value={agentsError ? "registry issue" : `${agents.length} listed`}
          />
        </div>
      </section>

      <section className="readiness-strip">
        <StatusListCard
          items={issues}
          title="Issues"
          emptyLabel="No blocking issues"
          tone="danger"
        />
        <StatusListCard
          items={advisories}
          title="Advisories"
          emptyLabel="No advisories"
          tone="warn"
        />
      </section>

      <section className="home-grid">
        <section className="surface-card">
          <div className="section-head">
            <div>
              <p className="section-kicker">Agents</p>
              <h3>Operational roster</h3>
            </div>
            <button className="ghost-button" onClick={onOpenAgents} type="button">
              Open list
            </button>
          </div>

          {agentsError ? (
            <InlineState message={agentsError} tone="warn" />
          ) : topAgents.length === 0 ? (
            <InlineState message="Nenhum agente cadastrado." tone="warn" />
          ) : (
            <div className="agent-preview-list">
              {topAgents.map((agent) => (
                <article className="agent-preview-card" key={agent.id}>
                  <div className="agent-preview-top">
                    <div>
                      <strong>{agent.displayName}</strong>
                      <p>{agent.slug}</p>
                    </div>
                    <StatusPill tone={agent.status === "active" ? "good" : "warn"} value={agent.status} />
                  </div>
                  <p className="agent-preview-copy">{agent.description}</p>
                  <dl className="agent-preview-meta">
                    <div>
                      <dt>role</dt>
                      <dd>{agent.role}</dd>
                    </div>
                    <div>
                      <dt>profile</dt>
                      <dd>{agent.mcpProfileId}</dd>
                    </div>
                    <div>
                      <dt>skills</dt>
                      <dd>{agent.skillIds.length}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="surface-card">
          <div className="section-head">
            <div>
              <p className="section-kicker">Channels</p>
              <h3>Live channels</h3>
            </div>
          </div>
          <div className="channel-stack">
            <ChannelCard
              label="CLI"
              summary={
                runtimeStatus
                  ? formatDefaultAgentSummary(runtimeStatus)
                  : "loading"
              }
              tone={runtimeStatus ? resolveDefaultAgentTone(runtimeStatus) : "good"}
            />
            <ChannelCard
              label="Telegram"
              summary={
                runtimeStatus
                  ? runtimeStatus.telegram.enabled
                    ? `${runtimeStatus.telegram.botUsername ?? "bot"} / ${runtimeStatus.telegram.activeChats} active`
                    : "disabled"
                  : "loading"
              }
              tone={runtimeStatus?.telegram.enabled ? "good" : "warn"}
            />
          </div>
        </section>
      </section>
    </main>
  );
}

function AgentsScreen({
  agents,
  error,
  loaded,
  onAgentDelete,
  onAgentUpsert,
  onOpenAgent,
  telegramEnabled,
}: {
  agents: AgentRecord[];
  error: string | null;
  loaded: boolean;
  onAgentDelete: (agentId: string) => void;
  onAgentUpsert: (agent: AgentRecord) => void;
  onOpenAgent: (slug: string) => void;
  telegramEnabled: boolean;
}) {
  const [profiles, setProfiles] = useState<AgentMcpProfileRecord[]>([]);
  const [skills, setSkills] = useState<SkillSummaryRecord[]>([]);
  const [createDraft, setCreateDraft] = useState<AgentEditorDraft | null>(null);
  const [savingCreate, setSavingCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [archivingSlug, setArchivingSlug] = useState<string | null>(null);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const [resourcesError, setResourcesError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadResources = async () => {
      try {
        const [nextProfiles, nextSkills] = await Promise.all([
          fetchAgentProfiles(),
          fetchAgentSkills(),
        ]);
        if (!active) {
          return;
        }
        setProfiles(nextProfiles);
        setSkills(nextSkills);
        setResourcesError(null);
      } catch (resourceError) {
        if (!active) {
          return;
        }
        setResourcesError(resourceError instanceof Error ? resourceError.message : "Falha ao carregar recursos.");
      }
    };

    void loadResources();
    return () => {
      active = false;
    };
  }, []);

  const openCreateDrawer = () => {
    setCreateError(null);
    setCreateDraft(createDefaultAgentDraft(profiles));
  };

  const saveCreate = async () => {
    if (!createDraft) {
      return;
    }

    if (!createDraft.mcpProfileId) {
      setCreateError("Selecione um MCP profile para criar o agente.");
      return;
    }

    setSavingCreate(true);
    setCreateError(null);
    try {
      const created = await createAgent(toCreateAgentInput(createDraft));
      onAgentUpsert(created);
      setCreateDraft(null);
      onOpenAgent(created.slug);
    } catch (createFailure) {
      setCreateError(createFailure instanceof Error ? createFailure.message : "Falha ao criar agente.");
    } finally {
      setSavingCreate(false);
    }
  };

  const archiveFromList = async (agent: AgentRecord) => {
    const confirmed = window.confirm(
      `Arquivar ${agent.displayName} (${agent.slug})? Isso remove o agente da operação ativa no Telegram sem apagar o histórico do registry.`,
    );
    if (!confirmed) {
      return;
    }

    setArchivingSlug(agent.slug);
    try {
      const updated = await archiveAgent(agent.slug);
      onAgentUpsert(updated);
    } catch (archiveFailure) {
      setResourcesError(archiveFailure instanceof Error ? archiveFailure.message : "Falha ao arquivar agente.");
    } finally {
      setArchivingSlug(null);
    }
  };

  const activeCount = agents.filter((agent) => agent.status === "active").length;
  const inactiveCount = agents.length - activeCount;

  const deleteFromList = async (agent: AgentRecord) => {
    const confirmed = window.confirm(
      `Deletar permanentemente ${agent.displayName} (${agent.slug})? Isso remove o agente e apaga sessões/runs vinculados no banco.`,
    );
    if (!confirmed) {
      return;
    }

    setDeletingSlug(agent.slug);
    try {
      const deleted = await deleteAgent(agent.slug);
      onAgentDelete(deleted.id);
    } catch (deleteFailure) {
      setResourcesError(deleteFailure instanceof Error ? deleteFailure.message : "Falha ao deletar agente.");
    } finally {
      setDeletingSlug(null);
    }
  };

  return (
    <main className="page-body">
      <section className="surface-card">
        <div className="section-head">
          <div>
            <p className="section-kicker">Registry</p>
            <h3>Agent catalog</h3>
          </div>
          <div className="filters-inline">
            <span className="filter-chip">{`${activeCount} active`}</span>
            <span className="filter-chip">{`${inactiveCount} inactive`}</span>
            <button className="primary-button" onClick={openCreateDrawer} type="button">
              Add agent
            </button>
          </div>
        </div>
        <p className="registry-hint">
          Operability no Telegram segue o contrato do backend: apenas agentes <code className="mono">active</code> aparecem em <code className="mono">/agents</code> e aceitam troca via <code className="mono">/&lt;slug&gt;</code>. <code className="mono">archived</code> pode ser removido de forma permanente com <code className="mono">Delete</code>.
        </p>

        {resourcesError ? <InlineState message={resourcesError} tone="warn" /> : null}

        {error ? (
          <InlineState message={error} tone="warn" />
        ) : !loaded ? (
          <AgentsTableSkeleton />
        ) : agents.length === 0 ? (
          <InlineState message="Nenhum agente cadastrado." tone="warn" />
        ) : (
          <div className="agents-table-wrap">
            <table className="agents-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Role</th>
                  <th>Runtime</th>
                  <th>MCP</th>
                  <th>Telegram</th>
                  <th>Skills</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr key={agent.id}>
                    <td>
                      <button
                        className="table-link"
                        onClick={() => onOpenAgent(agent.slug)}
                        type="button"
                      >
                        <div className="table-primary">
                          <strong>{agent.displayName}</strong>
                          <span>{agent.slug}</span>
                        </div>
                      </button>
                    </td>
                    <td>{agent.role}</td>
                    <td>{`${agent.model ?? "default"} / ${agent.reasoningEffort}`}</td>
                    <td>{agent.mcpProfileId}</td>
                    <td>
                      <div className="table-cell-stack">
                        <code className="mono">{agent.usability.telegram.command}</code>
                        <span className="table-secondary">
                          {telegramAvailabilitySummary(agent, telegramEnabled)}
                        </span>
                      </div>
                    </td>
                    <td>{agent.skillIds.length}</td>
                    <td>
                      <StatusPill
                        tone={agent.status === "active" ? "good" : "warn"}
                        value={agent.status}
                      />
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="ghost-button"
                          onClick={() => onOpenAgent(agent.slug)}
                          type="button"
                        >
                          Edit
                        </button>
                        <button
                          className="ghost-button ghost-button--danger"
                          disabled={archivingSlug === agent.slug || deletingSlug === agent.slug}
                          onClick={() =>
                            agent.status === "archived" ? deleteFromList(agent) : archiveFromList(agent)}
                          type="button"
                        >
                          {archivingSlug === agent.slug
                            ? "Archiving..."
                            : deletingSlug === agent.slug
                              ? "Deleting..."
                              : agent.status === "archived"
                                ? "Delete"
                                : "Archive"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {createDraft ? (
        <AgentEditorDrawer
          draft={createDraft}
          error={createError}
          mode="create"
          profiles={profiles}
          saving={savingCreate}
          setDraft={setCreateDraft}
          skills={skills}
          title="Create agent"
          onClose={() => setCreateDraft(null)}
          onSubmit={saveCreate}
        />
      ) : null}
    </main>
  );
}

function AgentDetailScreen({
  slug,
  telegramEnabled,
  onAgentDelete,
  onAgentUpsert,
}: {
  slug: string;
  telegramEnabled: boolean;
  onAgentDelete: (agentId: string) => void;
  onAgentUpsert: (agent: AgentRecord) => void;
}) {
  const [agent, setAgent] = useState<AgentRecord | null>(null);
  const [profiles, setProfiles] = useState<AgentMcpProfileRecord[]>([]);
  const [skills, setSkills] = useState<SkillSummaryRecord[]>([]);
  const [sessions, setSessions] = useState<AgentSessionRecord[]>([]);
  const [runs, setRuns] = useState<AgentRunRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingOverview, setEditingOverview] = useState(false);
  const [savingOverview, setSavingOverview] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draft, setDraft] = useState<AgentEditorDraft | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;

    const loadDetail = async () => {
      setLoaded(false);
      try {
        const nextAgent = await fetchAgent(slug);
        const [nextProfiles, nextSkills, nextSessions, nextRuns] = await Promise.all([
          fetchAgentProfiles(),
          fetchAgentSkills(),
          fetchAgentSessions(nextAgent.id),
          fetchAgentRuns(nextAgent.id),
        ]);

        if (!active) {
          return;
        }

        setAgent(nextAgent);
        setProfiles(nextProfiles);
        setSkills(nextSkills);
        setSessions(nextSessions);
        setRuns(nextRuns);
        setDraft(toAgentEditorDraft(nextAgent));
        setError(null);
      } catch (loadError) {
        if (!active) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "Falha ao carregar agente.");
      } finally {
        if (active) {
          setLoaded(true);
        }
      }
    };

    void loadDetail();
    return () => {
      active = false;
    };
  }, [slug]);

  const profile = profiles.find((entry) => entry.id === agent?.mcpProfileId) ?? null;
  const boundSkills = skills.filter((skill) => agent?.skillIds.includes(skill.id));

  const saveOverview = async () => {
    if (!agent || !draft) {
      return;
    }

    setSavingOverview(true);
    setSaveError(null);
    try {
      const updated = await updateAgent(agent.slug, toUpdateAgentInput(draft));
      setAgent(updated);
      setDraft(toAgentEditorDraft(updated));
      onAgentUpsert(updated);
      setEditingOverview(false);
    } catch (updateError) {
      setSaveError(updateError instanceof Error ? updateError.message : "Falha ao salvar agente.");
    } finally {
      setSavingOverview(false);
    }
  };

  const archiveCurrentAgent = async () => {
    if (!agent) {
      return;
    }

    const confirmed = window.confirm(
      `Arquivar ${agent.displayName} (${agent.slug})? Isso remove o agente da operação ativa no Telegram sem apagar o histórico do registry.`,
    );
    if (!confirmed) {
      return;
    }

    setArchiving(true);
    setSaveError(null);
    try {
      const updated = await archiveAgent(agent.slug);
      setAgent(updated);
      setDraft(toAgentEditorDraft(updated));
      onAgentUpsert(updated);
      setEditingOverview(false);
    } catch (archiveError) {
      setSaveError(archiveError instanceof Error ? archiveError.message : "Falha ao arquivar agente.");
    } finally {
      setArchiving(false);
    }
  };

  const deleteCurrentAgent = async () => {
    if (!agent) {
      return;
    }

    const confirmed = window.confirm(
      `Deletar permanentemente ${agent.displayName} (${agent.slug})? Isso remove o agente do registry, apaga sessões/runs vinculados no banco e reatribui chats do Telegram para outro agente ativo quando necessário.`,
    );
    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setSaveError(null);
    try {
      const deleted = await deleteAgent(agent.slug);
      onAgentDelete(deleted.id);
    } catch (deleteError) {
      setSaveError(deleteError instanceof Error ? deleteError.message : "Falha ao deletar agente.");
    } finally {
      setDeleting(false);
    }
  };

  if (!loaded) {
    return (
      <main className="page-body">
        <section className="surface-card">
          <div className="detail-skeleton-grid">
            <div className="detail-skeleton detail-skeleton--hero" />
            <div className="detail-skeleton" />
            <div className="detail-skeleton" />
            <div className="detail-skeleton" />
          </div>
        </section>
      </main>
    );
  }

  if (error || !agent) {
    return (
      <main className="page-body">
        <section className="surface-card">
          <InlineState message={error ?? "Agente não encontrado."} tone="warn" />
        </section>
      </main>
    );
  }

  return (
    <main className="page-body">
      <section className="detail-hero">
        <article className="surface-card surface-card--hero">
          <div className="section-head">
            <div>
              <p className="section-kicker">Overview</p>
              <h3>{agent.displayName}</h3>
            </div>
            <StatusPill tone={agent.status === "active" ? "good" : "warn"} value={agent.status} />
          </div>
          <p className="hero-copy">{agent.description}</p>
          <div className="detail-metrics">
            <Metric label="slug" value={agent.slug} />
            <Metric label="role" value={agent.role} />
            <Metric label="runtime" value={`${agent.model ?? "default"} / ${agent.reasoningEffort}`} />
            <Metric label="mcp" value={agent.mcpProfileId} />
          </div>
        </article>

        <article className="surface-card surface-card--hero">
          <div className="section-head">
            <div>
              <p className="section-kicker">Sessions</p>
              <h3>Recent context</h3>
            </div>
            <div className="button-row">
              <button className="ghost-button" onClick={() => setEditingOverview(true)} type="button">
                Edit agent
              </button>
              <button
                className="ghost-button ghost-button--danger"
                disabled={agent.status === "archived" || archiving}
                onClick={archiveCurrentAgent}
                type="button"
              >
                {archiving ? "Archiving..." : "Archive"}
              </button>
              <button
                className="ghost-button ghost-button--danger"
                disabled={deleting}
                onClick={deleteCurrentAgent}
                type="button"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
          {sessions.length === 0 ? (
            <p className="empty-copy">Nenhuma sessão vinculada a este agente ainda.</p>
          ) : (
            <div className="compact-stack">
              {sessions.slice(0, 2).map((session) => (
                <CompactRecord
                  key={session.id}
                  kicker={`${session.channel} / ${session.mode}`}
                  title={session.title ?? session.channelThreadId}
                  subtitle={formatDate(session.lastUsedAt)}
                  tone={session.status === "active" ? "good" : "warn"}
                />
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="detail-grid">
        <article className="surface-card">
          <div className="section-head">
            <div>
              <p className="section-kicker">Prompt</p>
              <h3>Prompt source</h3>
            </div>
          </div>
          <dl className="key-value-list">
            <div>
              <dt>template</dt>
              <dd>{agent.promptTemplatePath ?? "inline only"}</dd>
            </div>
            <div>
              <dt>inline</dt>
              <dd>{agent.promptInline ? "configured" : "none"}</dd>
            </div>
          </dl>
        </article>

        <article className="surface-card">
          <div className="section-head">
            <div>
              <p className="section-kicker">Skills</p>
              <h3>Bound skills</h3>
            </div>
            <StatusPill tone="good" value={`${boundSkills.length}`} />
          </div>
          {boundSkills.length === 0 ? (
            <p className="empty-copy">Nenhuma skill vinculada.</p>
          ) : (
            <div className="tag-stack">
              {boundSkills.map((skill) => (
                <span className="skill-tag" key={skill.id}>
                  {skill.id}
                </span>
              ))}
            </div>
          )}
        </article>

        <article className="surface-card">
          <div className="section-head">
            <div>
              <p className="section-kicker">MCP</p>
              <h3>Execution profile</h3>
            </div>
          </div>
          {profile ? (
            <div className="profile-block">
              <p className="profile-name">{profile.name}</p>
              <p className="profile-copy">{profile.description}</p>
              <ProfileLine label="required" values={profile.required} />
              <ProfileLine label="optional" values={profile.optional} />
              <ProfileLine label="blocked" values={profile.blocked} />
            </div>
          ) : (
            <p className="empty-copy">Perfil MCP não encontrado.</p>
          )}
        </article>

        <article className="surface-card telegram-card">
          <div className="section-head">
            <div>
              <p className="section-kicker">Telegram</p>
              <h3>Operability</h3>
            </div>
            <StatusPill
              tone={telegramEnabled && agent.usability.telegram.operable ? "good" : "warn"}
              value={telegramEnabled && agent.usability.telegram.operable ? "operable" : "restricted"}
            />
          </div>
          <div className="profile-block">
            <div className="profile-line">
              <strong>command</strong>
              <span>
                <code className="mono">{agent.usability.telegram.command}</code>
              </span>
            </div>
            <div className="profile-line">
              <strong>channel</strong>
              <span>{telegramEnabled ? "Telegram enabled in runtime" : "Telegram disabled in runtime"}</span>
            </div>
            <div className="profile-line">
              <strong>backend gate</strong>
              <span>{telegramAvailabilitySummary(agent, telegramEnabled)}</span>
            </div>
            <ul className="telegram-steps">
              <li>Use `/agents` para ver apenas agentes oficialmente ativos.</li>
              <li>Troque para este agente enviando <code className="mono">{agent.usability.telegram.command}</code> no chat quando ele estiver `active`.</li>
              <li>Agente `disabled` ou `archived` permanece cadastrado, mas a troca no Telegram é bloqueada pelo backend.</li>
            </ul>
          </div>
        </article>
      </section>

      <section className="detail-grid detail-grid--wide">
        <article className="surface-card">
          <div className="section-head">
            <div>
              <p className="section-kicker">Sessions</p>
              <h3>Recent sessions</h3>
            </div>
          </div>
          {sessions.length === 0 ? (
            <p className="empty-copy">Nenhuma sessão registrada.</p>
          ) : (
            <div className="record-stack">
              {sessions.map((session) => (
                <CompactRecord
                  key={session.id}
                  kicker={`${session.channel} / ${session.mode}`}
                  title={session.title ?? session.channelThreadId}
                  subtitle={`${formatDate(session.lastUsedAt)} · ${session.status}`}
                  tone={session.status === "active" ? "good" : "warn"}
                />
              ))}
            </div>
          )}
        </article>

        <article className="surface-card">
          <div className="section-head">
            <div>
              <p className="section-kicker">Runs</p>
              <h3>Recent executions</h3>
            </div>
          </div>
          {runs.length === 0 ? (
            <p className="empty-copy">Nenhuma execução registrada.</p>
          ) : (
            <div className="record-stack">
              {runs.map((run) => (
                <CompactRecord
                  key={run.id}
                  kicker={`${run.channel} / ${run.status}`}
                  title={run.resultSummary}
                  subtitle={formatDate(run.createdAt)}
                  tone={run.status === "completed" ? "good" : run.status === "aborted" ? "warn" : "danger"}
                />
              ))}
            </div>
          )}
        </article>
      </section>

      {editingOverview && draft ? (
        <AgentEditorDrawer
          draft={draft}
          error={saveError}
          mode="edit"
          profiles={profiles}
          saving={savingOverview}
          setDraft={setDraft}
          skills={skills}
          title={agent.displayName}
          onClose={() => setEditingOverview(false)}
          onSubmit={saveOverview}
        />
      ) : null}
    </main>
  );
}

function SidebarLink({
  active,
  label,
  note,
  onClick,
}: {
  active: boolean;
  label: string;
  note: string;
  onClick: () => void;
}) {
  return (
    <button className={`sidebar-link${active ? " sidebar-link--active" : ""}`} onClick={onClick} type="button">
      <strong>{label}</strong>
      <span>{note}</span>
    </button>
  );
}

function SidebarStatic({ label, note }: { label: string; note: string }) {
  return (
    <div className="sidebar-link sidebar-link--static">
      <strong>{label}</strong>
      <span>{note}</span>
    </div>
  );
}

function StatusBadge({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "good" | "warn";
  value: string;
}) {
  return (
    <div className="sidebar-status">
      <strong>{label}</strong>
      <StatusPill tone={tone} value={value} />
    </div>
  );
}

function SnapshotCard({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "good" | "warn" | "danger";
  value: string;
}) {
  return (
    <article className="snapshot-card">
      <StatusPill tone={tone} value={label} />
      <strong>{value}</strong>
    </article>
  );
}

function StatusListCard({
  emptyLabel,
  items,
  title,
  tone,
}: {
  emptyLabel: string;
  items: string[];
  title: string;
  tone: "warn" | "danger";
}) {
  return (
    <article className="surface-card surface-card--tight">
      <div className="section-head">
        <div>
          <p className="section-kicker">{title}</p>
          <h3>{title}</h3>
        </div>
        <StatusPill tone={items.length > 0 ? tone : "good"} value={`${items.length}`} />
      </div>

      {items.length === 0 ? (
        <p className="empty-copy">{emptyLabel}</p>
      ) : (
        <ul className="status-list">
          {items.slice(0, 3).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </article>
  );
}

function ChannelCard({
  label,
  summary,
  tone,
}: {
  label: string;
  summary: string;
  tone: "good" | "warn";
}) {
  return (
    <article className="channel-card">
      <div className="channel-card-top">
        <strong>{label}</strong>
        <StatusPill tone={tone} value={tone === "good" ? "live" : "check"} />
      </div>
      <p>{summary}</p>
    </article>
  );
}

function InlineState({ message, tone }: { message: string; tone: "warn" | "danger" }) {
  return <div className={`inline-state inline-state--${tone}`}>{message}</div>;
}

function StatusPill({
  tone,
  value,
}: {
  tone: "good" | "warn" | "danger";
  value: string;
}) {
  return <span className={`status-pill status-pill--${tone}`}>{value}</span>;
}

function AgentsTableSkeleton() {
  return (
    <div className="agents-table-wrap">
      <table className="agents-table">
        <thead>
          <tr>
            <th>Agent</th>
            <th>Role</th>
            <th>Runtime</th>
            <th>MCP</th>
            <th>Telegram</th>
            <th>Skills</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3].map((row) => (
            <tr key={row}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((cell) => (
                <td key={cell}>
                  <span className="table-skeleton" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompactRecord({
  kicker,
  subtitle,
  title,
  tone,
}: {
  kicker: string;
  subtitle: string;
  title: string;
  tone: "good" | "warn" | "danger";
}) {
  return (
    <article className="compact-record">
      <div className="compact-record-top">
        <p>{kicker}</p>
        <StatusPill tone={tone} value={tone === "good" ? "ok" : tone === "warn" ? "check" : "fail"} />
      </div>
      <strong>{title}</strong>
      <span>{subtitle}</span>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function ProfileLine({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="profile-line">
      <strong>{label}</strong>
      <span>{values.length > 0 ? values.join(", ") : "-"}</span>
    </div>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="drawer-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function AgentEditorDrawer({
  draft,
  error,
  mode,
  profiles,
  saving,
  setDraft,
  skills,
  title,
  onClose,
  onSubmit,
}: {
  draft: AgentEditorDraft;
  error: string | null;
  mode: "create" | "edit";
  profiles: AgentMcpProfileRecord[];
  saving: boolean;
  setDraft: Dispatch<SetStateAction<AgentEditorDraft | null>>;
  skills: SkillSummaryRecord[];
  title: string;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const toggleSkill = (skillId: string) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }
      const hasSkill = current.skillIds.includes(skillId);
      return {
        ...current,
        skillIds: hasSkill
          ? current.skillIds.filter((entry) => entry !== skillId)
          : [...current.skillIds, skillId].sort(),
      };
    });
  };

  return (
    <div className="drawer-backdrop" role="presentation" onClick={onClose}>
      <aside className="drawer-panel" onClick={(event) => event.stopPropagation()}>
        <div className="section-head">
          <div>
            <p className="section-kicker">{mode === "create" ? "Create agent" : "Edit agent"}</p>
            <h3>{title}</h3>
          </div>
          <button className="ghost-button" onClick={onClose} type="button">
            Close
          </button>
        </div>

        <div className="drawer-form">
          {mode === "create" ? (
            <Field label="Slug">
              <input
                value={draft.slug}
                onChange={(event) =>
                  setDraft((current) => (current ? { ...current, slug: event.target.value } : current))}
                placeholder="ops-assistant"
              />
            </Field>
          ) : (
            <label className="drawer-field drawer-field--readonly">
              <span>Slug</span>
              <code className="mono">{draft.slug}</code>
            </label>
          )}

          <Field label="Display name">
            <input
              value={draft.displayName}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, displayName: event.target.value } : current))}
            />
          </Field>

          <Field label="Description">
            <textarea
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, description: event.target.value } : current))}
            />
          </Field>

          <Field label="Role">
            <select
              value={draft.role}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, role: event.target.value } : current))}
            >
              <option value="primary">primary</option>
              <option value="specialist">specialist</option>
              <option value="automation">automation</option>
            </select>
          </Field>

          <Field label="Model">
            <input
              value={draft.model}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, model: event.target.value } : current))}
              placeholder="gpt-5.4"
            />
          </Field>

          <Field label="Reasoning effort">
            <select
              value={draft.reasoningEffort}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, reasoningEffort: event.target.value } : current))}
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="xhigh">xhigh</option>
            </select>
          </Field>

          <Field label="Approval policy">
            <select
              value={draft.approvalPolicy}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, approvalPolicy: event.target.value } : current))}
            >
              <option value="untrusted">untrusted</option>
              <option value="on-failure">on-failure</option>
              <option value="on-request">on-request</option>
              <option value="never">never</option>
            </select>
          </Field>

          <Field label="Sandbox mode">
            <select
              value={draft.sandboxMode}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, sandboxMode: event.target.value } : current))}
            >
              <option value="read-only">read-only</option>
              <option value="workspace-write">workspace-write</option>
              <option value="danger-full-access">danger-full-access</option>
            </select>
          </Field>

          <Field label="MCP profile">
            <select
              value={draft.mcpProfileId}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, mcpProfileId: event.target.value } : current))}
            >
              <option value="">Select a profile</option>
              {profiles.map((profileOption) => (
                <option key={profileOption.id} value={profileOption.id}>
                  {profileOption.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Prompt template path">
            <input
              value={draft.promptTemplatePath}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, promptTemplatePath: event.target.value } : current))}
              placeholder="agents/ops/prompt.md"
            />
          </Field>

          <Field label="Prompt inline">
            <textarea
              value={draft.promptInline}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, promptInline: event.target.value } : current))}
              placeholder="You are an operations specialist..."
            />
          </Field>

          <Field label="Status">
            <select
              value={draft.status}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, status: event.target.value } : current))}
            >
              <option value="active">active</option>
              <option value="disabled">disabled</option>
              <option value="archived">archived</option>
            </select>
          </Field>

          <Field label="Skills">
            <div className="skill-picker">
              {skills.length === 0 ? (
                <p className="empty-copy">Nenhuma skill detectada.</p>
              ) : (
                skills.map((skill) => {
                  const checked = draft.skillIds.includes(skill.id);
                  return (
                    <label
                      className={`skill-option${checked ? " skill-option--checked" : ""}`}
                      key={skill.id}
                    >
                      <input
                        checked={checked}
                        type="checkbox"
                        onChange={() => toggleSkill(skill.id)}
                      />
                      <div>
                        <strong>{skill.id}</strong>
                        <span>{skill.name}</span>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </Field>

          <label className="toggle-row">
            <input
              checked={draft.searchEnabled}
              type="checkbox"
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, searchEnabled: event.target.checked } : current))}
            />
            <span>Search enabled</span>
          </label>
        </div>

        {error ? <InlineState message={error} tone="danger" /> : null}

        <div className="drawer-actions">
          <button className="ghost-button" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="primary-button" disabled={saving} onClick={onSubmit} type="button">
            {saving ? "Saving..." : mode === "create" ? "Create agent" : "Save agent"}
          </button>
        </div>
      </aside>
    </div>
  );
}

function toAgentEditorDraft(agent: AgentRecord): AgentEditorDraft {
  return {
    slug: agent.slug,
    approvalPolicy: agent.approvalPolicy,
    description: agent.description,
    displayName: agent.displayName,
    mcpProfileId: agent.mcpProfileId,
    model: agent.model ?? "",
    promptInline: agent.promptInline ?? "",
    promptTemplatePath: agent.promptTemplatePath ?? "",
    reasoningEffort: agent.reasoningEffort,
    role: agent.role,
    sandboxMode: agent.sandboxMode,
    searchEnabled: agent.searchEnabled,
    skillIds: [...agent.skillIds].sort(),
    status: agent.status,
  };
}

function createDefaultAgentDraft(profiles: AgentMcpProfileRecord[]): AgentEditorDraft {
  return {
    slug: "",
    approvalPolicy: "never",
    description: "",
    displayName: "",
    mcpProfileId: profiles[0]?.id ?? "",
    model: "",
    promptInline: "",
    promptTemplatePath: "",
    reasoningEffort: "medium",
    role: "specialist",
    sandboxMode: "danger-full-access",
    searchEnabled: true,
    skillIds: [],
    status: "active",
  };
}

function toCreateAgentInput(draft: AgentEditorDraft): CreateAgentInput {
  return {
    slug: draft.slug.trim().toLowerCase(),
    approvalPolicy: draft.approvalPolicy,
    description: draft.description.trim(),
    displayName: draft.displayName.trim(),
    mcpProfileId: draft.mcpProfileId.trim(),
    model: normalizeNullable(draft.model),
    promptInline: normalizeNullable(draft.promptInline),
    promptTemplatePath: normalizeNullable(draft.promptTemplatePath),
    reasoningEffort: draft.reasoningEffort,
    role: draft.role,
    sandboxMode: draft.sandboxMode,
    searchEnabled: draft.searchEnabled,
    skillIds: normalizeSkills(draft.skillIds),
    status: draft.status,
  };
}

function toUpdateAgentInput(draft: AgentEditorDraft) {
  return {
    approvalPolicy: draft.approvalPolicy,
    description: draft.description.trim(),
    displayName: draft.displayName.trim(),
    mcpProfileId: draft.mcpProfileId.trim(),
    model: normalizeNullable(draft.model),
    promptInline: normalizeNullable(draft.promptInline),
    promptTemplatePath: normalizeNullable(draft.promptTemplatePath),
    reasoningEffort: draft.reasoningEffort,
    role: draft.role,
    sandboxMode: draft.sandboxMode,
    searchEnabled: draft.searchEnabled,
    skillIds: normalizeSkills(draft.skillIds),
    status: draft.status,
  };
}

function normalizeSkills(skillIds: string[]): string[] {
  return [...new Set(skillIds.map((skillId) => skillId.trim()).filter(Boolean))].sort();
}

function normalizeNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function telegramAvailabilitySummary(agent: AgentRecord, telegramEnabled: boolean): string {
  if (!telegramEnabled) {
    return "channel disabled in runtime";
  }
  if (agent.usability.telegram.operable) {
    return "operable now (/agents and /slug)";
  }
  if (agent.usability.telegram.reasons.length > 0) {
    return `blocked: ${agent.usability.telegram.reasons.join("; ")}`;
  }
  return "not operable";
}

function formatDefaultAgentSummary(runtimeStatus: RuntimeStatusSnapshot): string {
  const runtimeLabel = `${runtimeStatus.defaults.model ?? "default"} / ${runtimeStatus.defaults.reasoningEffort}`;
  const source = runtimeStatus.defaults.agentSlugSource;
  const effective = runtimeStatus.defaults.agentSlugEffective;
  const configured = runtimeStatus.defaults.agentSlugConfigured;

  if (source === "configured") {
    return `/${configured} · ${runtimeLabel}`;
  }

  if (source === "fallback" && effective) {
    return `/${effective} fallback (configured /${configured}) · ${runtimeLabel}`;
  }

  return `no active default (configured /${configured}) · ${runtimeLabel}`;
}

function resolveDefaultAgentTone(
  runtimeStatus: RuntimeStatusSnapshot,
): "good" | "warn" | "danger" {
  switch (runtimeStatus.defaults.agentSlugSource) {
    case "configured":
      return "good";
    case "fallback":
      return "warn";
    case "unresolved":
    default:
      return "danger";
  }
}

function sortAgents(agents: AgentRecord[]): AgentRecord[] {
  return [...agents].sort((left, right) => {
    const leftRank = left.status === "active" ? 0 : left.status === "disabled" ? 1 : 2;
    const rightRank = right.status === "active" ? 0 : right.status === "disabled" ? 1 : 2;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return left.displayName.localeCompare(right.displayName);
  });
}

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function readRoute(pathname: string): AppRoute {
  const agentMatch = pathname.match(/^\/agents\/([^/]+)$/);
  if (agentMatch) {
    return {
      path: "/agents/:slug",
      slug: decodeURIComponent(agentMatch[1]),
    };
  }

  return pathname === "/agents" ? { path: "/agents" } : { path: "/" };
}

function routeToPath(route: AppRoute): string {
  switch (route.path) {
    case "/agents":
      return "/agents";
    case "/agents/:slug":
      return `/agents/${encodeURIComponent(route.slug)}`;
    case "/":
    default:
      return "/";
  }
}

interface AgentEditorDraft {
  slug: string;
  approvalPolicy: string;
  description: string;
  displayName: string;
  mcpProfileId: string;
  model: string;
  promptInline: string;
  promptTemplatePath: string;
  reasoningEffort: string;
  role: string;
  sandboxMode: string;
  searchEnabled: boolean;
  skillIds: string[];
  status: string;
}
