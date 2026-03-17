import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { RuntimeStatusService } from "./RuntimeStatusService.js";
import type { AppConfig } from "../config/AppConfig.js";

test("status exposes backup as the effective default agent source when configured default is unavailable", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "acoo-status-"));
  try {
    const service = new RuntimeStatusService(
      makeConfig(repoRoot),
      {
        getStatus: async () => ({
          authenticated: true,
          configExists: true,
          configPath: path.join(os.homedir(), ".codex", "config.toml"),
          installed: true,
          loginStatus: "Logged in",
          mcpServers: [],
        }),
      } as never,
      {
        getSnapshot: () => ({
          catalog: [],
          configured: [],
          configuredUnknown: [],
          recommendedMissing: [],
        }),
      } as never,
      {
        getAgentBySlug: async () => null,
        getIntegrityReport: async () => ({
          duplicateMcpProfileIds: [],
          duplicateSessionThreadBindings: [],
          duplicateSlugs: [],
          missingAgentIdsInSessions: [],
          missingMcpProfileIds: [],
        }),
        listAgents: async () => [{ slug: "ops" }],
        listMcpProfiles: async () => [],
        listSessions: async () => [],
      } as never,
      {
        getManagedRuntimeHealth: async () => [],
      } as never,
      {
        loadAll: async () => [
          {
            content: "",
            description: "test",
            id: "skill-1",
            keywords: [],
            name: "Skill",
            sourcePath: "/tmp/skill.md",
          },
        ],
      } as never,
      {
        contacts: {
          listContacts: async () => [],
        },
        projects: {
          listProjects: async () => [],
        },
        tasks: {
          listTasks: async () => [],
        },
        threads: {
          listThreads: async () => [],
        },
      } as never,
      {
        getHealth: async () => ({
          enabled: false,
          ffmpegAvailable: true,
          modelAvailable: true,
          modelPath: path.join(repoRoot, ".acoo", "models", "ggml-base.bin"),
          whisperBinaryAvailable: true,
        }),
      } as never,
    );

    const status = await service.getStatus();

    assert.equal(status.defaults.agentSlugSource, "backup");
    assert.equal(status.defaults.agentSlugEffective, "ops");
    assert.equal(status.defaults.agentSlugConfigured, "coo");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

function makeConfig(repoRoot: string): AppConfig {
  return {
    api: {
      host: "127.0.0.1",
      port: 4317,
    },
    appName: "ACOO",
    backupAgentSlug: "ops",
    codexApprovalPolicy: "never",
    codexCliBinary: "codex",
    codexConfigPath: path.join(os.homedir(), ".codex", "config.toml"),
    codexExecTimeoutMs: 120_000,
    codexModel: null,
    codexReasoningEffort: "high",
    codexSandboxMode: "danger-full-access",
    defaultAgentSlug: "coo",
    playwrightMcp: {
      autostart: false,
      healthcheckCommand: null,
      healthcheckUrl: "http://127.0.0.1:9222/json/version",
      startupCommand: "/bin/true",
    },
    repoRoot,
    skillRoots: [],
    telegram: {
      allowedUserIds: [],
      botToken: null,
      botUsername: null,
      enabled: false,
      progressPulseMs: 4_000,
      replyAudioByDefault: false,
    },
    transcription: {
      binary: "whisper-cli",
      enabled: false,
      ffmpegBinary: "ffmpeg",
      language: null,
      modelDownloaderBinary: "curl",
      modelPath: path.join(repoRoot, ".acoo", "models", "ggml-base.bin"),
      modelUrl: null,
      modelVariant: "base",
      threads: 1,
    },
  };
}
