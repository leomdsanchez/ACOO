import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { TranscriptionConfig } from "../config/AppConfig.js";

const execFileAsync = promisify(execFile);

export interface LocalTranscriptionResult {
  language: string | null;
  segments: number;
  text: string;
}

export interface LocalTranscriptionHealth {
  enabled: boolean;
  ffmpegAvailable: boolean;
  modelAvailable: boolean;
  modelPath: string;
  whisperBinaryAvailable: boolean;
}

export class LocalTranscriptionService {
  private readonly modelPath: string;

  public constructor(
    private readonly repoRoot: string,
    private readonly config: TranscriptionConfig,
  ) {
    this.modelPath = resolveModelPath(repoRoot, config.modelPath);
  }

  public isEnabled(): boolean {
    return this.config.enabled;
  }

  public async getHealth(): Promise<LocalTranscriptionHealth> {
    const whisperBinaryAvailable = await isBinaryAccessible(this.config.binary);
    const ffmpegAvailable = await isBinaryAccessible(this.config.ffmpegBinary);
    const modelAvailable = await fileExists(this.modelPath);

    return {
      enabled: this.config.enabled,
      ffmpegAvailable,
      modelAvailable,
      modelPath: this.modelPath,
      whisperBinaryAvailable,
    };
  }

  public async transcribe(audioPath: string): Promise<LocalTranscriptionResult> {
    if (!this.config.enabled) {
      throw new Error("Transcrição local desabilitada no runtime.");
    }

    await this.assertRunnable();

    const workingDir = await mkdtemp(path.join(os.tmpdir(), "acoo-whispercpp-"));
    const outputBase = path.join(
      workingDir,
      `${Date.now()}-${path.basename(audioPath, path.extname(audioPath))}`,
    );
    const wavPath = `${outputBase}.wav`;

    try {
      await execFileAsync(
        this.config.ffmpegBinary,
        [
          "-y",
          "-i",
          audioPath,
          "-ar",
          "16000",
          "-ac",
          "1",
          "-c:a",
          "pcm_s16le",
          wavPath,
        ],
        {
          cwd: this.repoRoot,
          env: process.env,
          maxBuffer: 20 * 1024 * 1024,
        },
      );

      const args = [
        "-m",
        this.modelPath,
        "-f",
        wavPath,
        "-nt",
        "-of",
        outputBase,
        "-oj",
        "-l",
        this.config.language || "auto",
        "-t",
        String(this.config.threads),
      ];

      const { stdout, stderr } = await execFileAsync(this.config.binary, args, {
        cwd: this.repoRoot,
        env: process.env,
        maxBuffer: 20 * 1024 * 1024,
      });

      const jsonPath = `${outputBase}.json`;
      const payload = await readJsonResult(jsonPath);
      const textFromJson = payload
        ? (payload.transcription ?? [])
            .map((segment) => segment.text?.trim() ?? "")
            .filter(Boolean)
            .join(" ")
            .trim()
        : "";
      const text = textFromJson || extractTranscriptFromStdout(stdout);

      return {
        language: payload?.result?.language ?? detectLanguageFromLogs(stdout, stderr),
        segments: payload?.transcription?.length ?? countSegments(text),
        text,
      };
    } catch (error) {
      throw new Error(
        `Falha na transcrição local via whisper.cpp: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      await rm(workingDir, { force: true, recursive: true });
    }
  }

  private async assertRunnable(): Promise<void> {
    await Promise.all([
      ensureBinaryAccessible(this.config.binary, "whisper.cpp binary"),
      ensureBinaryAccessible(this.config.ffmpegBinary, "ffmpeg binary"),
    ]);

    try {
      await access(this.modelPath);
    } catch {
      await ensureBinaryAccessible(this.config.modelDownloaderBinary, "curl binary");
      await this.downloadModel();
    }
  }

  private async downloadModel(): Promise<void> {
    const modelDir = path.dirname(this.modelPath);
    await mkdir(modelDir, { recursive: true });
    const modelUrl = this.config.modelUrl;
    if (!modelUrl) {
      throw new Error(`Modelo whisper.cpp não encontrado em ${this.modelPath} e nenhuma URL configurada.`);
    }

    await execFileAsync(this.config.modelDownloaderBinary, [
      "-L",
      modelUrl,
      "-o",
      this.modelPath,
    ], {
      cwd: this.repoRoot,
      env: process.env,
      maxBuffer: 20 * 1024 * 1024,
    });
  }
}

interface WhisperJsonPayload {
  result?: {
    language?: string;
  };
  transcription?: Array<{ text?: string }>;
}

async function readJsonResult(jsonPath: string): Promise<WhisperJsonPayload | null> {
  try {
    const raw = await readFile(jsonPath, "utf8");
    return JSON.parse(raw) as WhisperJsonPayload;
  } catch {
    return null;
  }
}

function extractTranscriptFromStdout(stdout: string): string {
  const marker = "output_json:";
  const head = stdout.includes(marker) ? stdout.slice(0, stdout.indexOf(marker)) : stdout;
  return head
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("["))
    .join(" ")
    .trim();
}

function detectLanguageFromLogs(...chunks: string[]): string | null {
  const joined = chunks.join("\n");
  const match = joined.match(/auto-detected language:\s+([a-z]{2,})/i);
  return match?.[1] ?? null;
}

function countSegments(text: string): number {
  return text ? 1 : 0;
}

async function ensureBinaryAccessible(binary: string, label: string): Promise<void> {
  if (!(await isBinaryAccessible(binary))) {
    throw new Error(`${label} "${binary}" não encontrado no PATH.`);
  }
}

async function isBinaryAccessible(binary: string): Promise<boolean> {
  try {
    await execFileAsync("which", [binary], {
      env: process.env,
      maxBuffer: 1024 * 1024,
    });
    return true;
  } catch {
    return false;
  }
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function resolveModelPath(repoRoot: string, modelPath: string): string {
  if (path.isAbsolute(modelPath)) {
    return modelPath;
  }

  return path.join(repoRoot, modelPath);
}
