import assert from "node:assert/strict";
import test from "node:test";
import { compile } from "../src/compiler.js";
import { V01_LIMITS } from "../src/limits.js";
import { evaluate } from "../src/runtime.js";

function compileOk(lines: string[]) {
  const result = compile(lines.join("\n"), "numeric.vk");
  assert.ok(result.knowledge, JSON.stringify(result.diagnostics));
  return result.knowledge;
}

test("arbitrary-precision integers compare beyond IEEE-754 range", () => {
  const huge = "9".repeat(300);
  const threshold = `${"9".repeat(299)}8`;
  const knowledge = compileOk([
    "bundle huge_integer@0.1.0",
    "type Counter",
    "attribute Counter.value: Integer",
    "predicate Counter.above",
    "entity counter: Counter",
    `fact counter.value = ${huge}`,
    "rule classify($x: Counter):",
    `  when $x.value > ${threshold}`,
    "  derive $x.above = true",
    "end",
  ]);
  assert.equal(evaluate(knowledge, "counter.above").status, "TRUE");
  assert.equal(evaluate(knowledge, "counter.value").value?.value, huge);
});

test("finite decimals compare exactly at long precision boundaries", () => {
  const lower = `0.${"0".repeat(299)}1`;
  const higher = `0.${"0".repeat(299)}2`;
  const knowledge = compileOk([
    "bundle exact_decimal@0.1.0",
    "type Measure",
    "attribute Measure.value: Decimal",
    "predicate Measure.above",
    "entity measure: Measure",
    `fact measure.value = ${higher}`,
    "rule classify($x: Measure):",
    `  when $x.value > ${lower}`,
    "  derive $x.above = true",
    "end",
  ]);
  assert.equal(evaluate(knowledge, "measure.above").status, "TRUE");
});

test("decimal canonicalization removes redundant zeroes without changing type", () => {
  const first = compileOk([
    "bundle decimal_identity@0.1.0",
    "type Measure",
    "attribute Measure.value: Decimal",
    "entity measure: Measure",
    "fact measure.value = +001.0000",
  ]);
  const second = compileOk([
    "bundle decimal_identity@0.1.0",
    "type Measure",
    "attribute Measure.value: Decimal",
    "entity measure: Measure",
    "fact measure.value = 1.0",
  ]);
  assert.equal(first.canonicalHash, second.canonicalHash);
  assert.equal(first.facts[0]?.value.value, "1.0");
});

test("negative decimal, negative zero, and integer zero are canonical", () => {
  const knowledge = compileOk([
    "bundle signs@0.1.0",
    "type Measure",
    "attribute Measure.negative: Decimal",
    "attribute Measure.zero: Decimal",
    "attribute Measure.integer_zero: Integer",
    "entity measure: Measure",
    "fact measure.negative = -999999999999999999999.000000000000000001",
    "fact measure.zero = -0.0000",
    "fact measure.integer_zero = -0",
  ]);
  assert.equal(evaluate(knowledge, "measure.zero").value?.value, "0.0");
  assert.equal(evaluate(knowledge, "measure.integer_zero").value?.value, "0");
  assert.equal(evaluate(knowledge, "measure.negative").value?.value, "-999999999999999999999.000000000000000001");
});

test("numeric exponent notation, NaN, and infinity are rejected", () => {
  for (const value of ["1e3", "NaN", "Infinity", "-Infinity"]) {
    const result = compile([
      "bundle invalid_numeric@0.1.0",
      "type Measure",
      "attribute Measure.value: Decimal",
      "entity measure: Measure",
      `fact measure.value = ${value}`,
    ].join("\n"));
    assert.equal(result.knowledge, undefined, value);
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "VK209"));
  }
});

test("numeric digit ceiling is deterministic", () => {
  const accepted = "9".repeat(V01_LIMITS.maxNumericDigits);
  const rejected = "9".repeat(V01_LIMITS.maxNumericDigits + 1);
  assert.ok(compileOk([
    "bundle accepted_limit@0.1.0", "type N", "attribute N.value: Integer", "entity n: N", `fact n.value = ${accepted}`,
  ]));
  const result = compile([
    "bundle rejected_limit@0.1.0", "type N", "attribute N.value: Integer", "entity n: N", `fact n.value = ${rejected}`,
  ].join("\n"));
  assert.equal(result.knowledge, undefined);
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "VK215"));
});

test("calendar validity is checked and Duration ordering is rejected", () => {
  const validLeap = compileOk([
    "bundle dates@0.1.0", "type Event", "attribute Event.day: Date", "entity event: Event", "fact event.day = @2024-02-29",
  ]);
  assert.equal(evaluate(validLeap, "event.day").value?.value, "2024-02-29");

  const invalidDate = compile([
    "bundle dates@0.1.0", "type Event", "attribute Event.day: Date", "entity event: Event", "fact event.day = @2023-02-29",
  ].join("\n"));
  assert.equal(invalidDate.knowledge, undefined);

  const durationOrder = compile([
    "bundle durations@0.1.0",
    "type Event",
    "attribute Event.wait: Duration",
    "predicate Event.long",
    "rule invalid($x: Event):",
    "  when $x.wait > P1D",
    "  derive $x.long = true",
    "end",
  ].join("\n"));
  assert.equal(durationOrder.knowledge, undefined);
  assert.ok(durationOrder.diagnostics.some((diagnostic) => diagnostic.code === "VK214"));

  const malformedDuration = compile([
    "bundle durations@0.1.0", "type Event", "attribute Event.wait: Duration", "entity event: Event", "fact event.wait = P1DT",
  ].join("\n"));
  assert.equal(malformedDuration.knowledge, undefined);
});
