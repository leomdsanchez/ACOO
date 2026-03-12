const topStats = [
  { label: "runtime", value: "lean core", tone: "good" },
  { label: "codex", value: "chatgpt auth", tone: "good" },
  { label: "mcp", value: "acoo pending", tone: "warn" },
  { label: "skills", value: "agents + ~/.codex", tone: "good" },
];

const panels = [
  {
    title: "Servidor",
    path: "server/",
    tone: "good",
    rows: [
      ["bootstrap", "runtime + status + mcp"],
      ["controller", "prompt, context, skill"],
      ["engine", "codex exec only"],
    ],
  },
  {
    title: "Codex CLI",
    path: "~/.codex/config.toml",
    tone: "good",
    rows: [
      ["auth", "login status real"],
      ["exec", "server:run"],
      ["health", "server:status"],
    ],
  },
  {
    title: "MCP",
    path: "server/interfaces/mcp/",
    tone: "warn",
    rows: [
      ["tools", "threads, tasks, contacts"],
      ["surface", "registry + facade"],
      ["next", "transport real do acoo"],
    ],
  },
];

const rail = [
  "threads/, tasks/",
  "server/context/",
  "agents/, ~/.codex/skills",
  "npm run server:status",
  "npm run server:run",
];

function App() {
  const appName = import.meta.env.VITE_APP_NAME || "ACOO";

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-main">
          <p className="eyebrow">Operational Core</p>
          <h1>{appName}</h1>
          <p className="lede">Servidor, Codex CLI e MCP em uma leitura rápida.</p>
        </div>

        <div className="stats-grid" aria-label="Status overview">
          {topStats.map((item) => (
            <article className="stat-card" key={item.label}>
              <span className={`status-dot status-dot--${item.tone}`} />
              <div>
                <p>{item.label}</p>
                <strong>{item.value}</strong>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel-grid" aria-label="Core surfaces">
        {panels.map((panel) => (
          <article className="panel-card" key={panel.title}>
            <div className="panel-head">
              <h2>{panel.title}</h2>
              <span className={`surface-pill surface-pill--${panel.tone}`}>
                {panel.tone === "good" ? "ok" : "next"}
              </span>
            </div>
            <p className="panel-path">{panel.path}</p>
            <div className="panel-rows">
              {panel.rows.map(([label, value]) => (
                <div className="panel-row" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="chip-rail" aria-label="Operational zones">
        {rail.map((item) => (
          <span className="rail-chip" key={item}>
            {item}
          </span>
        ))}
      </section>
    </main>
  );
}

export default App;
