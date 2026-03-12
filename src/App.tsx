const commandCenter = [
  {
    label: "Core Runtime",
    status: "Estrutura pronta",
    tone: "good",
    summary: "bot, controller, engine, interfaces, llm, memory e skills agora existem no projeto.",
  },
  {
    label: "Codex CLI Auth",
    status: "Host autenticado",
    tone: "good",
    summary: "A CLI local já responde com login via ChatGPT; falta só acoplar o executor real ao provider.",
  },
  {
    label: "Operational MCP",
    status: "Fachada criada",
    tone: "warn",
    summary: "O catálogo de tools existe, mas ainda falta transporte MCP real e registro do servidor `acoo`.",
  },
];

const surfaces = [
  {
    title: "Servidor",
    eyebrow: "Runtime",
    path: "server/",
    tone: "good",
    items: [
      ["bootstrap", "Monta runtime, registry, workspace, skills, memory e interfaces."],
      ["controller", "Centraliza skill routing, contexto operacional e loop do agente."],
      ["engine", "Concentra ToolRegistry e AgentLoop com limite de iterações."],
    ],
  },
  {
    title: "Codex CLI",
    eyebrow: "Auth + Exec",
    path: "~/.codex/config.toml",
    tone: "good",
    items: [
      ["auth", "A CLI já está autenticada no host via conta ChatGPT."],
      ["config", "O app lê `ACOO_CODEX_CONFIG_PATH` e compartilha o config.toml da CLI."],
      ["gap", "O provider ainda monta plano; falta disparar `codex exec` de verdade."],
    ],
  },
  {
    title: "MCP",
    eyebrow: "Tool Surface",
    path: "server/interfaces/mcp/",
    tone: "warn",
    items: [
      ["tools", "Já existem list_fronts, get_thread, append_thread_log, create_task e outros."],
      ["server", "A fachada `OperationalMcpServer` já expõe listagem e chamada de tool."],
      ["gap", "Ainda falta transporte MCP consumível pela Codex CLI."],
    ],
  },
];

const readiness = [
  {
    title: "Implementado",
    tone: "good",
    bullets: [
      "Arquitetura explícita do agente local no diretório `server/`.",
      "Env preparado para CLI, memória conversacional e roots de skills.",
      "Typecheck validado com Node 22 via `mise`.",
    ],
  },
  {
    title: "Pendente",
    tone: "warn",
    bullets: [
      "Executor real da Codex CLI no provider.",
      "Servidor MCP real e registro do `acoo` na CLI.",
      "Modelo estruturado para ligar projeto, frente, thread, task e contato sem heurística.",
    ],
  },
];

const repoZones = [
  {
    title: "Memória Operacional",
    description: "Threads e tasks seguem como fonte de verdade auditável enquanto o domínio estruturado amadurece.",
    accent: "threads/, tasks/",
  },
  {
    title: "Memória Conversacional",
    description: "O histórico do agente fica isolado em `data/conversations.json`, sem misturar conversa com evidência operacional.",
    accent: "data/conversations.json",
  },
  {
    title: "Playbooks",
    description: "O loader lê `agents/` e `~/.codex/skills`, permitindo injeção de skill no runtime sem reescrever o core.",
    accent: "agents/, ~/.codex/skills",
  },
];

function App() {
  const appName = import.meta.env.VITE_APP_NAME || "ACOO";

  return (
    <main className="shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Operational Control Surface</p>
          <h1>{appName}</h1>
          <p className="lede">
            O app inicial deixa de ser placeholder e passa a funcionar como torre
            de controle do core local: servidor, auth da Codex CLI, MCP e gaps
            de execução em blocos separados.
          </p>
        </div>

        <div className="hero-band">
          {commandCenter.map((entry) => (
            <article className="status-band" key={entry.label}>
              <span className={`status-dot status-dot--${entry.tone}`} />
              <div>
                <p className="status-label">{entry.label}</p>
                <strong>{entry.status}</strong>
                <p>{entry.summary}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="surface-grid" aria-label="Runtime surfaces">
        {surfaces.map((surface) => (
          <article className="surface-card" key={surface.title}>
            <div className="surface-head">
              <p className="surface-eyebrow">{surface.eyebrow}</p>
              <span className={`surface-pill surface-pill--${surface.tone}`}>
                {surface.tone === "good" ? "ok" : "pending"}
              </span>
            </div>
            <h2>{surface.title}</h2>
            <p className="surface-path">{surface.path}</p>
            <div className="surface-list">
              {surface.items.map(([label, text]) => (
                <div className="surface-item" key={label}>
                  <p>{label}</p>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="readiness-panel">
        <div className="readiness-copy">
          <p className="eyebrow">Server Readiness</p>
          <h2>Sem virar um form do INSS</h2>
          <p>
            A leitura da home fica dividida em dois eixos: o que já existe no
            core e o que ainda falta para a operação real via Codex CLI + MCP.
          </p>
        </div>

        <div className="readiness-grid">
          {readiness.map((group) => (
            <article className="readiness-card" key={group.title}>
              <div className="surface-head">
                <h3>{group.title}</h3>
                <span className={`surface-pill surface-pill--${group.tone}`}>
                  {group.tone === "good" ? "ready" : "next"}
                </span>
              </div>
              <ul>
                {group.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="zone-strip" aria-label="Repository zones">
        {repoZones.map((zone) => (
          <article className="zone-card" key={zone.title}>
            <p className="zone-accent">{zone.accent}</p>
            <h3>{zone.title}</h3>
            <p>{zone.description}</p>
          </article>
        ))}
      </section>
    </main>
  );
}

export default App;
