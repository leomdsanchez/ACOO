import os from "node:os";
import path from "node:path";
import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
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
const profileDir =
  process.env.ACOO_PLAYWRIGHT_MCP_PROFILE_DIR ??
  path.join(os.homedir(), "Library", "Application Support", "PlaywrightMCP", "brave-profile");
const profileLockPath = path.join(profileDir, ".profile.lock");
const ownSessionEnabled =
  (process.env.ACOO_PLAYWRIGHT_MCP_OWN_SESSION ?? "true").toLowerCase() !== "false";

async function main() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const evidence = await collectEvidence();
    const versionResponse = await fetch(`${endpoint}/json/version`, {
      method: "GET",
      signal: controller.signal,
    });

    if (!versionResponse.ok) {
      throw buildHealthcheckError(
        resolveStatusCode("version_unreachable", evidence),
        `CDP version endpoint returned HTTP ${versionResponse.status}.`,
        evidence,
      );
    }

    const versionPayload = await versionResponse.json();
    if (!versionPayload?.webSocketDebuggerUrl) {
      throw buildHealthcheckError(
        resolveStatusCode("metadata_missing", evidence),
        "CDP endpoint did not expose webSocketDebuggerUrl.",
        evidence,
      );
    }

    let browser;
    try {
      browser = await chromium.connectOverCDP(endpoint, { timeout: timeoutMs });
    } catch (error) {
      throw buildHealthcheckError(
        resolveStatusCode("attach_failed", evidence),
        error instanceof Error ? error.message : String(error),
        evidence,
      );
    }

    const contexts = browser.contexts();
    const pages = contexts.reduce((sum, context) => sum + context.pages().length, 0);
    await browser.close();
    await validateWrapperExecutable(timeoutMs, evidence);

    writeResult({
      code: "ready",
      contexts: contexts.length,
      endpoint,
      evidence: {
        ...evidence,
        contexts: contexts.length,
        pages,
      },
      ok: true,
      pages,
      summary: "Runtime saudável e anexável.",
      wrapperCommand,
    });
    process.exit(0);
  } finally {
    clearTimeout(timer);
  }
}

main().catch((error) => {
  if (isStructuredHealthcheckError(error)) {
    writeResult(error.payload, "stderr");
  } else {
    writeResult(
      {
        code: "healthcheck_failed",
        detail: error instanceof Error ? error.message : String(error),
        endpoint,
        evidence: {
          browserProcessDetected: false,
          profileDir,
          profileDirExists: false,
          wrapperCommand,
          wrapperExecutableOk: false,
        },
        ok: false,
        summary: "Falha inesperada ao avaliar o runtime.",
        wrapperCommand,
      },
      "stderr",
    );
  }
  process.exit(1);
});

async function validateWrapperExecutable(timeoutMs, evidence) {
  try {
    await access(wrapperCommand, fsConstants.X_OK);

    return {
      wrapperCommand,
    };
  } catch (error) {
    throw buildHealthcheckError(
      "wrapper_missing",
      `Playwright MCP wrapper is not executable.${formatStderr(error)}`,
      evidence,
    );
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

async function collectEvidence() {
  const lockEvidence = await inspectProfileLock();
  const processMatches = await detectBrowserProcess();
  return {
    browserProcessDetected: lockEvidence.locked || processMatches.length > 0,
    browserProcesses: processMatches,
    lockOwner: lockEvidence.lockOwner,
    ownerLockDetected: lockEvidence.locked,
    ownerLockPath: profileLockPath,
    ownSessionEnabled,
    profileDir,
    profileDirExists: await pathExists(profileDir),
    wrapperCommand,
    wrapperExecutableOk: await isExecutable(wrapperCommand),
  };
}

async function detectBrowserProcess() {
  try {
    const { stdout } = await execFileAsync("pgrep", ["-af", profileDir], {
      maxBuffer: 1024 * 1024,
      timeout: timeoutMs,
    });
    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function pathExists(targetPath) {
  try {
    await access(targetPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function inspectProfileLock() {
  if (!ownSessionEnabled) {
    return {
      locked: false,
      lockOwner: "none",
    };
  }

  if (!(await pathExists(profileLockPath))) {
    return {
      locked: false,
      lockOwner: "none",
    };
  }

  try {
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(profileLockPath, "utf-8");
    const parsed = JSON.parse(content);
    const pid = typeof parsed?.pid === "number" ? parsed.pid : null;
    if (!isProcessAlive(pid)) {
      return {
        locked: false,
        lockOwner: "none",
      };
    }
    return {
      locked: true,
      lockOwner: pid === process.pid ? "current_process" : "other_process",
    };
  } catch {
    return {
      locked: true,
      lockOwner: "other_process",
    };
  }
}

function isProcessAlive(pid) {
  if (!pid || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function isExecutable(targetPath) {
  try {
    await access(targetPath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function buildHealthcheckError(code, detail, evidence) {
  const error = new Error(detail);
  error.payload = {
    code,
    detail,
    endpoint,
    evidence,
    ok: false,
    summary: summarizeCode(code),
    wrapperCommand,
  };
  return error;
}

function resolveStatusCode(stage, evidence) {
  if (stage === "version_unreachable") {
    if (!evidence.profileDirExists && !evidence.browserProcessDetected) {
      return "owner_absent";
    }
    if (evidence.ownerLockDetected && evidence.lockOwner === "other_process") {
      return "owner_locked_elsewhere";
    }
    return "context_missing";
  }

  if (stage === "metadata_missing" || stage === "attach_failed") {
    return "mcp_connection_failed";
  }

  return "healthcheck_failed";
}

function isStructuredHealthcheckError(error) {
  return Boolean(error && typeof error === "object" && "payload" in error);
}

function summarizeCode(code) {
  switch (code) {
    case "owner_absent":
      return "Sessão operacional do owner local ausente.";
    case "owner_locked_elsewhere":
      return "O profile operacional está sob posse de outro processo.";
    case "context_missing":
      return "O owner local existe, mas o contexto operacional não ficou utilizável.";
    case "mcp_connection_failed":
      return "A sessão operacional existe, mas a conexão MCP não ficou pronta.";
    case "wrapper_missing":
      return "Wrapper MCP do Playwright não está executável.";
    case "ready":
      return "Runtime saudável e anexável.";
    default:
      return "Falha ao avaliar o runtime.";
  }
}

function writeResult(payload, stream = "stdout") {
  const target = stream === "stderr" ? process.stderr : process.stdout;
  target.write(`${JSON.stringify(payload)}\n`);
}
