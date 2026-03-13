import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  approvalPolicies,
  reasoningEfforts,
  sandboxModes,
  type RuntimeProfile,
} from "../shared/runtimeConfig";
import {
  buildCommandPreview,
  loadRuntimeProfile,
  readRuntimeProfileDefaults,
  runtimeProfileStorageKey,
} from "./runtimeProfileState";
import { fetchRuntimeStatus, type RuntimeStatusSnapshot } from "./runtimeApi";

interface RuntimeDashboardProps {
  appName: string;
}

export function RuntimeDashboard({ appName }: RuntimeDashboardProps) {
  const defaults = readRuntimeProfileDefaults();
  const [profile, setProfile] = useState<RuntimeProfile>(() => loadRuntimeProfile(defaults));
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatusSnapshot | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    window.localStorage.setItem(runtimeProfileStorageKey, JSON.stringify(profile));
  }, [profile]);

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

  const commandPreview = buildCommandPreview(profile);

  return (
    <main className="shell">
      <Hero appName={appName} profile={profile} runtimeStatus={runtimeStatus} />

      <section className="panel-grid" aria-label="Runtime controls">
        <CodexProfileCard
          commandPreview={commandPreview}
          profile={profile}
          setProfile={setProfile}
          runtimeStatus={runtimeStatus}
        />
        <TelegramProfileCard profile={profile} setProfile={setProfile} runtimeStatus={runtimeStatus} />
        <RuntimeShapeCard
          defaults={defaults}
          resetProfile={() => setProfile(defaults)}
          runtimeStatus={runtimeStatus}
          statusError={statusError}
        />
      </section>

      <section className="chip-rail" aria-label="Operational zones">
        {[
          "threads/, tasks/",
          "gpt-5.4 / effort / sandbox / approval",
          "api / telegram / codex",
          "playwright, notion, stripe",
          "npm run server:api",
          "npm run server:run",
        ].map((item) => (
          <span className="rail-chip" key={item}>
            {item}
          </span>
        ))}
      </section>
    </main>
  );
}

function Hero({
  appName,
  profile,
  runtimeStatus,
}: {
  appName: string;
  profile: RuntimeProfile;
  runtimeStatus: RuntimeStatusSnapshot | null;
}) {
  const topStats = [
    {
      label: "runtime",
      value: runtimeStatus ? (runtimeStatus.issues.length === 0 ? "healthy" : "degraded") : "loading",
      tone: runtimeStatus ? (runtimeStatus.issues.length === 0 ? "good" : "warn") : "warn",
    },
    { label: "model", value: runtimeStatus?.defaults.model ?? profile.model, tone: "good" },
    { label: "effort", value: runtimeStatus?.defaults.reasoningEffort ?? profile.reasoningEffort, tone: "good" },
    {
      label: "telegram",
      value: runtimeStatus
        ? runtimeStatus.telegram.enabled
          ? `live / ${runtimeStatus.telegram.activeChats} chat`
          : "disabled"
        : profile.telegramEnabled
          ? "configured"
          : "not enabled",
      tone: runtimeStatus?.telegram.enabled ? "good" : "warn",
    },
  ];

  return (
    <section className="hero">
      <div className="hero-main">
        <p className="eyebrow">Operational Core</p>
        <h1>{appName}</h1>
        <p className="lede">Perfil de execução, integrações e prontidão de canais.</p>
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
  );
}

function CodexProfileCard({
  commandPreview,
  profile,
  setProfile,
  runtimeStatus,
}: RuntimeCardProps & { commandPreview: string; runtimeStatus: RuntimeStatusSnapshot | null }) {
  return (
    <article className="panel-card panel-card--form">
      <div className="panel-head">
        <h2>Codex CLI</h2>
        <span className="surface-pill surface-pill--good">
          {runtimeStatus ? "runtime live" : "draft"}
        </span>
      </div>
      <p className="panel-note">
        Perfil local do app. O snapshot real do runtime aparece abaixo quando a API local responde.
      </p>
      <div className="form-grid">
        <TextField
          label="model"
          value={profile.model}
          onChange={(value) => setProfile((current) => ({ ...current, model: value }))}
        />
        <SelectField
          label="effort"
          value={profile.reasoningEffort}
          options={reasoningEfforts}
          onChange={(value) =>
            setProfile((current) => ({
              ...current,
              reasoningEffort: value as RuntimeProfile["reasoningEffort"],
            }))
          }
        />
        <SelectField
          label="sandbox"
          value={profile.sandboxMode}
          options={sandboxModes}
          onChange={(value) =>
            setProfile((current) => ({
              ...current,
              sandboxMode: value as RuntimeProfile["sandboxMode"],
            }))
          }
        />
        <SelectField
          label="permission"
          value={profile.approvalPolicy}
          options={approvalPolicies}
          onChange={(value) =>
            setProfile((current) => ({
              ...current,
              approvalPolicy: value as RuntimeProfile["approvalPolicy"],
            }))
          }
        />
      </div>
      <div className="command-preview">
        <span>launch</span>
        <code>{commandPreview}</code>
      </div>
    </article>
  );
}

function TelegramProfileCard({
  profile,
  setProfile,
  runtimeStatus,
}: RuntimeCardProps & { runtimeStatus: RuntimeStatusSnapshot | null }) {
  return (
    <article className="panel-card panel-card--form">
      <div className="panel-head">
        <h2>Telegram</h2>
        <span
          className={`surface-pill ${
            runtimeStatus?.telegram.enabled || profile.telegramEnabled
              ? "surface-pill--good"
              : "surface-pill--warn"
          }`}
        >
          {runtimeStatus?.telegram.enabled ? "live" : profile.telegramEnabled ? "configured" : "off"}
        </span>
      </div>
      <p className="panel-note">
        Draft local do canal. O runtime real usa a API e pode estar em estado diferente do browser.
      </p>
      <div className="form-grid">
        <ToggleField
          label="enabled"
          checked={profile.telegramEnabled}
          onChange={(checked) =>
            setProfile((current) => ({
              ...current,
              telegramEnabled: checked,
            }))
          }
        />
        <TextField
          label="bot username"
          placeholder="@acoo_bot"
          value={profile.telegramBotUsername}
          onChange={(value) =>
            setProfile((current) => ({
              ...current,
              telegramBotUsername: value,
            }))
          }
        />
        <NumberField
          label="allowed users"
          value={profile.telegramAllowedUsersCount}
          onChange={(value) =>
            setProfile((current) => ({
              ...current,
              telegramAllowedUsersCount: value,
            }))
          }
        />
        <ToggleField
          label="audio reply"
          checked={profile.telegramAudioReplyDefault}
          onChange={(checked) =>
            setProfile((current) => ({
              ...current,
              telegramAudioReplyDefault: checked,
            }))
          }
        />
      </div>
      <div className="mini-grid">
        <div className="mini-card">
          <span>bot</span>
          <strong>{(runtimeStatus?.telegram.botUsername ?? profile.telegramBotUsername) || "-"}</strong>
        </div>
        <div className="mini-card">
          <span>sessions</span>
          <strong>
            {runtimeStatus
              ? `${runtimeStatus.telegram.activeChats}/${runtimeStatus.telegram.totalChats}`
              : "local only"}
          </strong>
        </div>
      </div>
    </article>
  );
}

function RuntimeShapeCard({
  defaults,
  resetProfile,
  runtimeStatus,
  statusError,
}: {
  defaults: RuntimeProfile;
  resetProfile: () => void;
  runtimeStatus: RuntimeStatusSnapshot | null;
  statusError: string | null;
}) {
  return (
    <article className="panel-card">
      <div className="panel-head">
        <h2>Runtime</h2>
        <span className="surface-pill surface-pill--good">api</span>
      </div>
      <div className="panel-rows">
        <div className="panel-row">
          <span>status</span>
          <strong>{statusError ? "api offline" : runtimeStatus ? "live snapshot" : "loading"}</strong>
        </div>
        <div className="panel-row">
          <span>mcp</span>
          <strong>
            {runtimeStatus
              ? `${runtimeStatus.integrations.configured} configured`
              : "playwright / notion / stripe"}
          </strong>
        </div>
        <div className="panel-row">
          <span>channels</span>
          <strong>
            {runtimeStatus
              ? `cli active / telegram ${runtimeStatus.channels.telegram}`
              : "cli active / telegram loading"}
          </strong>
        </div>
        <div className="panel-row">
          <span>defaults</span>
          <strong>
            {runtimeStatus
              ? `${runtimeStatus.defaults.model ?? defaults.model} / ${runtimeStatus.defaults.reasoningEffort}`
              : `${defaults.model} / ${defaults.reasoningEffort}`}
          </strong>
        </div>
        <div className="panel-row">
          <span>persistence</span>
          <strong>{runtimeStatus ? `${runtimeStatus.agents.active} agents / ${runtimeStatus.agents.sessions} sessions` : "browser-local draft"}</strong>
        </div>
      </div>
      <div className="panel-actions">
        <button type="button" className="ghost-button" onClick={resetProfile}>
          Reset defaults
        </button>
      </div>
    </article>
  );
}

function TextField({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function NumberField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        min={0}
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
      />
    </label>
  );
}

function SelectField({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: readonly string[];
  value: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleField({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="field field--toggle">
      <span>{label}</span>
      <input checked={checked} type="checkbox" onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

interface RuntimeCardProps {
  profile: RuntimeProfile;
  setProfile: Dispatch<SetStateAction<RuntimeProfile>>;
}
