import type { AgentRecord, RuntimeStatusSnapshot } from "../../runtimeApi";
import {
  ChannelCard,
  InlineState,
  SnapshotCard,
  StatusListCard,
  StatusPill,
} from "../components";
import {
  formatDefaultAgentSummary,
  resolveDefaultAgentTone,
} from "../formatters";

export function HomeScreen({
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
  const playwrightRuntime = runtimeStatus?.integrations.managedRuntimes.find((runtime) => runtime.name === "playwright") ?? null;

  return (
    <main className="page-body">
      <section className="home-hero">
        <article className="hero-panel hero-panel--primary">
          <p className="eyebrow">Pulso Operacional</p>
          <h2>
            {statusError
              ? "API indisponível"
              : runtimeStatus
                ? runtimeStatus.issues.length === 0
                  ? "Operação estável"
                  : "Atenção nos bloqueios"
                : "Atualizando status"}
          </h2>
          <p className="hero-copy">
            {statusError
              ? statusError
              : runtimeStatus
                ? `CLI ${runtimeStatus.cli.authenticated ? "autenticada" : "sem autenticação"}, ${runtimeStatus.integrations.configured} integrações MCP ativas e ${runtimeStatus.telegram.activeChats} chat(s) em andamento no Telegram.`
                : "Coletando estado do runtime local."}
          </p>
          <div className="hero-actions">
            <button className="primary-button" onClick={onOpenAgents} type="button">
              Gerenciar agentes
            </button>
          </div>
        </article>

        <div className="snapshot-grid">
          <SnapshotCard
            label="CLI Codex"
            tone={runtimeStatus?.cli.authenticated ? "good" : "warn"}
            value={runtimeStatus?.cli.loginStatus ?? "carregando"}
          />
          <SnapshotCard
            label="Telegram"
            tone={runtimeStatus?.telegram.enabled ? "good" : "warn"}
            value={
              runtimeStatus
                ? runtimeStatus.telegram.enabled
                  ? `${runtimeStatus.telegram.activeChats}/${runtimeStatus.telegram.totalChats} chats`
                  : "desabilitado"
                : "carregando"
            }
          />
          <SnapshotCard
            label="Integrações MCP"
            tone={runtimeStatus && runtimeStatus.integrations.managedRuntimeHealthy.length > 0 ? "good" : "warn"}
            value={
              runtimeStatus
                ? `${runtimeStatus.integrations.configured} configuradas`
                : "carregando"
            }
          />
          <SnapshotCard
            label="Playwright"
            tone={
              !playwrightRuntime
                ? "warn"
                : playwrightRuntime.healthy
                  ? "good"
                  : playwrightRuntime.severity === "high"
                    ? "danger"
                    : "warn"
            }
            value={
              !playwrightRuntime
                ? "sem runtime"
                : playwrightRuntime.healthy
                  ? "ready"
                  : `${playwrightRuntime.state} ${playwrightRuntime.severity ?? "warn"}`
            }
          />
          <SnapshotCard
            label="Agentes"
            tone={agentsError ? "warn" : "good"}
            value={agentsError ? "falha no registry" : `${agents.length} listados`}
          />
        </div>
      </section>

      <section className="readiness-strip">
        <StatusListCard
          items={issues}
          title="Bloqueios"
          emptyLabel="Sem bloqueios críticos no momento"
          tone="danger"
        />
        <StatusListCard
          items={advisories}
          title="Ajustes Recomendados"
          emptyLabel="Sem ajustes recomendados"
          tone="warn"
        />
      </section>

      <section className="home-grid">
        <section className="surface-card">
          <div className="section-head">
            <div>
              <p className="section-kicker">Agentes em Operação</p>
              <h3>Linha de frente ativa</h3>
            </div>
            <button className="ghost-button" onClick={onOpenAgents} type="button">
              Ver catálogo
            </button>
          </div>

          {agentsError ? (
            <InlineState message={agentsError} tone="warn" />
          ) : topAgents.length === 0 ? (
            <InlineState message="Nenhum agente ativo agora. Ative um agente no catálogo para abrir operação." tone="warn" />
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
              <p className="section-kicker">Canais</p>
              <h3>Roteamento atual</h3>
            </div>
          </div>
          <div className="channel-stack">
            <ChannelCard
              label="CLI"
              summary={
                runtimeStatus
                  ? formatDefaultAgentSummary(runtimeStatus)
                  : "carregando"
              }
              tone={runtimeStatus ? resolveDefaultAgentTone(runtimeStatus) : "good"}
            />
            <ChannelCard
              label="Telegram"
              summary={
                runtimeStatus
                  ? runtimeStatus.telegram.enabled
                    ? `${runtimeStatus.telegram.botUsername ?? "bot"} / ${runtimeStatus.telegram.activeChats} ativos`
                    : "desabilitado"
                  : "carregando"
              }
              tone={runtimeStatus?.telegram.enabled ? "good" : "warn"}
            />
          </div>
        </section>
      </section>
    </main>
  );
}
