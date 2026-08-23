import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { compile } from "../src/compiler.js";
import type { QueryResult } from "../src/model.js";
import { verifyProof } from "../src/proof.js";
import { evaluate } from "../src/runtime.js";

const fixture = join(process.cwd(), "tests", "fixtures", "valid");

async function load(name: string) {
  const path = join(fixture, name);
  const result = compile(await readFile(path, "utf8"), path);
  assert.ok(result.knowledge);
  return result.knowledge;
}

test("independent checker validates asserted, derived, recursive, unknown, and conflict proofs", async () => {
  const cases: Array<[string, string]> = [
    ["02-integer.vk", "item.count"],
    ["05-explicit-false.vk", "feature.enabled"],
    ["06-adult.vk", "john.adult"],
    ["08-conjunction.vk", "incomplete.accepted"],
    ["09-recursion.vk", "seeded.c"],
    ["10-conflict.vk", "item.decision"],
  ];
  for (const [file, query] of cases) {
    const knowledge = await load(file);
    const verification = verifyProof(knowledge, evaluate(knowledge, query));
    assert.deepEqual(verification, { valid: true, errors: [] }, `${file}: ${verification.errors.join("; ")}`);
  }
});

test("checker rejects a fabricated observed premise", async () => {
  const knowledge = await load("06-adult.vk");
  const result = evaluate(knowledge, "john.adult");
  const tampered = structuredClone(result) as QueryResult;
  const derived = tampered.proofs.find((proof) => proof.kind === "derived");
  assert.ok(derived?.kind === "derived");
  (derived.conditions[0] as { observed: { type: "Integer"; value: string } }).observed = { type: "Integer", value: "17" };
  const verification = verifyProof(knowledge, tampered);
  assert.equal(verification.valid, false);
  assert.ok(verification.errors.some((error) => error.includes("does not prove the observed premise")));
});

test("checker rejects missing support, wrong effects, cycles, and unreachable narration", async () => {
  const knowledge = await load("09-recursion.vk");
  const original = evaluate(knowledge, "seeded.c");

  const missing = structuredClone(original) as QueryResult;
  (missing.proofs as Array<(typeof missing.proofs)[number]>).splice(0, 1);
  assert.equal(verifyProof(knowledge, missing).valid, false);

  const wrong = structuredClone(original) as QueryResult;
  const root = wrong.proofs.find((proof) => proof.id === wrong.proofIds[0]);
  assert.ok(root);
  (root.conclusion as { property: string }).property = "a";
  assert.equal(verifyProof(knowledge, wrong).valid, false);

  const cyclic = structuredClone(original) as QueryResult;
  const derived = cyclic.proofs.find((proof) => proof.kind === "derived");
  assert.ok(derived?.kind === "derived");
  (derived.conditions[0] as { proofId: string }).proofId = derived.id;
  const cycleCheck = verifyProof(knowledge, cyclic);
  assert.equal(cycleCheck.valid, false);
  assert.ok(cycleCheck.errors.some((error) => error.includes("cycle")));

  const unreachable = structuredClone(original) as QueryResult;
  (unreachable.proofs as Array<(typeof unreachable.proofs)[number]>).push({
    kind: "asserted",
    id: "UNUSED",
    factId: knowledge.facts[0]!.id,
    conclusion: { entity: knowledge.facts[0]!.entity, property: knowledge.facts[0]!.property, value: knowledge.facts[0]!.value },
    source: knowledge.facts[0]!.source,
  });
  assert.ok(verifyProof(knowledge, unreachable).errors.some((error) => error.includes("Unreachable")));
});
