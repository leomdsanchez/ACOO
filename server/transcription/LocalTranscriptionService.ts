import { execFile } from "node:child_process";
import { access, mkdir, readFile, rm } from "node:fs/promises";
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

  public async transcribe(audioPath: string): Promise<LocalTranscriptionResult> {
    if (!this.config.enabled) {
      throw new Error("Transcrição local desabilitada no runtime.");
    }

    await this.assertRunnable();

    const workingDir = path.join(os.tmpdir(), "acoo-whispercpp");
    await mkdir(workingDir, { recursive: true });
    const outputBase = path.join(
      workingDir,
      `${Date.now()}-${path.basename(audioPath, path.extname(audioPath))}`,
    );

    try {
      const args = [
        "-m",
        this.modelPath,
        "-f",
        audioPath,
        "-nt",
        "-of",
        outputBase,
        "-oj",
        "-l",
        this.config.language || "auto",
        "-t",
        String(this.config.threads),
      ];

      await execFileAsync(this.config.binary, args, {
        cwd: this.repoRoot,
        env: process.env,
        maxBuffer: 20 * 1024 * 1024,
      });

      const jsonPath = `${outputBase}.json`;
      const raw = await readFile(jsonPath, "utf8");
      const payload = JSON.parse(raw) as {
        result?: {
          language?: string;
        };
        transcription?: Array<{ text?: string }>;
      };
      const text = (payload.transcription ?? [])
        .map((segment) => segment.text?.trim() ?? "")
        .filter(Boolean)
        .join(" ")
        .trim();

      await Promise.allSettled([
        rm(jsonPath, { force: true }),
      ]);

      return {
        language: payload.result?.language ?? null,
        segments: payload.transcription?.length ?? 0,
        text,
      };
    } catch (error) {
      throw new Error(
        `Falha na transcrição local via whisper.cpp: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async assertRunnable(): Promise<void> {
    await Promise.all([
      ensureBinaryAccessible(this.config.binary, "whisper.cpp binary"),
      ensureBinaryAccessible(this.config.modelDownloaderBinary, "curl binary"),
    ]);

    try {
      await access(this.modelPath);
    } catch {
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

async function ensureBinaryAccessible(binary: string, label: string): Promise<void> {
  try {
    await execFileAsync("which", [binary], {
      env: process.env,
      maxBuffer: 1024 * 1024,
    });
  } catch {
    throw new Error(`${label} "${binary}" não encontrado no PATH.`);
  }
}

function resolveModelPath(repoRoot: string, modelPath: string): string {
  if (path.isAbsolute(modelPath)) {
    return modelPath;
  }

  return path.join(repoRoot, modelPath);
}
