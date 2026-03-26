import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface PlaywrightDoctorStageResults {
  connectOverCDP: boolean;
  port: boolean;
  process: boolean;
  versionEndpoint: boolean;
}

export interface PlaywrightDoctorModeResult {
  contexts: number;
  endpoint: string;
  failure: string | null;
  logExcerpt: string[];
  mode: string;
  ok: boolean;
  pages: number;
  port: number;
  probableCause: string;
  recommendation: string;
  stageResults: PlaywrightDoctorStageResults;
  versionPayload: {
    browser: string | null;
    webSocketDebuggerUrl: string | null;
  } | null;
}

export interface PlaywrightDoctorPayload {
  ok: boolean;
  operationalCheck?: PlaywrightDoctorModeResult;
  operationalSession?: {
    enabled: boolean;
    executablePath: string | null;
    executablePresent: boolean;
    lockOwner: "none" | "current_process" | "other_process";
    locked: boolean;
    outputDir: string;
    outputDirExists: boolean;
    profileDir: string;
    profileDirExists: boolean;
  };
  results: PlaywrightDoctorModeResult[];
}

export interface PlaywrightDoctorExecution {
  exitCode: number;
  payload: PlaywrightDoctorPayload;
  stderr: string;
}

export async function runPlaywrightDoctor(cwd: string): Promise<PlaywrightDoctorExecution> {
  const argv = ["scripts/playwright-mcp-doctor.mjs", "--json"];

  try {
    const { stdout, stderr } = await execFileAsync("node", argv, {
      cwd,
      env: process.env,
      maxBuffer: 1024 * 1024,
    });
    return {
      exitCode: 0,
      payload: parseDoctorPayload(stdout),
      stderr,
    };
  } catch (error) {
    const execError = asExecError(error);
    if (!execError) {
      throw error;
    }

    return {
      exitCode: typeof execError.code === "number" ? execError.code : 1,
      payload: parseDoctorPayload(execError.stdout ?? ""),
      stderr: execError.stderr ?? "",
    };
  }
}

function parseDoctorPayload(stdout: string): PlaywrightDoctorPayload {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("Playwright doctor returned empty output.");
  }

  return JSON.parse(trimmed) as PlaywrightDoctorPayload;
}

function asExecError(
  error: unknown,
): { code?: number; stderr?: string; stdout?: string } | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  if (!("stdout" in error) && !("stderr" in error) && !("code" in error)) {
    return null;
  }

  return error as { code?: number; stderr?: string; stdout?: string };
}
