import assert from "node:assert/strict";
import test from "node:test";
import { canonicalStringify } from "../src/canonical.js";
import { compile } from "../src/compiler.js";

test("canonical object serialization ignores insertion order recursively", () => {
  const first = { z: 1, nested: { b: 2, a: 1 }, a: [3, { y: true, x: false }] };
  const second = { a: [3, { x: false, y: true }], nested: { a: 1, b: 2 }, z: 1 };
  assert.equal(canonicalStringify(first), canonicalStringify(second));
});

test("semantically unordered declarations and conjunctions hash identically", () => {
  const first = [
    "bundle canonical@0.1.0",
    "type Item",
    "attribute Item.a: Integer",
    "attribute Item.b: Integer",
    "predicate Item.result",
    "entity item: Item",
    "fact item.a = 1",
    "fact item.b = 2",
    "rule classify($x: Item):",
    "  when $x.a = 1",
    "  and $x.b = 2",
    "  derive $x.result = true",
    "end",
  ].join("\n");
  const second = [
    "# declarations and conjunctions deliberately reordered",
    "bundle canonical@0.1.0",
    "type Item",
    "predicate Item.result",
    "attribute Item.b: Integer",
    "attribute Item.a: Integer",
    "entity item: Item",
    "fact item.b = 2",
    "fact item.a = 1",
    "rule classify($x: Item):",
    "  when $x.b = 2",
    "  and $x.a = 1",
    "  derive $x.result = true",
    "end",
  ].join("\n");
  const a = compile(first, "a.vk").knowledge!;
  const b = compile(second, "b.vk").knowledge!;
  assert.equal(a.canonicalHash, b.canonicalHash);
});

test("meaningful semantic changes change the hash", () => {
  const source = (threshold: number) => [
    "bundle canonical@0.1.0", "type Item", "attribute Item.value: Integer", "predicate Item.result", "entity item: Item",
    "rule classify($x: Item):", `  when $x.value >= ${threshold}`, "  derive $x.result = true", "end",
  ].join("\n");
  assert.notEqual(compile(source(10)).knowledge!.canonicalHash, compile(source(11)).knowledge!.canonicalHash);
});

test("verified IR is deeply immutable after hashing", () => {
  const knowledge = compile([
    "bundle immutable@0.1.0", "type Item", "predicate Item.ready", "entity item: Item", "fact item.ready = true",
  ].join("\n")).knowledge!;
  assert.equal(Object.isFrozen(knowledge), true);
  assert.equal(Object.isFrozen(knowledge.facts), true);
  assert.equal(Object.isFrozen(knowledge.facts[0]), true);
  assert.equal(Object.isFrozen(knowledge.facts[0]?.value), true);
  assert.throws(() => {
    (knowledge.facts[0]!.value as { value: boolean }).value = false;
  }, TypeError);
});
