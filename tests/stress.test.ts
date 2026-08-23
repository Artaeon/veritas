import assert from "node:assert/strict";
import test from "node:test";
import { compile } from "../src/compiler.js";
import { evaluate } from "../src/runtime.js";
import { verifyProof } from "../src/proof.js";

function compileOk(source: string) {
  const result = compile(source, "stress.vk");
  assert.ok(result.knowledge, JSON.stringify(result.diagnostics));
  return result.knowledge;
}

test("a 300-rule chain reaches the least fixpoint with a complete proof", () => {
  const length = 300;
  const source = [
    "bundle long_chain@0.1.0",
    "type Node",
    ...Array.from({ length: length + 1 }, (_, index) => `predicate Node.p${index}`),
    "entity node: Node",
    "fact node.p0 = true",
    ...Array.from({ length }, (_, index) => [
      `rule step_${String(index).padStart(3, "0")}($x: Node):`,
      `  when $x.p${index} = true`,
      `  derive $x.p${index + 1} = true`,
      "end",
    ].join("\n")),
  ].join("\n");
  const knowledge = compileOk(source);
  const result = evaluate(knowledge, `node.p${length}`);
  assert.equal(result.status, "TRUE");
  assert.equal(result.proofs.length, length + 1);
  assert.deepEqual(verifyProof(knowledge, result), { valid: true, errors: [] });
});

test("large seeded and unseeded cycles terminate at the correct fixpoint", () => {
  const length = 200;
  const source = [
    "bundle large_cycle@0.1.0",
    "type Node",
    ...Array.from({ length }, (_, index) => `predicate Node.p${index}`),
    "entity seeded: Node",
    "entity empty: Node",
    "fact seeded.p0 = true",
    ...Array.from({ length }, (_, index) => [
      `rule cycle_${String(index).padStart(3, "0")}($x: Node):`,
      `  when $x.p${index} = true`,
      `  derive $x.p${(index + 1) % length} = true`,
      "end",
    ].join("\n")),
  ].join("\n");
  const knowledge = compileOk(source);
  assert.equal(evaluate(knowledge, `seeded.p${length - 1}`).status, "TRUE");
  assert.equal(evaluate(knowledge, `empty.p${length - 1}`).status, "UNKNOWN");
});

test("many entities, facts, and rules remain semantically isolated", () => {
  const entities = 100;
  const depth = 30;
  const source = [
    "bundle broad_stress@0.1.0",
    "type Item",
    ...Array.from({ length: depth + 1 }, (_, index) => `predicate Item.p${index}`),
    ...Array.from({ length: entities }, (_, index) => `entity item_${index}: Item`),
    ...Array.from({ length: entities }, (_, index) => `fact item_${index}.p0 = ${index % 2 === 0 ? "true" : "false"}`),
    ...Array.from({ length: depth }, (_, index) => [
      `rule broad_${String(index).padStart(2, "0")}($x: Item):`,
      `  when $x.p${index} = true`,
      `  derive $x.p${index + 1} = true`,
      "end",
    ].join("\n")),
  ].join("\n");
  const knowledge = compileOk(source);
  assert.equal(evaluate(knowledge, `item_98.p${depth}`).status, "TRUE");
  assert.equal(evaluate(knowledge, `item_99.p${depth}`).status, "UNKNOWN");
});

test("a 100-level conflict chain propagates both branches and terminates", () => {
  const depth = 100;
  const source = [
    "bundle conflict_chain@0.1.0",
    "type Item",
    ...Array.from({ length: depth + 1 }, (_, index) => `predicate Item.p${index}`),
    "entity item: Item",
    "fact item.p0 = true",
    "fact item.p0 = false",
    ...Array.from({ length: depth }, (_, index) => [
      `rule positive_${String(index).padStart(3, "0")}($x: Item):`,
      `  when $x.p${index} = true`,
      `  derive $x.p${index + 1} = true`,
      "end",
      `rule negative_${String(index).padStart(3, "0")}($x: Item):`,
      `  when $x.p${index} = false`,
      `  derive $x.p${index + 1} = false`,
      "end",
    ].join("\n")),
  ].join("\n");
  const result = evaluate(compileOk(source), `item.p${depth}`);
  assert.equal(result.status, "CONFLICT");
  assert.equal(result.proofIds.length, 2);
  assert.equal(result.proofs.length, (depth + 1) * 2);
});
