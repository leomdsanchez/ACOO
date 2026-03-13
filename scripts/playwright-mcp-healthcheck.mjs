import { chromium } from "playwright";

const endpoint =
  process.env.ACOO_PLAYWRIGHT_MCP_CDP_ENDPOINT ??
  process.env.ACOO_PLAYWRIGHT_MCP_HEALTHCHECK_URL?.replace(/\/json\/version$/, "") ??
  "http://127.0.0.1:9222";

const timeoutMs = Number(process.env.ACOO_PLAYWRIGHT_MCP_HEALTHCHECK_TIMEOUT_MS ?? "5000");

async function main() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const versionResponse = await fetch(`${endpoint}/json/version`, {
      method: "GET",
      signal: controller.signal,
    });

    if (!versionResponse.ok) {
      throw new Error(`CDP version endpoint returned HTTP ${versionResponse.status}.`);
    }

    const versionPayload = await versionResponse.json();
    if (!versionPayload?.webSocketDebuggerUrl) {
      throw new Error("CDP endpoint did not expose webSocketDebuggerUrl.");
    }

    const browser = await chromium.connectOverCDP(endpoint, { timeout: timeoutMs });
    const contexts = browser.contexts();
    const pages = contexts.reduce((sum, context) => sum + context.pages().length, 0);

    process.stdout.write(
      `${JSON.stringify({ contexts: contexts.length, endpoint, ok: true, pages })}\n`,
    );
    process.exit(0);
  } finally {
    clearTimeout(timer);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
