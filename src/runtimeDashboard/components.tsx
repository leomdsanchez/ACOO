import type { ReactNode } from "react";

export function SidebarLink({
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

export function SidebarStatic({ label, note }: { label: string; note: string }) {
  return (
    <div className="sidebar-link sidebar-link--static">
      <strong>{label}</strong>
      <span>{note}</span>
    </div>
  );
}

export function StatusBadge({
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

export function SnapshotCard({
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

export function StatusListCard({
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

export function ChannelCard({
  label,
  summary,
  tone,
}: {
  label: string;
  summary: string;
  tone: "good" | "warn" | "danger";
}) {
  return (
    <article className="channel-card">
      <div className="channel-card-top">
        <strong>{label}</strong>
        <StatusPill tone={tone} value={tone === "good" ? "ao vivo" : tone === "warn" ? "atencao" : "falha"} />
      </div>
      <p>{summary}</p>
    </article>
  );
}

export function InlineState({ message, tone }: { message: string; tone: "warn" | "danger" }) {
  return <div className={`inline-state inline-state--${tone}`}>{message}</div>;
}

export function StatusPill({
  tone,
  value,
}: {
  tone: "good" | "warn" | "danger";
  value: string;
}) {
  return <span className={`status-pill status-pill--${tone}`}>{value}</span>;
}

export function AgentsTableSkeleton() {
  return (
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
            <th>Estado</th>
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

export function CompactRecord({
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
        <StatusPill tone={tone} value={tone === "good" ? "ok" : tone === "warn" ? "atencao" : "falha"} />
      </div>
      <strong>{title}</strong>
      <span>{subtitle}</span>
    </article>
  );
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export function ProfileLine({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="profile-line">
      <strong>{label}</strong>
      <span>{values.length > 0 ? values.join(", ") : "-"}</span>
    </div>
  );
}

export function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="drawer-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
