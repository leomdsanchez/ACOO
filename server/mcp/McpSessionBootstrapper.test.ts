import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { McpSessionBootstrapper } from "./McpSessionBootstrapper.js";

test("autostart failure is normalized as a broken runtime result", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "acoo-bootstrapper-"));
  try {
    const bootstrapper = new McpSessionBootstrapper(
      {
        get: () => ({
          autostart: true,
          doctorCommand: "npm run server:mcp -- doctor playwright --pretty",
          healthcheckCommand: null,
          healthcheckUrl: "http://127.0.0.1:9222/json/version",
          name: "playwright",
          startupCommand: "/bin/false",
        }),
        list: () => [],
      } as never,
      repoRoot,
    );
    (bootstrapper as unknown as { checkHealth: () => Promise<boolean> }).checkHealth = async () => false;

    const [result] = await bootstrapper.ensureReady(["playwright"]);

    assert.equal(result.healthy, false);
    assert.equal(result.manualStartRequired, false);
    assert.equal(result.state, "broken");
    assert.equal(result.failureStage, "startup_command");
    assert.match(result.errorMessage ?? "", /Command failed/);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("concurrent autostart shares a single launcher attempt", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "acoo-bootstrapper-"));
  const countFile = path.join(repoRoot, "startup-count.txt");
  try {
    const bootstrapper = new McpSessionBootstrapper(
      {
        get: () => ({
          autostart: true,
          doctorCommand: "npm run server:mcp -- doctor playwright --pretty",
          healthcheckCommand: null,
          healthcheckUrl: "http://127.0.0.1:9222/json/version",
          name: "playwright",
          startupCommand: `node -e "const fs=require('node:fs'); const p='${countFile}'; let n=0; try{n=Number(fs.readFileSync(p,'utf8'))}catch{} fs.writeFileSync(p,String(n+1));"`,
        }),
        list: () => [],
      } as never,
      repoRoot,
    );
    (bootstrapper as unknown as { checkHealth: () => Promise<boolean> }).checkHealth = async () => false;
    (bootstrapper as unknown as { waitForHealthy: () => Promise<boolean> }).waitForHealthy = async () => true;

    const [first, second] = await Promise.all([
      bootstrapper.ensureReady(["playwright"]),
      bootstrapper.ensureReady(["playwright"]),
    ]);

    assert.equal(first[0].state, "ready");
    assert.equal(second[0].state, "ready");
    assert.equal(await readFile(countFile, "utf8"), "1");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});
