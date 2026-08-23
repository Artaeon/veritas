import assert from "node:assert/strict";
import test from "node:test";
import { compile } from "../src/compiler.js";
import { evaluate } from "../src/runtime.js";

function run(source: string, query: string) {
  const compiled = compile(source, "semantics.vk");
  assert.ok(compiled.knowledge, JSON.stringify(compiled.diagnostics));
  return evaluate(compiled.knowledge, query);
}

const personSchema = [
  "bundle open_world@0.1.0",
  "type Person",
  "attribute Person.age: Integer",
  "predicate Person.adult",
  "entity john: Person",
];

test("open world: an unmet positive rule yields UNKNOWN, never implicit FALSE", () => {
  const result = run([...personSchema,
    "fact john.age = 17",
    "rule adult($p: Person):",
    "  when $p.age >= 18",
    "  derive $p.adult = true",
    "end",
  ].join("\n"), "john.adult");
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.value, undefined);
  assert.deepEqual(result.proofIds, []);
});

test("explicit counter-rule is required to derive FALSE", () => {
  const result = run([...personSchema,
    "fact john.age = 17",
    "rule adult($p: Person):",
    "  when $p.age >= 18",
    "  derive $p.adult = true",
    "end",
    "rule not_adult($p: Person):",
    "  when $p.age < 18",
    "  derive $p.adult = false",
    "end",
  ].join("\n"), "john.adult");
  assert.equal(result.status, "FALSE");
  assert.equal(result.value?.value, false);
});

test("TRUE FALSE UNKNOWN and CONFLICT are distinct and exhaustive for predicates", () => {
  const base = [
    "bundle truth@0.1.0",
    "type Item",
    "predicate Item.state",
    "entity true_item: Item",
    "entity false_item: Item",
    "entity unknown_item: Item",
    "entity conflict_item: Item",
    "fact true_item.state = true",
    "fact false_item.state = false",
    "fact conflict_item.state = true",
    "fact conflict_item.state = false",
  ].join("\n");
  assert.equal(run(base, "true_item.state").status, "TRUE");
  assert.equal(run(base, "false_item.state").status, "FALSE");
  assert.equal(run(base, "unknown_item.state").status, "UNKNOWN");
  assert.equal(run(base, "conflict_item.state").status, "CONFLICT");
});

test("inequality does not implement negation-as-failure", () => {
  const result = run([
    "bundle negation@0.1.0",
    "type Item",
    "predicate Item.input",
    "predicate Item.output",
    "entity item: Item",
    "rule inequality($x: Item):",
    "  when $x.input != false",
    "  derive $x.output = true",
    "end",
  ].join("\n"), "item.output");
  assert.equal(result.status, "UNKNOWN");
});

test("conflicting evidence propagates both supported branches", () => {
  const result = run([
    "bundle conflict_propagation@0.1.0",
    "type Item",
    "predicate Item.input",
    "predicate Item.output",
    "entity item: Item",
    "fact item.input = true",
    "fact item.input = false",
    "rule positive($x: Item):",
    "  when $x.input = true",
    "  derive $x.output = true",
    "end",
    "rule negative($x: Item):",
    "  when $x.input = false",
    "  derive $x.output = false",
    "end",
  ].join("\n"), "item.output");
  assert.equal(result.status, "CONFLICT");
  assert.equal(result.proofIds.length, 2);
});

test("late and initial conflicts have the same downstream evidence semantics", () => {
  const late = run([
    "bundle late_conflict@0.1.0",
    "type Item",
    "predicate Item.seed",
    "predicate Item.input",
    "predicate Item.output",
    "entity item: Item",
    "fact item.seed = true",
    "fact item.input = true",
    "rule derive_negative_input($x: Item):",
    "  when $x.seed = true",
    "  derive $x.input = false",
    "end",
    "rule positive_output($x: Item):",
    "  when $x.input = true",
    "  derive $x.output = true",
    "end",
    "rule negative_output($x: Item):",
    "  when $x.input = false",
    "  derive $x.output = false",
    "end",
  ].join("\n"), "item.output");
  assert.equal(late.status, "CONFLICT");
  assert.equal(late.proofIds.length, 2);
});

test("conflicting numeric values can propagate contrary classifications", () => {
  const result = run([
    "bundle numeric_conflict@0.1.0",
    "type Sensor",
    "attribute Sensor.reading: Integer",
    "predicate Sensor.high",
    "entity sensor: Sensor",
    "fact sensor.reading = 5",
    "fact sensor.reading = 20",
    "rule high($x: Sensor):",
    "  when $x.reading >= 10",
    "  derive $x.high = true",
    "end",
    "rule low($x: Sensor):",
    "  when $x.reading < 10",
    "  derive $x.high = false",
    "end",
  ].join("\n"), "sensor.high");
  assert.equal(result.status, "CONFLICT");
});
