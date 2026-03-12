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

interface RuntimeDashboardProps {
  appName: string;
}

export function RuntimeDashboard({ appName }: RuntimeDashboardProps) {
  const defaults = readRuntimeProfileDefaults();
  const [profile, setProfile] = useState<RuntimeProfile>(() => loadRuntimeProfile(defaults));

  useEffect(() => {
    window.localStorage.setItem(runtimeProfileStorageKey, JSON.stringify(profile));
  }, [profile]);

  const commandPreview = buildCommandPreview(profile);

  return (
    <main className="shell">
      <Hero appName={appName} profile={profile} />

      <section className="panel-grid" aria-label="Runtime controls">
        <CodexProfileCard
          commandPreview={commandPreview}
          profile={profile}
          setProfile={setProfile}
        />
        <TelegramProfileCard profile={profile} setProfile={setProfile} />
        <RuntimeShapeCard defaults={defaults} resetProfile={() => setProfile(defaults)} />
      </section>

      <section className="chip-rail" aria-label="Operational zones">
        {[
          "threads/, tasks/",
          "gpt-5.4 / effort / sandbox / approval",
          "telegram staged",
          "playwright, notion, stripe",
          "npm run server:status",
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

function Hero({ appName, profile }: { appName: string; profile: RuntimeProfile }) {
  const topStats = [
    { label: "runtime", value: "codex-backed", tone: "good" },
    { label: "model", value: profile.model, tone: "good" },
    { label: "effort", value: profile.reasoningEffort, tone: "good" },
    {
      label: "telegram",
      value: profile.telegramEnabled ? "channel staged" : "not enabled",
      tone: profile.telegramEnabled ? "warn" : "good",
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
}: RuntimeCardProps & { commandPreview: string }) {
  return (
    <article className="panel-card panel-card--form">
      <div className="panel-head">
        <h2>Codex CLI</h2>
        <span className="surface-pill surface-pill--good">defaults</span>
      </div>
      <p className="panel-note">
        Perfil local do app. Ainda nao grava no `.env` nem altera o runtime do server.
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

function TelegramProfileCard({ profile, setProfile }: RuntimeCardProps) {
  return (
    <article className="panel-card panel-card--form">
      <div className="panel-head">
        <h2>Telegram</h2>
        <span
          className={`surface-pill ${profile.telegramEnabled ? "surface-pill--warn" : "surface-pill--good"}`}
        >
          {profile.telegramEnabled ? "staged" : "off"}
        </span>
      </div>
      <p className="panel-note">
        Canal ainda nao implementado. Aqui fica so a prontidao do perfil operacional.
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
          <span>input plan</span>
          <strong>text / voice / document</strong>
        </div>
        <div className="mini-card">
          <span>adapter</span>
          <strong>pending</strong>
        </div>
      </div>
    </article>
  );
}

function RuntimeShapeCard({
  defaults,
  resetProfile,
}: {
  defaults: RuntimeProfile;
  resetProfile: () => void;
}) {
  return (
    <article className="panel-card">
      <div className="panel-head">
        <h2>Runtime</h2>
        <span className="surface-pill surface-pill--good">shape</span>
      </div>
      <div className="panel-rows">
        <div className="panel-row">
          <span>status</span>
          <strong>server:status</strong>
        </div>
        <div className="panel-row">
          <span>mcp</span>
          <strong>playwright / notion / stripe</strong>
        </div>
        <div className="panel-row">
          <span>channels</span>
          <strong>cli active / telegram planned</strong>
        </div>
        <div className="panel-row">
          <span>defaults</span>
          <strong>{`${defaults.model} / ${defaults.reasoningEffort}`}</strong>
        </div>
        <div className="panel-row">
          <span>persistence</span>
          <strong>browser-local preview</strong>
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
