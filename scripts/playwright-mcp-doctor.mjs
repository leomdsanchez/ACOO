import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const BRAVE_BIN =
  process.env.ACOO_PLAYWRIGHT_MCP_BROWSER_PATH ??
  process.env.PLAYWRIGHT_MCP_BRAVE_BIN ??
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const DEBUG_HOST = process.env.PLAYWRIGHT_MCP_BRAVE_DEBUG_HOST ?? "127.0.0.1";
const CONNECT_TIMEOUT_MS = Number(process.env.PLAYWRIGHT_MCP_DOCTOR_CONNECT_TIMEOUT_MS ?? "5000");
const READY_TIMEOUT_MS = Number(process.env.PLAYWRIGHT_MCP_DOCTOR_READY_TIMEOUT_MS ?? "12000");
const POLL_INTERVAL_MS = Number(process.env.PLAYWRIGHT_MCP_DOCTOR_POLL_INTERVAL_MS ?? "500");
const RESULT_WORD_LIMIT = 40;
const OWN_SESSION_ENABLED =
  (process.env.ACOO_PLAYWRIGHT_MCP_OWN_SESSION ?? "true").toLowerCase() !== "false";
const OPERATIONAL_PROFILE_DIR =
  process.env.ACOO_PLAYWRIGHT_MCP_PROFILE_DIR ??
  path.join(os.homedir(), "Library", "Application Support", "PlaywrightMCP", "brave-profile");
const OPERATIONAL_OUTPUT_DIR =
  process.env.ACOO_PLAYWRIGHT_MCP_OUTPUT_DIR ??
  path.join(process.cwd(), ".acoo", "playwright-mcp");
const OPERATIONAL_LOCK_PATH = path.join(OPERATIONAL_PROFILE_DIR, ".profile.lock");
const OPERATIONAL_CDP_PORT = Number(process.env.ACOO_PLAYWRIGHT_MCP_CDP_PORT ?? "9222");

function parseArgs(argv) {
  return {
    json: argv.includes("--json"),
    pretty: argv.includes("--pretty"),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const modes = ["visible", "headless"];
  const results = [];
  const operationalSession = await inspectOperationalSession();
  const operationalCheck = await runOperationalCheck(operationalSession);

  for (const mode of modes) {
    results.push(await runMode(mode));
  }

  const overallOk = operationalCheck.ok && results.every((result) => result.ok);
  const payload = {
    ok: overallOk,
    operationalCheck,
    operationalSession,
    results,
  };

  if (args.json || args.pretty) {
    process.stdout.write(`${JSON.stringify(payload, null, args.pretty ? 2 : 0)}\n`);
    process.exit(overallOk ? 0 : 1);
  }

  const lines = [
    `Playwright MCP doctor: ${overallOk ? "ok" : "issues found"}`,
    ...results.flatMap((result) => formatHumanResult(result)),
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
  process.exit(overallOk ? 0 : 1);
}

async function runMode(mode) {
  const port = await findFreePort();
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), `acoo-playwright-${mode}-`));
  const logPath = path.join(profileDir, `${mode}.log`);
  const logHandle = await fs.open(logPath, "a");
  const args = [
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-address=${DEBUG_HOST}`,
    `--remote-debugging-port=${port}`,
    "--no-first-run",
    "--no-default-browser-check",
  ];

  if (mode === "headless") {
    args.unshift("--use-gl=swiftshader");
    args.unshift("--disable-gpu");
    args.unshift("--headless=new");
  }

  const child = spawn(BRAVE_BIN, args, {
    detached: true,
    stdio: ["ignore", logHandle.fd, logHandle.fd],
  });
  child.unref();

  const endpoint = `http://${DEBUG_HOST}:${port}`;
  const versionUrl = `${endpoint}/json/version`;
  const startedAt = Date.now();
  const stageResults = {
    process: false,
    port: false,
    versionEndpoint: false,
    connectOverCDP: false,
  };
  let failure = null;
  let versionPayload = null;

  try {
    while (Date.now() - startedAt < READY_TIMEOUT_MS) {
      stageResults.process = isAlive(child.pid);
      if (!stageResults.process) {
        failure = "browser_process_exited";
        break;
      }

      stageResults.port = await isPortListening(port);
      if (!stageResults.port) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      versionPayload = await fetchJson(versionUrl, CONNECT_TIMEOUT_MS);
      stageResults.versionEndpoint = Boolean(versionPayload?.webSocketDebuggerUrl);
      if (!stageResults.versionEndpoint) {
        failure = "cdp_version_unavailable";
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      try {
        const browser = await chromium.connectOverCDP(endpoint, { timeout: CONNECT_TIMEOUT_MS });
        stageResults.connectOverCDP = true;
        const contexts = browser.contexts().length;
        const pages = browser.contexts().reduce((sum, context) => sum + context.pages().length, 0);
        await browser.close();
        return await finalizeResult({
          cleanupPid: child.pid,
          endpoint,
          failure: null,
          logPath,
          mode,
          ok: true,
          pages,
          port,
          profileDir,
          stageResults,
          versionPayload,
          contexts,
        });
      } catch {
        failure = "cdp_attach_failed";
      }

      await sleep(POLL_INTERVAL_MS);
    }

    if (!failure) {
      failure = "runtime_not_ready_within_timeout";
    }

    return await finalizeResult({
      cleanupPid: child.pid,
      endpoint,
      failure,
      logPath,
      mode,
      ok: false,
      pages: 0,
      port,
      profileDir,
      stageResults,
      versionPayload,
      contexts: 0,
    });
  } finally {
    await logHandle.close();
  }
}

async function runOperationalCheck(operationalSession) {
  const stageResults = {
    process: operationalSession.locked || operationalSession.profileDirExists,
    port: false,
    versionEndpoint: false,
    connectOverCDP: false,
  };
  let versionPayload = null;

  try {
    const versionResponse = await fetch(`http://${DEBUG_HOST}:${OPERATIONAL_CDP_PORT}/json/version`, {
      method: "GET",
      signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
    });

    stageResults.port = versionResponse.ok;
    if (!versionResponse.ok) {
      return {
        contexts: 0,
        endpoint: `http://${DEBUG_HOST}:${OPERATIONAL_CDP_PORT}`,
        failure: operationalSession.locked ? "operational_context_missing" : "operational_owner_absent",
        logExcerpt: [],
        mode: "operational",
        ok: false,
        pages: 0,
        port: OPERATIONAL_CDP_PORT,
        probableCause: operationalSession.locked
          ? "operational_owner_present_but_unavailable"
          : "operational_owner_absent",
        recommendation: operationalSession.locked
          ? "inspect owner session state before relying on ephemeral doctor results"
          : "bootstrap the owned operational session before using MCP flows",
        stageResults,
        versionPayload: null,
      };
    }

    versionPayload = await versionResponse.json();
    stageResults.versionEndpoint = Boolean(versionPayload?.webSocketDebuggerUrl);
    if (!stageResults.versionEndpoint) {
      return {
        contexts: 0,
        endpoint: `http://${DEBUG_HOST}:${OPERATIONAL_CDP_PORT}`,
        failure: "operational_metadata_missing",
        logExcerpt: [],
        mode: "operational",
        ok: false,
        pages: 0,
        port: OPERATIONAL_CDP_PORT,
        probableCause: "operational_owner_missing_cdp_metadata",
        recommendation: "inspect the owned operational session before using fallback launcher diagnostics",
        stageResults,
        versionPayload: null,
      };
    }

    const browser = await chromium.connectOverCDP(`http://${DEBUG_HOST}:${OPERATIONAL_CDP_PORT}`, {
      timeout: CONNECT_TIMEOUT_MS,
    });
    stageResults.connectOverCDP = true;
    const contexts = browser.contexts().length;
    const pages = browser.contexts().reduce((sum, context) => sum + context.pages().length, 0);
    await browser.close();

    return {
      contexts,
      endpoint: `http://${DEBUG_HOST}:${OPERATIONAL_CDP_PORT}`,
      failure: null,
      logExcerpt: [],
      mode: "operational",
      ok: true,
      pages,
      port: OPERATIONAL_CDP_PORT,
      probableCause: "operational_owner_healthy",
      recommendation: "owned_operational_session_ready",
      stageResults,
      versionPayload: {
        browser: versionPayload?.Browser ?? null,
        webSocketDebuggerUrl: versionPayload?.webSocketDebuggerUrl ?? null,
      },
    };
  } catch {
    return {
      contexts: 0,
      endpoint: `http://${DEBUG_HOST}:${OPERATIONAL_CDP_PORT}`,
      failure: operationalSession.locked ? "operational_attach_failed" : "operational_owner_absent",
      logExcerpt: [],
      mode: "operational",
      ok: false,
      pages: 0,
      port: OPERATIONAL_CDP_PORT,
      probableCause: operationalSession.locked
        ? "operational_owner_present_but_attach_failed"
        : "operational_owner_absent",
      recommendation: operationalSession.locked
        ? "run ensure/doctor and inspect owner state before relying on fallback launcher"
        : "bootstrap the owned operational session before using MCP flows",
      stageResults,
      versionPayload: null,
    };
  }
}

async function finalizeResult({
  cleanupPid,
  endpoint,
  failure,
  logPath,
  mode,
  ok,
  pages,
  port,
  profileDir,
  stageResults,
  versionPayload,
  contexts,
}) {
  await cleanupProcessGroup(cleanupPid);
  const logExcerpt = await readLogExcerpt(logPath);
  await fs.rm(profileDir, { force: true, recursive: true });

  return {
    mode,
    ok,
    endpoint,
    port,
    contexts,
    pages,
    stageResults,
    failure,
    probableCause: classifyFailure(failure, stageResults),
    recommendation: buildRecommendation(failure, mode),
    versionPayload: versionPayload
      ? {
          browser: versionPayload.Browser ?? null,
          webSocketDebuggerUrl: versionPayload.webSocketDebuggerUrl ?? null,
        }
      : null,
    logExcerpt,
  };
}

function classifyFailure(failure, stageResults) {
  if (!failure) {
    return "runtime_healthy";
  }
  if (!stageResults.process) {
    return "browser_exited_before_ready";
  }
  if (!stageResults.port) {
    return "browser_started_without_listening_cdp_port";
  }
  if (!stageResults.versionEndpoint) {
    return "cdp_metadata_missing";
  }
  if (!stageResults.connectOverCDP) {
    return "cdp_attach_unstable";
  }
  return "unknown_runtime_failure";
}

function buildRecommendation(failure, mode) {
  if (!failure) {
    return OWN_SESSION_ENABLED
      ? "runtime_ready_and_operational_owner_can_be_trusted"
      : "runtime_ready";
  }
  if (failure === "browser_process_exited") {
    return `check Brave startup flags and runtime logs for ${mode}`;
  }
  if (failure === "cdp_attach_failed") {
    return "verify remote debugging startup path and healthcheck contract";
  }
  if (failure === "cdp_version_unavailable") {
    return "verify remote debugging port exposure and profile isolation";
  }
  return "inspect log excerpt and rerun doctor before operational use";
}

async function findFreePort() {
  const net = await import("node:net");
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, DEBUG_HOST, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to resolve temporary port."));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
    server.on("error", reject);
  });
}

function isAlive(pid) {
  if (!pid) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function isPortListening(port) {
  const net = await import("node:net");
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host: DEBUG_HOST, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 1000);

    socket.once("connect", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function cleanupProcessGroup(pid) {
  if (!pid) {
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    return;
  }
  await sleep(1000);
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // Ignore if the process group is already gone.
  }
}

async function readLogExcerpt(logPath) {
  try {
    const content = await fs.readFile(logPath, "utf8");
    const lines = content
      .trim()
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    return lines.slice(-RESULT_WORD_LIMIT);
  } catch {
    return [];
  }
}

async function inspectOperationalSession() {
  const profileDirExists = await pathExists(OPERATIONAL_PROFILE_DIR);
  const outputDirExists = await pathExists(OPERATIONAL_OUTPUT_DIR);
  const lockState = await inspectProfileLock(OPERATIONAL_LOCK_PATH);

  return {
    enabled: OWN_SESSION_ENABLED,
    executablePath: BRAVE_BIN,
    executablePresent: await isExecutable(BRAVE_BIN),
    lockOwner: lockState.lockOwner,
    locked: lockState.locked,
    outputDir: OPERATIONAL_OUTPUT_DIR,
    outputDirExists,
    profileDir: OPERATIONAL_PROFILE_DIR,
    profileDirExists,
  };
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function isExecutable(targetPath) {
  try {
    await fs.access(targetPath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function inspectProfileLock(lockPath) {
  if (!OWN_SESSION_ENABLED) {
    return {
      locked: false,
      lockOwner: "none",
    };
  }

  if (!(await pathExists(lockPath))) {
    return {
      locked: false,
      lockOwner: "none",
    };
  }

  try {
    const raw = await fs.readFile(lockPath, "utf-8");
    const parsed = JSON.parse(raw);
    const pid = typeof parsed?.pid === "number" ? parsed.pid : null;
    if (!isAlive(pid)) {
      await fs.rm(lockPath, { force: true }).catch(() => {});
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

function formatHumanResult(result) {
  return [
    "",
    `[${result.mode}] ${result.ok ? "ok" : "failed"}`,
    `- probableCause: ${result.probableCause}`,
    `- recommendation: ${result.recommendation}`,
    `- stageResults: ${JSON.stringify(result.stageResults)}`,
    `- endpoint: ${result.endpoint}`,
  ];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
