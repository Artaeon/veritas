import assert from "node:assert/strict";
import test from "node:test";
import { compile } from "../src/compiler.js";
import { V01_LIMITS } from "../src/limits.js";
import { evaluate } from "../src/runtime.js";

test("representative malformed and hostile tokens fail without throwing", () => {
  const cases = [
    "\0\0\0",
    "((((((((((((((((((((((((((((((((((((((((",
    "bundle x@0.1.0\ntype Pérson",
    "bundle x@0.1.0\n💥 💥 💥",
    "bundle x@0.1.0\nrule x($x: T):\nwhen (((((((\nend",
    "bundle x@0.1.0\n\u202eentity item: Thing",
    "bundle x@0.1.0\nfact . =",
    "bundle x@0.1.0\ntype __proto__\nentity constructor: __proto__",
    "bundle x@0.1.0\nattribute A.b: Integer\n" + "9".repeat(10_000),
  ];
  for (const source of cases) {
    assert.doesNotThrow(() => compile(source, "hostile.vk"));
    assert.deepEqual(compile(source, "hostile.vk"), compile(source, "hostile.vk"));
  }
});

test("deterministic malformed-input corpus never crashes or exceeds diagnostic cap", () => {
  let state = 0x12345678;
  const alphabet = "abcXYZ019_:$@.=!<>#()[]{} \t\n\"\\💥é\0";
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
  for (let sample = 0; sample < 300; sample += 1) {
    const length = next() % 2_000;
    let source = "";
    for (let index = 0; index < length; index += 1) source += alphabet[next() % alphabet.length];
    const first = compile(source, "fuzz.vk");
    const second = compile(source, "fuzz.vk");
    assert.deepEqual(second, first);
    assert.ok(first.diagnostics.length <= V01_LIMITS.maxDiagnostics);
  }
});

test("source, line, declaration, condition, and numeric limits fail explicitly", () => {
  const oversized = "x".repeat(V01_LIMITS.maxSourceBytes + 1);
  assert.equal(compile(oversized).diagnostics[0]?.code, "VK001");

  const tooManyLines = Array.from({ length: V01_LIMITS.maxLines + 1 }, () => "#").join("\n");
  assert.equal(compile(tooManyLines).diagnostics[0]?.code, "VK002");

  const longLine = `type ${"a".repeat(V01_LIMITS.maxLineCodeUnits)}`;
  assert.ok(compile(`bundle limits@0.1.0\n${longLine}`).diagnostics.some((diagnostic) => diagnostic.code === "VK003"));

  const declarations = ["bundle declarations@0.1.0", ...Array.from({ length: V01_LIMITS.maxDeclarations + 1 }, (_, index) => `type T${index}`)].join("\n");
  assert.ok(compile(declarations).diagnostics.some((diagnostic) => diagnostic.code === "VK004"));

  const conditions = [
    "bundle conditions@0.1.0",
    "type T",
    "predicate T.p",
    "predicate T.out",
    "rule too_many($x: T):",
    "  when $x.p = true",
    ...Array.from({ length: V01_LIMITS.maxConditionsPerRule }, () => "  and $x.p = true"),
    "  derive $x.out = true",
    "end",
  ].join("\n");
  assert.ok(compile(conditions).diagnostics.some((diagnostic) => diagnostic.code === "VK005"));
});

test("valid Unicode strings round-trip while unpaired surrogates are rejected", () => {
  const valid = compile([
    "bundle unicode@0.1.0",
    "type Message",
    "attribute Message.text: String",
    "entity message: Message",
    'fact message.text = "Grüße 🌍 日本語"',
  ].join("\n"));
  assert.ok(valid.knowledge);
  assert.equal(evaluate(valid.knowledge, "message.text").value?.value, "Grüße 🌍 日本語");

  const invalid = compile([
    "bundle unicode@0.1.0",
    "type Message",
    "attribute Message.text: String",
    "entity message: Message",
    'fact message.text = "\\ud800"',
  ].join("\n"));
  assert.equal(invalid.knowledge, undefined);
  assert.ok(invalid.diagnostics.some((diagnostic) => diagnostic.code === "VK209"));
});

test("grammar ordering is enforced instead of accepted ambiguously", () => {
  const lateHeader = compile("type Thing\nbundle late@0.1.0");
  assert.ok(lateHeader.diagnostics.some((diagnostic) => diagnostic.code === "VK103"));

  const malformedRules = [
    ["and_first", "  and $x.input = true", "  derive $x.output = true"],
    ["second_when", "  when $x.input = true", "  when $x.input = true", "  derive $x.output = true"],
    ["effect_first", "  derive $x.output = true", "  when $x.input = true"],
  ];
  for (const [name, ...body] of malformedRules) {
    const result = compile([
      "bundle grammar@0.1.0", "type Item", "predicate Item.input", "predicate Item.output",
      `rule ${name}($x: Item):`, ...body, "end",
    ].join("\n"));
    assert.equal(result.knowledge, undefined, name);
  }
});

test("a large valid flat bundle compiles and queries without recursion overflow", () => {
  const count = 1_500;
  const source = [
    "bundle large_flat@0.1.0",
    "type Item",
    "attribute Item.value: Integer",
    ...Array.from({ length: count }, (_, index) => `entity item_${index}: Item`),
    ...Array.from({ length: count }, (_, index) => `fact item_${index}.value = ${index}`),
  ].join("\n");
  const compiled = compile(source, "large.vk");
  assert.ok(compiled.knowledge, JSON.stringify(compiled.diagnostics));
  assert.equal(evaluate(compiled.knowledge, "item_1499.value").value?.value, "1499");
});
