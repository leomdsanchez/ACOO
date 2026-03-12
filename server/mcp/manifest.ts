export interface SupportedMcpIntegration {
  category: "automation" | "finance" | "knowledge";
  managedBy: "codex-cli";
  name: string;
  notes: string;
  scope: "command" | "url" | "either";
  recommended: boolean;
}

export const supportedMcpIntegrations: SupportedMcpIntegration[] = [
  {
    category: "automation",
    managedBy: "codex-cli",
    name: "playwright",
    notes: "Automação de browser para fluxos operacionais em sessões já autenticadas.",
    scope: "either",
    recommended: true,
  },
  {
    category: "knowledge",
    managedBy: "codex-cli",
    name: "notion",
    notes: "Consulta e operação em workspace documental e bases operacionais.",
    scope: "url",
    recommended: true,
  },
  {
    category: "finance",
    managedBy: "codex-cli",
    name: "stripe",
    notes: "Consulta operacional de billing, pagamentos e entidades Stripe.",
    scope: "url",
    recommended: false,
  },
];
