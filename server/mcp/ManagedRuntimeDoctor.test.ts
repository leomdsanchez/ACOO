import test from "node:test";
import assert from "node:assert/strict";
import { getManagedRuntimeDoctorCommand } from "./ManagedRuntimeDoctor.js";

test("returns the official doctor command for playwright", () => {
  assert.equal(
    getManagedRuntimeDoctorCommand("playwright"),
    "npm run server:mcp -- doctor playwright --pretty",
  );
});

test("returns null for runtimes without a doctor command", () => {
  assert.equal(getManagedRuntimeDoctorCommand("notion"), null);
});
