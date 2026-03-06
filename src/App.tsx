const sections = [
  {
    title: "Threads ativas",
    description: "Histórico operacional corrente e contexto de execução em andamento.",
    path: "threads/",
  },
  {
    title: "Tasks ativas",
    description: "Itens acionáveis que ainda pedem decisão, execução ou acompanhamento.",
    path: "tasks/",
  },
  {
    title: "Arquivados",
    description: "Fechamentos, contexto histórico e material já consolidado.",
    path: "threads-arquivadas/ e tasks-arquivadas/",
  },
];

function App() {
  const appName = import.meta.env.VITE_APP_NAME || "ACOO";

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Operational cockpit</p>
        <h1>{appName}</h1>
        <p className="lede">
          Base operacional com estrutura documental e uma interface React + Vite
          pronta para evoluir.
        </p>
      </section>

      <section className="grid">
        {sections.map((section) => (
          <article className="card" key={section.title}>
            <p className="card-path">{section.path}</p>
            <h2>{section.title}</h2>
            <p>{section.description}</p>
          </article>
        ))}
      </section>
    </main>
  );
}

export default App;
