import { createOperationalRuntime } from "../bootstrap.js";
import { ApiServerLock } from "../api/ApiServerLock.js";
import { HttpServer } from "../api/HttpServer.js";

async function main() {
  const runtime = createOperationalRuntime();
  const lock = new ApiServerLock(runtime.config.repoRoot);
  const server = new HttpServer({
    host: runtime.config.api.host,
    port: runtime.config.api.port,
    runtime,
  });

  await lock.acquire();
  try {
    await server.start();
  } catch (error) {
    await lock.release().catch(() => undefined);
    throw error;
  }
  process.stdout.write(
    `ACOO API online em http://${runtime.config.api.host}:${runtime.config.api.port}\n`,
  );

  const shutdown = async (exitCode: number) => {
    await server.close().catch(() => undefined);
    await lock.release().catch(() => undefined);
    process.exit(exitCode);
  };

  process.once("SIGINT", () => {
    void shutdown(130);
  });
  process.once("SIGTERM", () => {
    void shutdown(143);
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
