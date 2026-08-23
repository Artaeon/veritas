import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { compile } from "../src/compiler.js";
import { verifyProof } from "../src/proof.js";
import { evaluate } from "../src/runtime.js";

test("unseen electrical-protection domain works using knowledge code only", async () => {
  const path = join(process.cwd(), "examples", "electrical-protection.vk");
  const compiled = compile(await readFile(path, "utf8"), path);
  assert.ok(compiled.knowledge, JSON.stringify(compiled.diagnostics));

  const workshop = evaluate(compiled.knowledge, "workshop_branch.trip_required");
  const lightingOvercurrent = evaluate(compiled.knowledge, "lighting_branch.overcurrent");
  const lightingTrip = evaluate(compiled.knowledge, "lighting_branch.trip_required");
  const unmeasured = evaluate(compiled.knowledge, "unmeasured_branch.trip_required");

  assert.equal(workshop.status, "TRUE");
  assert.equal(lightingOvercurrent.status, "FALSE");
  assert.equal(lightingTrip.status, "UNKNOWN");
  assert.equal(unmeasured.status, "UNKNOWN");
  assert.deepEqual(verifyProof(compiled.knowledge, workshop), { valid: true, errors: [] });

  const sourceFiles = (await readdir(join(process.cwd(), "src"))).filter((name) => name.endsWith(".ts"));
  const kernelText = (await Promise.all(sourceFiles.map((name) => readFile(join(process.cwd(), "src", name), "utf8")))).join("\n");
  for (const domainTerm of ["Circuit", "voltage", "current", "overcurrent", "trip_required", "workshop_branch"]) {
    assert.equal(kernelText.includes(domainTerm), false, `Kernel contains domain term: ${domainTerm}`);
  }
});
