import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";

test("fresh processes produce byte-identical hash, result, proof, and formatting", () => {
  const worker = join(process.cwd(), "dist", "tests", "process-worker.js");
  const input = join(process.cwd(), "tests", "fixtures", "valid", "09-recursion.vk");
  const outputs: string[] = [];
  for (let index = 0; index < 12; index += 1) {
    const child = spawnSync(process.execPath, [worker, input, "seeded.c"], { encoding: "utf8", env: { ...process.env, LANG: index % 2 === 0 ? "C" : "de_AT.UTF-8" } });
    assert.equal(child.status, 0, child.stderr);
    outputs.push(child.stdout);
  }
  assert.ok(outputs[0]?.length);
  assert.ok(outputs.every((output) => output === outputs[0]));
});

test("separate CLI processes produce byte-identical output", () => {
  const cli = join(process.cwd(), "dist", "src", "cli.js");
  const input = join(process.cwd(), "examples", "people.vk");
  const first = spawnSync(process.execPath, [cli, "explain", input, "john.adult"], { encoding: "utf8" });
  const second = spawnSync(process.execPath, [cli, "explain", input, "john.adult"], { encoding: "utf8" });
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(second.stdout, first.stdout);
});
