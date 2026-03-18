import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "playwright";

const execFileAsync = promisify(execFile);

const endpoint =
  process.env.ACOO_PLAYWRIGHT_MCP_CDP_ENDPOINT ??
  process.env.ACOO_PLAYWRIGHT_MCP_HEALTHCHECK_URL?.replace(/\/json\/version$/, "") ??
  "http://127.0.0.1:9222";

const timeoutMs = Number(process.env.ACOO_PLAYWRIGHT_MCP_HEALTHCHECK_TIMEOUT_MS ?? "5000");
const wrapperCommand =
  process.env.ACOO_PLAYWRIGHT_MCP_WRAPPER_COMMAND ??
  path.join(os.homedir(), ".local", "bin", "playwright-mcp-brave-persistent");

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
    await browser.close();
    const wrapper = await validateWrapperExecutable(timeoutMs);

    process.stdout.write(
      `${JSON.stringify({
        contexts: contexts.length,
        endpoint,
        ok: true,
        pages,
        wrapperCommand: wrapper.wrapperCommand,
        wrapperExecutableOk: true,
      })}\n`,
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

async function validateWrapperExecutable(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    await execFileAsync(wrapperCommand, ["--help"], {
      env: process.env,
      maxBuffer: 1024 * 1024,
      signal: controller.signal,
    });

    return {
      wrapperCommand,
    };
  } catch (error) {
    throw new Error(`Playwright MCP wrapper is not executable.${formatStderr(error)}`);
  } finally {
    clearTimeout(timer);
  }
}

function formatStderr(stderr) {
  const excerpt =
    typeof stderr === "string"
      ? stderr.trim()
      : stderr && typeof stderr === "object" && "stderr" in stderr && typeof stderr.stderr === "string"
        ? stderr.stderr.trim()
        : "";
  return excerpt ? ` STDERR: ${excerpt}` : "";
}
