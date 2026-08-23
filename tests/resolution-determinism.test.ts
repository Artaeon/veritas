import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";

test("resolution trace is byte-identical across fresh processes and locales", () => {
  const worker = join(process.cwd(), "dist", "tests", "resolution-process-worker.js");
  const input = join(process.cwd(), "examples", "board-game-resolution.vk");
  const outputs: string[] = [];
  for (let index = 0; index < 12; index += 1) {
    const child = spawnSync(process.execPath, [worker, input, "move_allowed(turn_alpha)"], {
      encoding: "utf8",
      env: { ...process.env, LANG: index % 2 === 0 ? "C" : "de_AT.UTF-8" },
    });
    assert.equal(child.status, 0, child.stderr);
    outputs.push(child.stdout);
  }
  assert.ok(outputs[0]?.length);
  assert.ok(outputs.every((output) => output === outputs[0]));
});

test("human and machine-readable CLI resolution are stable", () => {
  const cli = join(process.cwd(), "dist", "src", "cli.js");
  const input = join(process.cwd(), "examples", "board-game-resolution.vk");
  const humanA = spawnSync(process.execPath, [cli, "resolve", input, "move_allowed(turn_alpha)"], { encoding: "utf8" });
  const humanB = spawnSync(process.execPath, [cli, "resolve", input, "move_allowed(turn_alpha)"], { encoding: "utf8" });
  const machine = spawnSync(process.execPath, [cli, "resolve", input, "move_allowed(turn_alpha)", "--json"], { encoding: "utf8" });
  assert.equal(humanA.status, 0, humanA.stderr);
  assert.equal(humanB.stdout, humanA.stdout);
  assert.equal(machine.status, 0, machine.stderr);
  const parsed = JSON.parse(machine.stdout) as { resolutionState: string; blockers: unknown[] };
  assert.equal(parsed.resolutionState, "RESOLVABLE");
  assert.ok(Array.isArray(parsed.blockers));
});
