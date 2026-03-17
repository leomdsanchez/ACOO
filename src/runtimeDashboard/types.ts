export interface AgentEditorDraft {
  slug: string;
  approvalPolicy: string;
  description: string;
  displayName: string;
  mcpProfileId: string;
  model: string;
  promptInline: string;
  promptTemplatePath: string;
  reasoningEffort: string;
  role: string;
  sandboxMode: string;
  searchEnabled: boolean;
  skillIds: string[];
  status: string;
}
