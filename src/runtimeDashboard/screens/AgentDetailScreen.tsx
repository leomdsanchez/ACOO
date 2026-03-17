import { useEffect, useState } from "react";
import {
  archiveAgent,
  deleteAgent,
  fetchAgent,
  fetchAgentProfiles,
  fetchAgentRuns,
  fetchAgentSessions,
  fetchAgentSkills,
  updateAgent,
  type AgentMcpProfileRecord,
  type AgentRecord,
  type AgentRunRecord,
  type AgentSessionRecord,
  type SkillSummaryRecord,
} from "../../runtimeApi";
import { AgentEditorDrawer, toAgentEditorDraft, toUpdateAgentInput } from "../agentEditor";
import {
  CompactRecord,
  InlineState,
  Metric,
  ProfileLine,
  StatusPill,
} from "../components";
import {
  formatDate,
  telegramAvailabilitySummary,
} from "../formatters";
import type { AgentEditorDraft } from "../types";

export function AgentDetailScreen({
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
              <p className="section-kicker">Visão Geral</p>
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
              <p className="section-kicker">Operação</p>
              <h3>Contexto recente e ações</h3>
            </div>
            <div className="button-row">
              <button className="ghost-button" onClick={() => setEditingOverview(true)} type="button">
                Editar agente
              </button>
              <button
                className="ghost-button ghost-button--danger"
                disabled={agent.status === "archived" || archiving}
                onClick={archiveCurrentAgent}
                type="button"
              >
                {archiving ? "Arquivando..." : "Arquivar"}
              </button>
              <button
                className="ghost-button ghost-button--danger"
                disabled={deleting}
                onClick={deleteCurrentAgent}
                type="button"
              >
                {deleting ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </div>
          {sessions.length === 0 ? (
            <p className="empty-copy">Sem sessão recente. A próxima execução abre contexto automaticamente.</p>
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
              <h3>Fonte de instrução</h3>
            </div>
          </div>
          <dl className="key-value-list">
            <div>
              <dt>template</dt>
              <dd>{agent.promptTemplatePath ?? "somente inline"}</dd>
            </div>
            <div>
              <dt>inline</dt>
              <dd>{agent.promptInline ? "configurado" : "vazio"}</dd>
            </div>
          </dl>
        </article>

        <article className="surface-card">
          <div className="section-head">
            <div>
              <p className="section-kicker">Skills</p>
              <h3>Skills vinculadas</h3>
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
              <h3>Perfil de execução</h3>
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
              <h3>Roteamento e operabilidade</h3>
            </div>
            <StatusPill
              tone={telegramEnabled && agent.usability.telegram.operable ? "good" : "warn"}
              value={telegramEnabled && agent.usability.telegram.operable ? "operavel" : "restrito"}
            />
          </div>
          <div className="profile-block">
            <div className="profile-line">
              <strong>comando</strong>
              <span>
                <code className="mono">{agent.usability.telegram.command}</code>
              </span>
            </div>
            <div className="profile-line">
              <strong>canal</strong>
              <span>{telegramEnabled ? "Telegram habilitado no runtime" : "Telegram desabilitado no runtime"}</span>
            </div>
            <div className="profile-line">
              <strong>gate backend</strong>
              <span>{telegramAvailabilitySummary(agent, telegramEnabled)}</span>
            </div>
            <ul className="telegram-steps">
              <li>Use <code className="mono">/agents</code> para listar apenas agentes ativos.</li>
              <li>Para trocar, envie <code className="mono">{agent.usability.telegram.command}</code> no chat.</li>
              <li>Agente <code className="mono">disabled</code> ou <code className="mono">archived</code> segue cadastrado, mas sem roteamento no Telegram.</li>
            </ul>
          </div>
        </article>
      </section>

      <section className="detail-grid detail-grid--wide">
        <article className="surface-card">
          <div className="section-head">
            <div>
              <p className="section-kicker">Histórico de Sessões</p>
              <h3>Últimas sessões registradas</h3>
            </div>
          </div>
          {sessions.length === 0 ? (
            <p className="empty-copy">Ainda sem histórico de sessão para este agente.</p>
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
              <p className="section-kicker">Histórico de Execuções</p>
              <h3>Últimas execuções registradas</h3>
            </div>
          </div>
          {runs.length === 0 ? (
            <p className="empty-copy">Ainda sem execuções registradas para este agente.</p>
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
