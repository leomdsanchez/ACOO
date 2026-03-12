import { config as loadDotEnv } from "dotenv";
import path from "node:path";

let loaded = false;

export function ensureEnvironmentLoaded(repoRoot: string): void {
  if (loaded) {
    return;
  }

  loadDotEnv({
    path: path.join(repoRoot, ".env"),
    quiet: true,
    override: false,
  });
  loaded = true;
}
