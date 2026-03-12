import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(repoRoot, ".env") });

const services = [
  {
    args: ["run", "dev:ui"],
    enabled: true,
    name: "ui",
  },
  {
    args: ["run", "dev:telegram"],
    enabled: isEnabled(process.env.ACOO_TELEGRAM_ENABLED),
    name: "telegram",
  },
];

const running = services
  .filter((service) => service.enabled)
  .map((service) => startService(service.name, service.args));

if (running.length === 0) {
  process.stderr.write("Nenhum serviço de desenvolvimento habilitado.\n");
  process.exit(1);
}

let shuttingDown = false;

for (const child of running) {
  child.process.on("exit", (code, signal) => {
    if (!shuttingDown) {
      const detail = signal ? `signal ${signal}` : `code ${code ?? 0}`;
      process.stderr.write(`[${child.name}] terminou com ${detail}\n`);
      shutdown(code ?? 1);
    }
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function startService(name, args) {
  const child = spawn("npm", args, {
    cwd: repoRoot,
    env: process.env,
    stdio: ["inherit", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(prefixLines(name, String(chunk)));
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(prefixLines(name, String(chunk)));
  });

  return {
    name,
    process: child,
  };
}

function shutdown(exitCode) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  for (const child of running) {
    if (!child.process.killed) {
      child.process.kill("SIGINT");
    }
  }

  setTimeout(() => process.exit(exitCode), 150);
}

function prefixLines(name, output) {
  return output
    .split("\n")
    .map((line) => (line ? `[${name}] ${line}` : line))
    .join("\n");
}

function isEnabled(value) {
  if (!value) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}
