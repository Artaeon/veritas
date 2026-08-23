import assert from "node:assert/strict";
import test from "node:test";
import { compile } from "../src/compiler.js";
import { ResourceLimitError } from "../src/limits.js";
import { resolve } from "../src/resolver.js";

function compileOk(source: string) {
  const result = compile(source, "resolution-adversarial.vk");
  assert.ok(result.knowledge, JSON.stringify(result.diagnostics));
  return result.knowledge;
}

test("alternative-frontier explosion fails explicitly and deterministically", () => {
  const alternatives = 33;
  const declarations = [
    "bundle frontier_limit@0.2.0",
    "type Case",
    "predicate Case.left",
    "predicate Case.right",
    "predicate Case.result",
    ...Array.from({ length: alternatives }, (_, index) => `predicate Case.left_${index}`),
    ...Array.from({ length: alternatives }, (_, index) => `predicate Case.right_${index}`),
    "entity item: Case",
    ...Array.from({ length: alternatives }, (_, index) => [
      `rule make_left_${String(index).padStart(2, "0")}($x: Case):`,
      `  when $x.left_${index} = true`,
      "  derive $x.left = true",
      "end",
    ].join("\n")),
    ...Array.from({ length: alternatives }, (_, index) => [
      `rule make_right_${String(index).padStart(2, "0")}($x: Case):`,
      `  when $x.right_${index} = true`,
      "  derive $x.right = true",
      "end",
    ].join("\n")),
    "rule resolve_result($x: Case):",
    "  when $x.left = true",
    "  and $x.right = true",
    "  derive $x.result = true",
    "end",
  ];
  const knowledge = compileOk(declarations.join("\n"));
  for (let run = 0; run < 2; run += 1) {
    assert.throws(() => resolve(knowledge, "item.result"), (error: unknown) => {
      assert.ok(error instanceof ResourceLimitError);
      assert.equal(error.code, "VR503");
      return true;
    });
  }
});

test("invalid and unknown resolution queries fail loudly", () => {
  const knowledge = compileOk("bundle invalid_queries@0.2.0\ntype Item\npredicate Item.ready\nentity item: Item");
  for (const query of ["", "ready()", "item", "ready(item,other)", "💥(item)"]) {
    assert.throws(() => resolve(knowledge, query));
  }
  assert.throws(() => resolve(knowledge, "missing.ready"), /Unknown query entity/);
  assert.throws(() => resolve(knowledge, "item.missing"), /Unknown query property/);
});

test("many irrelevant OR branches do not pollute minimal viable blockers", () => {
  const impossibleBranches = 100;
  const source = [
    "bundle irrelevant_scale@0.2.0",
    "type Case",
    "predicate Case.guard",
    "predicate Case.viable_input",
    "predicate Case.result",
    ...Array.from({ length: impossibleBranches }, (_, index) => `predicate Case.unknown_${index}`),
    "entity item: Case",
    "fact item.guard = false",
    "rule viable($x: Case):",
    "  when $x.viable_input = true",
    "  derive $x.result = true",
    "end",
    ...Array.from({ length: impossibleBranches }, (_, index) => [
      `rule impossible_${String(index).padStart(3, "0")}($x: Case):`,
      "  when $x.guard = true",
      `  and $x.unknown_${index} = true`,
      "  derive $x.result = true",
      "end",
    ].join("\n")),
  ].join("\n");
  const result = resolve(compileOk(source), "item.result");
  assert.deepEqual(result.minimalBlockerSets, [["item.viable_input"]]);
  assert.deepEqual(result.blockers.map((blocker) => blocker.id), ["item.viable_input"]);
  assert.equal(result.irrelevantUnknowns.length, impossibleBranches);
});

test("different rule declaration order yields identical resolution semantics", () => {
  const build = (reverse: boolean) => {
    const rules = [
      ["rule from_a($x: Case):", "  when $x.a = true", "  derive $x.result = true", "end"].join("\n"),
      ["rule from_b($x: Case):", "  when $x.b = true", "  derive $x.result = true", "end"].join("\n"),
    ];
    if (reverse) rules.reverse();
    return ["bundle ordered@0.2.0", "type Case", "predicate Case.a", "predicate Case.b", "predicate Case.result", "entity item: Case", ...rules].join("\n");
  };
  const first = compileOk(build(false));
  const second = compileOk(build(true));
  assert.equal(first.canonicalHash, second.canonicalHash);
  assert.equal(JSON.stringify(resolve(first, "item.result")), JSON.stringify(resolve(second, "item.result")));
});

test("dependency-depth and trace-node ceilings fail explicitly", () => {
  const depth = 260;
  const deepSource = [
    "bundle deep_resolution@0.2.0",
    "type Node",
    ...Array.from({ length: depth + 1 }, (_, index) => `predicate Node.p${index}`),
    "entity node: Node",
    ...Array.from({ length: depth }, (_, index) => [
      `rule step_${String(index).padStart(3, "0")}($x: Node):`,
      `  when $x.p${index + 1} = true`,
      `  derive $x.p${index} = true`,
      "end",
    ].join("\n")),
  ].join("\n");
  assert.throws(() => resolve(compileOk(deepSource), "node.p0"), (error: unknown) => {
    assert.ok(error instanceof ResourceLimitError);
    assert.equal(error.code, "VR501");
    return true;
  });

  const rules = 4_000;
  const wideSource = [
    "bundle wide_resolution@0.2.0",
    "type Node",
    "predicate Node.leaf",
    "predicate Node.result",
    "entity node: Node",
    ...Array.from({ length: rules }, (_, index) => [
      `rule alternative_${String(index).padStart(4, "0")}($x: Node):`,
      "  when $x.leaf = true",
      "  derive $x.result = true",
      "end",
    ].join("\n")),
  ].join("\n");
  assert.throws(() => resolve(compileOk(wideSource), "node.result"), (error: unknown) => {
    assert.ok(error instanceof ResourceLimitError);
    assert.equal(error.code, "VR502");
    return true;
  });
});
