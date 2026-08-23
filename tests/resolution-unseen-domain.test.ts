import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { compile } from "../src/compiler.js";
import { resolve } from "../src/resolver.js";

test("unseen board-game domain resolves missing information without kernel vocabulary", async () => {
  const path = join(process.cwd(), "examples", "board-game-resolution.vk");
  const compiled = compile(await readFile(path, "utf8"), path);
  assert.ok(compiled.knowledge, JSON.stringify(compiled.diagnostics));

  const alpha = resolve(compiled.knowledge, "move_allowed(turn_alpha)");
  assert.equal(alpha.resolutionState, "RESOLVABLE");
  assert.deepEqual(alpha.minimalBlockerSets, [["turn_alpha.bonus_card"], ["turn_alpha.path_clear"]]);
  assert.deepEqual(alpha.blockers.map((blocker) => [blocker.id, blocker.valueType]), [
    ["turn_alpha.bonus_card", "Boolean"],
    ["turn_alpha.path_clear", "Boolean"],
  ]);

  const blocked = resolve(compiled.knowledge, "move_allowed(turn_blocked)");
  assert.equal(blocked.resolutionState, "RESOLVABLE");
  assert.deepEqual(blocked.minimalBlockerSets, [["turn_blocked.bonus_card"]]);
  assert.deepEqual(blocked.irrelevantUnknowns.map((blocker) => blocker.id), ["turn_blocked.path_clear"]);

  const sourceFiles = (await readdir(join(process.cwd(), "src"))).filter((name) => name.endsWith(".ts"));
  const kernelText = (await Promise.all(sourceFiles.map((name) => readFile(join(process.cwd(), "src", name), "utf8")))).join("\n");
  for (const term of ["Turn", "roll", "has_piece", "path_clear", "bonus_card", "move_allowed", "turn_alpha"]) {
    assert.equal(kernelText.includes(term), false, `Kernel contains unseen-domain term: ${term}`);
  }
});
