import { useEffect, useMemo, useState } from "react";
import {
  fetchAgents,
  fetchRuntimeStatus,
  type AgentRecord,
  type RuntimeStatusSnapshot,
} from "./runtimeApi";
import {
  SidebarLink,
  SidebarStatic,
  StatusBadge,
} from "./runtimeDashboard/components";
import { sortAgents } from "./runtimeDashboard/formatters";
import { AgentDetailScreen } from "./runtimeDashboard/screens/AgentDetailScreen";
import { AgentsScreen } from "./runtimeDashboard/screens/AgentsScreen";
import { ChatScreen } from "./runtimeDashboard/screens/ChatScreen";
import { HomeScreen } from "./runtimeDashboard/screens/HomeScreen";

interface RuntimeDashboardProps {
  appName: string;
}

type AppRoute =
  | { path: "/" }
  | { path: "/chat" }
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
      case "/chat":
        return {
          ctaLabel: undefined,
          ctaMuted: false,
          eyebrow: "Canal Web",
          subtitle: "Sessões de chat do canal web. As threads operacionais seguem canônicas em operations/threads.",
          title: "Sessões Web",
        };
      case "/agents":
        return {
          ctaLabel: undefined,
          ctaMuted: false,
          eyebrow: "Cadastro de Agentes",
          subtitle: "Cadastre, ajuste e controle quem está operável em cada canal.",
          title: "Agentes",
        };
      case "/agents/:slug": {
        const agent = agents.find((entry) => entry.slug === route.slug);
        return {
          ctaLabel: "Voltar para catálogo",
          ctaMuted: false,
          eyebrow: "Detalhe do Agente",
          subtitle: agent
            ? `${agent.role} · ${agent.mcpProfileId} · ${agent.reasoningEffort}`
            : "Configuração, operabilidade e histórico de execução do agente.",
          title: agent?.displayName ?? route.slug,
        };
      }
      case "/":
      default:
        return {
          ctaLabel: "Abrir catálogo",
          ctaMuted: false,
          eyebrow: "Centro Operacional",
          subtitle: "Pulso do runtime, risco atual e roteamento dos canais do ACOO.",
          title: "Painel Operacional",
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

  if (route.path === "/chat") {
    return (
      <ChatScreen
        appName={appName}
        onBack={() => navigate({ path: "/" })}
      />
    );
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark">ACOO</span>
          <div>
            <strong>{appName}</strong>
            <p>Operação ancorada na Codex CLI</p>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          <SidebarLink
            active={route.path === "/"}
            label="Início"
            note={runtimeStatus ? `${runtimeStatus.agents.active} agentes ativos` : "Carregando pulso"}
            onClick={() => navigate({ path: "/" })}
          />
          <SidebarLink
            active={false}
            label="Chat"
            note="web v1"
            onClick={() => navigate({ path: "/chat" })}
          />
          <SidebarLink
            active={route.path === "/agents" || route.path === "/agents/:slug"}
            label="Agentes"
            note={agentsLoaded ? `${agents.length} no catálogo` : "Carregando catálogo"}
            onClick={() => navigate({ path: "/agents" })}
          />
          <SidebarStatic label="Sessões" note="em breve" />
          <SidebarStatic label="Execuções" note="em breve" />
          <SidebarStatic label="MCP" note="em breve" />
          <SidebarStatic label="Canais" note="em breve" />
        </nav>

        <div className="sidebar-foot">
          <StatusBadge
            label="telegram"
            tone={runtimeStatus?.telegram.enabled ? "good" : "warn"}
            value={
              runtimeStatus?.telegram.enabled
                ? `${runtimeStatus.telegram.activeChats} ativos`
                : "desabilitado"
            }
          />
          <StatusBadge
            label="mcp"
            tone={runtimeStatus && runtimeStatus.issues.length === 0 ? "good" : "warn"}
            value={
              runtimeStatus
                ? `${runtimeStatus.integrations.configured} configuradas`
                : "carregando"
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

function readRoute(pathname: string): AppRoute {
  if (pathname === "/chat") {
    return { path: "/chat" };
  }
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
    case "/chat":
      return "/chat";
    case "/agents":
      return "/agents";
    case "/agents/:slug":
      return `/agents/${encodeURIComponent(route.slug)}`;
    case "/":
    default:
      return "/";
  }
}
