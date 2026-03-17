import type { Dispatch, SetStateAction } from "react";
import type {
  CreateAgentInput,
  UpdateAgentInput,
  AgentMcpProfileRecord,
  AgentRecord,
  SkillSummaryRecord,
} from "../runtimeApi";
import { Field, InlineState } from "./components";
import type { AgentEditorDraft } from "./types";

export function AgentEditorDrawer({
  draft,
  error,
  mode,
  profiles,
  saving,
  setDraft,
  skills,
  title,
  onClose,
  onSubmit,
}: {
  draft: AgentEditorDraft;
  error: string | null;
  mode: "create" | "edit";
  profiles: AgentMcpProfileRecord[];
  saving: boolean;
  setDraft: Dispatch<SetStateAction<AgentEditorDraft | null>>;
  skills: SkillSummaryRecord[];
  title: string;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const toggleSkill = (skillId: string) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }
      const hasSkill = current.skillIds.includes(skillId);
      return {
        ...current,
        skillIds: hasSkill
          ? current.skillIds.filter((entry) => entry !== skillId)
          : [...current.skillIds, skillId].sort(),
      };
    });
  };

  return (
    <div className="drawer-backdrop" role="presentation" onClick={onClose}>
      <aside className="drawer-panel" onClick={(event) => event.stopPropagation()}>
        <div className="section-head">
          <div>
            <p className="section-kicker">{mode === "create" ? "Novo agente" : "Editar agente"}</p>
            <h3>{title}</h3>
          </div>
          <button className="ghost-button" onClick={onClose} type="button">
            Fechar
          </button>
        </div>

        <div className="drawer-form">
          {mode === "create" ? (
            <Field label="Slug">
              <input
                value={draft.slug}
                onChange={(event) =>
                  setDraft((current) => (current ? { ...current, slug: event.target.value } : current))}
                placeholder="ops-assistant"
              />
            </Field>
          ) : (
            <label className="drawer-field drawer-field--readonly">
              <span>Slug</span>
              <code className="mono">{draft.slug}</code>
            </label>
          )}

          <Field label="Display name">
            <input
              value={draft.displayName}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, displayName: event.target.value } : current))}
            />
          </Field>

          <Field label="Description">
            <textarea
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, description: event.target.value } : current))}
            />
          </Field>

          <Field label="Role">
            <select
              value={draft.role}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, role: event.target.value } : current))}
            >
              <option value="primary">primary</option>
              <option value="specialist">specialist</option>
              <option value="automation">automation</option>
            </select>
          </Field>

          <Field label="Model">
            <input
              value={draft.model}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, model: event.target.value } : current))}
              placeholder="gpt-5.4"
            />
          </Field>

          <Field label="Reasoning effort">
            <select
              value={draft.reasoningEffort}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, reasoningEffort: event.target.value } : current))}
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="xhigh">xhigh</option>
            </select>
          </Field>

          <Field label="Approval policy">
            <select
              value={draft.approvalPolicy}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, approvalPolicy: event.target.value } : current))}
            >
              <option value="untrusted">untrusted</option>
              <option value="on-failure">on-failure</option>
              <option value="on-request">on-request</option>
              <option value="never">never</option>
            </select>
          </Field>

          <Field label="Sandbox mode">
            <select
              value={draft.sandboxMode}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, sandboxMode: event.target.value } : current))}
            >
              <option value="read-only">read-only</option>
              <option value="workspace-write">workspace-write</option>
              <option value="danger-full-access">danger-full-access</option>
            </select>
          </Field>

          <Field label="MCP profile">
            <select
              value={draft.mcpProfileId}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, mcpProfileId: event.target.value } : current))}
            >
              <option value="">Select a profile</option>
              {profiles.map((profileOption) => (
                <option key={profileOption.id} value={profileOption.id}>
                  {profileOption.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Prompt template path">
            <input
              value={draft.promptTemplatePath}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, promptTemplatePath: event.target.value } : current))}
              placeholder="agents/ops/prompt.md"
            />
          </Field>

          <Field label="Prompt inline">
            <textarea
              value={draft.promptInline}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, promptInline: event.target.value } : current))}
              placeholder="You are an operations specialist..."
            />
          </Field>

          <Field label="Status">
            <select
              value={draft.status}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, status: event.target.value } : current))}
            >
              <option value="active">active</option>
              <option value="disabled">disabled</option>
              <option value="archived">archived</option>
            </select>
          </Field>

          <Field label="Skills">
            <div className="skill-picker">
              {skills.length === 0 ? (
                <p className="empty-copy">Nenhuma skill detectada.</p>
              ) : (
                skills.map((skill) => {
                  const checked = draft.skillIds.includes(skill.id);
                  return (
                    <label
                      className={`skill-option${checked ? " skill-option--checked" : ""}`}
                      key={skill.id}
                    >
                      <input
                        checked={checked}
                        type="checkbox"
                        onChange={() => toggleSkill(skill.id)}
                      />
                      <div>
                        <strong>{skill.id}</strong>
                        <span>{skill.name}</span>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </Field>

          <label className="toggle-row">
            <input
              checked={draft.searchEnabled}
              type="checkbox"
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, searchEnabled: event.target.checked } : current))}
            />
            <span>Search enabled</span>
          </label>
        </div>

        {error ? <InlineState message={error} tone="danger" /> : null}

        <div className="drawer-actions">
          <button className="ghost-button" onClick={onClose} type="button">
            Cancelar
          </button>
          <button className="primary-button" disabled={saving} onClick={onSubmit} type="button">
            {saving ? "Salvando..." : mode === "create" ? "Criar agente" : "Salvar agente"}
          </button>
        </div>
      </aside>
    </div>
  );
}

export function toAgentEditorDraft(agent: AgentRecord): AgentEditorDraft {
  return {
    slug: agent.slug,
    approvalPolicy: agent.approvalPolicy,
    description: agent.description,
    displayName: agent.displayName,
    mcpProfileId: agent.mcpProfileId,
    model: agent.model ?? "",
    promptInline: agent.promptInline ?? "",
    promptTemplatePath: agent.promptTemplatePath ?? "",
    reasoningEffort: agent.reasoningEffort,
    role: agent.role,
    sandboxMode: agent.sandboxMode,
    searchEnabled: agent.searchEnabled,
    skillIds: [...agent.skillIds].sort(),
    status: agent.status,
  };
}

export function createDefaultAgentDraft(profiles: AgentMcpProfileRecord[]): AgentEditorDraft {
  return {
    slug: "",
    approvalPolicy: "never",
    description: "",
    displayName: "",
    mcpProfileId: profiles[0]?.id ?? "",
    model: "",
    promptInline: "",
    promptTemplatePath: "",
    reasoningEffort: "medium",
    role: "specialist",
    sandboxMode: "danger-full-access",
    searchEnabled: true,
    skillIds: [],
    status: "active",
  };
}

export function toCreateAgentInput(draft: AgentEditorDraft): CreateAgentInput {
  return {
    slug: draft.slug.trim().toLowerCase(),
    approvalPolicy: draft.approvalPolicy,
    description: draft.description.trim(),
    displayName: draft.displayName.trim(),
    mcpProfileId: draft.mcpProfileId.trim(),
    model: normalizeNullable(draft.model),
    promptInline: normalizeNullable(draft.promptInline),
    promptTemplatePath: normalizeNullable(draft.promptTemplatePath),
    reasoningEffort: draft.reasoningEffort,
    role: draft.role,
    sandboxMode: draft.sandboxMode,
    searchEnabled: draft.searchEnabled,
    skillIds: normalizeSkills(draft.skillIds),
    status: draft.status,
  };
}

export function toUpdateAgentInput(draft: AgentEditorDraft): UpdateAgentInput {
  return {
    approvalPolicy: draft.approvalPolicy,
    description: draft.description.trim(),
    displayName: draft.displayName.trim(),
    mcpProfileId: draft.mcpProfileId.trim(),
    model: normalizeNullable(draft.model),
    promptInline: normalizeNullable(draft.promptInline),
    promptTemplatePath: normalizeNullable(draft.promptTemplatePath),
    reasoningEffort: draft.reasoningEffort,
    role: draft.role,
    sandboxMode: draft.sandboxMode,
    searchEnabled: draft.searchEnabled,
    skillIds: normalizeSkills(draft.skillIds),
    status: draft.status,
  };
}

function normalizeSkills(skillIds: string[]): string[] {
  return [...new Set(skillIds.map((skillId) => skillId.trim()).filter(Boolean))].sort();
}

function normalizeNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
