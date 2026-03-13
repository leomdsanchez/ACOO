import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(repoRoot, ".env") });

const services = [
  {
    args: ["run", "server:api"],
    enabled: true,
    name: "api",
    restartOnFailure: true,
  },
  {
    args: ["run", "dev:ui"],
    enabled: true,
    name: "ui",
    restartOnFailure: false,
  },
  {
    args: ["run", "dev:telegram"],
    enabled: isEnabled(process.env.ACOO_TELEGRAM_ENABLED),
    name: "telegram",
    restartOnFailure: true,
  },
];

const enabledServices = services.filter((service) => service.enabled);
const running = enabledServices.map((service) => startService(service));

if (running.length === 0) {
  process.stderr.write("Nenhum serviço de desenvolvimento habilitado.\n");
  process.exit(1);
}

let shuttingDown = false;

for (const child of running) {
  attachLifecycle(child);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function startService(service) {
  const child = spawn("npm", service.args, {
    cwd: repoRoot,
    env: process.env,
    stdio: ["inherit", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(prefixLines(service.name, String(chunk)));
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(prefixLines(service.name, String(chunk)));
  });

  return {
    attempts: 0,
    process: child,
    service,
  };
}

function attachLifecycle(child) {
  child.process.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    const detail = signal ? `signal ${signal}` : `code ${code ?? 0}`;
    process.stderr.write(`[${child.service.name}] terminou com ${detail}\n`);

    if (shouldRestart(child, code, signal)) {
      child.attempts += 1;
      const delayMs = Math.min(5_000, 1_000 * child.attempts);
      process.stderr.write(`[${child.service.name}] reiniciando em ${delayMs}ms\n`);
      setTimeout(() => {
        if (shuttingDown) {
          return;
        }
        const restarted = startService(child.service);
        child.process = restarted.process;
        attachLifecycle(child);
      }, delayMs);
      return;
    }

    shutdown(code ?? 1);
  });
}

function shouldRestart(child, code, signal) {
  if (!child.service.restartOnFailure) {
    return false;
  }

  if (signal === "SIGINT" || signal === "SIGTERM") {
    return false;
  }

  return (code ?? 1) !== 0;
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
