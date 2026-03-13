export interface RuntimeStatusSnapshot {
  agents: {
    active: number;
    sessions: number;
  };
  channels: {
    telegram: string;
  };
  defaults: {
    approvalPolicy: string;
    model: string | null;
    reasoningEffort: string;
    sandboxMode: string;
  };
  integrations: {
    configured: number;
    managedRuntimeHealthy: string[];
  };
  issues: string[];
  advisories: string[];
  telegram: {
    activeChats: number;
    botUsername: string | null;
    enabled: boolean;
    implemented: boolean;
    totalChats: number;
  };
}

interface ApiEnvelope<T> {
  data: T;
}

export async function fetchRuntimeStatus(): Promise<RuntimeStatusSnapshot> {
  const response = await fetch("/api/status");
  if (!response.ok) {
    throw new Error(`Status request failed with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as ApiEnvelope<RuntimeStatusSnapshot>;
  return payload.data;
}
