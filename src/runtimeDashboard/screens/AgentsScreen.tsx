import { useEffect, useState } from "react";
import {
  archiveAgent,
  createAgent,
  deleteAgent,
  fetchAgentProfiles,
  fetchAgentSkills,
  type AgentMcpProfileRecord,
  type AgentRecord,
  type SkillSummaryRecord,
} from "../../runtimeApi";
import { AgentEditorDrawer, createDefaultAgentDraft, toCreateAgentInput } from "../agentEditor";
import { AgentsTableSkeleton, InlineState, StatusPill } from "../components";
import { telegramAvailabilitySummary } from "../formatters";
import type { AgentEditorDraft } from "../types";

export function AgentsScreen({
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
            <p className="section-kicker">Cadastro de Agentes</p>
            <h3>Catálogo operacional</h3>
          </div>
          <div className="filters-inline">
            <span className="filter-chip">{`${activeCount} ativos`}</span>
            <span className="filter-chip">{`${inactiveCount} inativos`}</span>
            <button className="primary-button" onClick={openCreateDrawer} type="button">
              Novo agente
            </button>
          </div>
        </div>
        <p className="registry-hint">
          No Telegram, só agentes <code className="mono">active</code> entram em <code className="mono">/agents</code> e aceitam troca via <code className="mono">/&lt;slug&gt;</code>. Use <code className="mono">Arquivar</code> para tirar da operação e manter histórico; use <code className="mono">Excluir</code> para remoção permanente.
        </p>

        {resourcesError ? <InlineState message={resourcesError} tone="warn" /> : null}

        {error ? (
          <InlineState message={error} tone="warn" />
        ) : !loaded ? (
          <AgentsTableSkeleton />
        ) : agents.length === 0 ? (
          <InlineState message="Catálogo vazio. Crie o primeiro agente para iniciar roteamento no Telegram e na CLI." tone="warn" />
        ) : (
          <div className="agents-table-wrap">
            <table className="agents-table">
              <thead>
                <tr>
                  <th>Agente</th>
                  <th>Papel</th>
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
                          Editar
                        </button>
                        <button
                          className="ghost-button ghost-button--danger"
                          disabled={archivingSlug === agent.slug || deletingSlug === agent.slug}
                          onClick={() =>
                            agent.status === "archived" ? deleteFromList(agent) : archiveFromList(agent)}
                          type="button"
                        >
                          {archivingSlug === agent.slug
                            ? "Arquivando..."
                            : deletingSlug === agent.slug
                              ? "Excluindo..."
                              : agent.status === "archived"
                                ? "Excluir"
                                : "Arquivar"}
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
          title="Novo agente"
          onClose={() => setCreateDraft(null)}
          onSubmit={saveCreate}
        />
      ) : null}
    </main>
  );
}
