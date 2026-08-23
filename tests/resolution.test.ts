import assert from "node:assert/strict";
import test from "node:test";
import { compile } from "../src/compiler.js";
import { resolve } from "../src/resolver.js";
import { formatResolution } from "../src/format.js";

function compileOk(source: string) {
  const result = compile(source, "resolution.vk");
  assert.ok(result.knowledge, JSON.stringify(result.diagnostics));
  return result.knowledge;
}

test("nested SME dependency returns the unknown base fact and complete paths", () => {
  const knowledge = compileOk([
    "bundle sme_resolution@0.2.0",
    "type Company",
    "attribute Company.employee_count: Integer",
    "attribute Company.turnover: Decimal",
    "attribute Company.country: Symbol",
    "predicate Company.sme",
    "predicate Company.eligible",
    "entity acme: Company",
    "fact acme.employee_count = 12",
    "fact acme.country = AT",
    "rule classify_sme($company: Company):",
    "  when $company.employee_count <= 50",
    "  and $company.turnover <= 10000000.0",
    "  derive $company.sme = true",
    "end",
    "rule eligible_sme($company: Company):",
    "  when $company.sme = true",
    "  and $company.country = AT",
    "  derive $company.eligible = true",
    "end",
  ].join("\n"));
  const result = resolve(knowledge, "eligible(acme)");
  assert.equal(result.query, "acme.eligible");
  assert.equal(result.queryStatus, "UNKNOWN");
  assert.equal(result.resolutionState, "RESOLVABLE");
  assert.deepEqual(result.blockers.map((blocker) => [blocker.id, blocker.valueType]), [["acme.turnover", "Decimal"]]);
  assert.deepEqual(result.minimalBlockerSets, [["acme.turnover"]]);
  assert.equal(result.paths.length, 1);
  const smeDependency = result.paths[0]!.conditions.find((condition) => condition.property === "sme")?.dependency;
  assert.equal(smeDependency?.paths[0]?.conditions.find((condition) => condition.property === "employee_count")?.state, "SATISFIED");
  assert.equal(smeDependency?.paths[0]?.conditions.find((condition) => condition.property === "turnover")?.state, "UNKNOWN");
});

test("OR alternatives produce distinct subset-minimal blocker frontiers", () => {
  const knowledge = compileOk([
    "bundle alternatives@0.2.0",
    "type Case",
    "predicate Case.a",
    "predicate Case.b",
    "predicate Case.c",
    "predicate Case.result",
    "entity item: Case",
    "rule longer($x: Case):",
    "  when $x.a = true",
    "  and $x.b = true",
    "  derive $x.result = true",
    "end",
    "rule shorter($x: Case):",
    "  when $x.a = true",
    "  derive $x.result = true",
    "end",
    "rule alternative($x: Case):",
    "  when $x.c = true",
    "  derive $x.result = true",
    "end",
  ].join("\n"));
  const result = resolve(knowledge, "item.result");
  assert.deepEqual(result.minimalBlockerSets, [["item.a"], ["item.c"]]);
  assert.deepEqual(result.blockers.map((blocker) => blocker.id), ["item.a", "item.b", "item.c"]);
  assert.equal(result.paths.length, 3);
});

test("FALSE sibling makes unknowns on the same AND branch irrelevant", () => {
  const knowledge = compileOk([
    "bundle impossible_branch@0.2.0",
    "type Case",
    "predicate Case.enabled",
    "predicate Case.missing",
    "predicate Case.result",
    "entity item: Case",
    "fact item.enabled = false",
    "rule impossible($x: Case):",
    "  when $x.enabled = true",
    "  and $x.missing = true",
    "  derive $x.result = true",
    "end",
  ].join("\n"));
  const result = resolve(knowledge, "item.result");
  assert.equal(result.resolutionState, "UNRESOLVABLE");
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(result.irrelevantUnknowns.map((blocker) => blocker.id), ["item.missing"]);
  assert.equal(result.paths[0]?.state, "IMPOSSIBLE");
  assert.equal(result.paths[0]?.conditions.find((condition) => condition.property === "enabled")?.state, "FALSE");
  assert.equal(result.paths[0]?.conditions.find((condition) => condition.property === "missing")?.relevance, "IRRELEVANT");
});

test("pure recursion is unresolvable, while recursion with a finite exit is resolvable", () => {
  const pure = compileOk([
    "bundle pure_cycle@0.2.0",
    "type Node", "predicate Node.a", "predicate Node.b", "entity node: Node",
    "rule a_from_b($x: Node):", "  when $x.b = true", "  derive $x.a = true", "end",
    "rule b_from_a($x: Node):", "  when $x.a = true", "  derive $x.b = true", "end",
  ].join("\n"));
  const pureResult = resolve(pure, "node.a");
  assert.equal(pureResult.resolutionState, "UNRESOLVABLE");
  assert.equal(pureResult.trace?.state, "CYCLIC");
  assert.deepEqual(pureResult.blockers, []);

  const withExit = compileOk([
    "bundle cycle_exit@0.2.0",
    "type Node", "predicate Node.a", "predicate Node.b", "predicate Node.seed", "entity node: Node",
    "rule a_from_b($x: Node):", "  when $x.b = true", "  derive $x.a = true", "end",
    "rule b_from_a($x: Node):", "  when $x.a = true", "  derive $x.b = true", "end",
    "rule b_from_seed($x: Node):", "  when $x.seed = true", "  derive $x.b = true", "end",
  ].join("\n"));
  const exitResult = resolve(withExit, "node.a");
  assert.equal(exitResult.resolutionState, "RESOLVABLE");
  assert.deepEqual(exitResult.minimalBlockerSets, [["node.seed"]]);
});

test("conflicting premise is traced and remains usable through matching support", () => {
  const knowledge = compileOk([
    "bundle conflict_resolution@0.2.0",
    "type Case",
    "predicate Case.signal",
    "predicate Case.missing",
    "predicate Case.result",
    "entity item: Case",
    "fact item.signal = true",
    "fact item.signal = false",
    "rule decide($x: Case):",
    "  when $x.signal = true",
    "  and $x.missing = true",
    "  derive $x.result = true",
    "end",
  ].join("\n"));
  const result = resolve(knowledge, "item.result");
  assert.equal(result.resolutionState, "RESOLVABLE");
  assert.deepEqual(result.minimalBlockerSets, [["item.missing"]]);
  const signal = result.paths[0]?.conditions.find((condition) => condition.property === "signal");
  assert.equal(signal?.state, "CONFLICT");
  assert.equal(signal?.evidence.matchingProofIds.length, 1);
  assert.equal(signal?.evidence.contraryProofIds.length, 1);
});

test("base properties are directly resolvable; decided and conflicting queries request nothing", () => {
  const knowledge = compileOk([
    "bundle roots@0.2.0",
    "type Item",
    "attribute Item.value: Integer",
    "predicate Item.true_state",
    "predicate Item.false_state",
    "predicate Item.conflict_state",
    "entity item: Item",
    "fact item.true_state = true",
    "fact item.false_state = false",
    "fact item.conflict_state = true",
    "fact item.conflict_state = false",
  ].join("\n"));
  const missing = resolve(knowledge, "item.value");
  assert.equal(missing.resolutionState, "RESOLVABLE");
  assert.deepEqual(missing.minimalBlockerSets, [["item.value"]]);
  assert.equal(resolve(knowledge, "item.true_state").resolutionState, "ALREADY_RESOLVED");
  assert.equal(resolve(knowledge, "item.false_state").resolutionState, "ALREADY_RESOLVED");
  const conflict = resolve(knowledge, "item.conflict_state");
  assert.equal(conflict.resolutionState, "CONFLICT");
  assert.deepEqual(conflict.blockers, []);
});

test("resolution result is deeply immutable and deterministic", () => {
  const knowledge = compileOk([
    "bundle immutable_resolution@0.2.0", "type Item", "predicate Item.input", "predicate Item.output", "entity item: Item",
    "rule derive($x: Item):", "  when $x.input = true", "  derive $x.output = true", "end",
  ].join("\n"));
  const first = resolve(knowledge, "item.output");
  const expected = JSON.stringify(first);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.trace), true);
  for (let index = 0; index < 100; index += 1) assert.equal(JSON.stringify(resolve(knowledge, "item.output")), expected);
});

test("resolver analyzes paths to explicit FALSE and literal attribute producers", () => {
  const falseKnowledge = compileOk([
    "bundle false_path@0.2.0", "type Item", "predicate Item.input", "predicate Item.result", "entity item: Item",
    "rule derive_false($x: Item):", "  when $x.input = false", "  derive $x.result = false", "end",
  ].join("\n"));
  const falsePath = resolve(falseKnowledge, "item.result");
  assert.equal(falsePath.resolutionState, "RESOLVABLE");
  assert.deepEqual(falsePath.minimalBlockerSets, [["item.input"]]);
  assert.equal(falsePath.paths[0]?.effect.value.value, false);

  const attributeKnowledge = compileOk([
    "bundle attribute_path@0.2.0",
    "type Item", "predicate Item.measured", "attribute Item.score: Integer", "predicate Item.qualified", "entity item: Item",
    "rule produce_score($x: Item):", "  when $x.measured = true", "  derive $x.score = 100", "end",
    "rule qualify($x: Item):", "  when $x.score >= 80", "  derive $x.qualified = true", "end",
  ].join("\n"));
  const attributePath = resolve(attributeKnowledge, "item.qualified");
  assert.deepEqual(attributePath.minimalBlockerSets, [["item.measured"]]);
  assert.equal(attributePath.paths[0]?.conditions[0]?.dependency?.paths[0]?.effect.value.value, "100");
});

test("one blocker cell retains every conjunctive typed requirement", () => {
  const knowledge = compileOk([
    "bundle combined_requirements@0.2.0",
    "type Item", "attribute Item.value: Integer", "predicate Item.result", "entity item: Item",
    "rule in_range($x: Item):",
    "  when $x.value >= 10",
    "  and $x.value <= 20",
    "  derive $x.result = true",
    "end",
  ].join("\n"));
  const result = resolve(knowledge, "item.result");
  assert.deepEqual(result.minimalBlockerSets, [["item.value"]]);
  assert.equal(result.blockers.length, 1);
  assert.deepEqual(result.blockers[0]?.requirements.map((requirement) => requirement.kind === "comparison" ? requirement.operator : "KNOWN"), ["<=", ">="]);
});

test("human resolution trace has stable golden output", () => {
  const knowledge = compileOk([
    "bundle resolution_golden@0.2.0", "type Item", "predicate Item.input", "predicate Item.output", "entity item: Item",
    "rule derive($x: Item):", "  when $x.input = true", "  derive $x.output = true", "end",
  ].join("\n"));
  const output = formatResolution(resolve(knowledge, "output(item)")).replace(knowledge.canonicalHash, "<HASH>");
  assert.equal(output, [
    "RESULT: UNKNOWN",
    "query: item.output",
    "resolution: RESOLVABLE",
    "",
    "Blockers:",
    "  - input(item): Boolean",
    "    requires: = true",
    "",
    "Minimal blocker sets:",
    "  - item.input",
    "",
    "Paths:",
    "  R001 → output(item) = true [BLOCKED]",
    "    input(item) = true ?",
    "      blocker: item.input",
    "",
    "knowledge: sha256:<HASH>",
  ].join("\n"));
});
