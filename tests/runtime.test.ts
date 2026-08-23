import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { compile } from "../src/compiler.js";
import { formatQuery } from "../src/format.js";
import { evaluate } from "../src/runtime.js";

const valid = join(process.cwd(), "tests", "fixtures", "valid");

async function knowledge(name: string) {
  const path = join(valid, name);
  const compiled = compile(await readFile(path, "utf8"), path);
  assert.ok(compiled.knowledge);
  return compiled.knowledge;
}

test("twenty representative queries have exact outcomes", async () => {
  const cases: Array<[string, string, string, string?]> = [
    ["02-integer.vk", "item.count", "TRUE", "42"],
    ["03-decimal.vk", "account.balance", "TRUE", "0.1"],
    ["03-decimal.vk", "account.positive", "TRUE"],
    ["04-string.vk", "item.label", "TRUE", "a # label"],
    ["04-string.vk", "item.match", "TRUE"],
    ["05-explicit-false.vk", "feature.enabled", "FALSE"],
    ["06-adult.vk", "john.age", "TRUE", "21"],
    ["06-adult.vk", "john.adult", "TRUE"],
    ["07-minor.vk", "jane.age", "TRUE", "16"],
    ["07-minor.vk", "jane.adult", "FALSE"],
    ["08-conjunction.vk", "complete.score", "TRUE", "90"],
    ["08-conjunction.vk", "complete.reviewed", "TRUE"],
    ["08-conjunction.vk", "complete.accepted", "TRUE"],
    ["08-conjunction.vk", "incomplete.score", "TRUE", "90"],
    ["08-conjunction.vk", "incomplete.reviewed", "UNKNOWN"],
    ["08-conjunction.vk", "incomplete.accepted", "UNKNOWN"],
    ["09-recursion.vk", "seeded.a", "TRUE"],
    ["09-recursion.vk", "seeded.b", "TRUE"],
    ["09-recursion.vk", "seeded.c", "TRUE"],
    ["09-recursion.vk", "empty.c", "UNKNOWN"],
  ];
  for (const [file, query, status, value] of cases) {
    const result = evaluate(await knowledge(file), query);
    assert.equal(result.status, status, `${file} ${query}`);
    if (value !== undefined) assert.equal(String(result.value?.value), value);
  }
});

test("opposing derivations produce conflict without priority", async () => {
  const result = evaluate(await knowledge("10-conflict.vk"), "item.decision");
  assert.equal(result.status, "CONFLICT");
  assert.deepEqual(result.proofIds, ["R002@item", "R001@item"]);
});

test("derived result includes complete transitive proof", async () => {
  const result = evaluate(await knowledge("09-recursion.vk"), "seeded.c");
  assert.equal(result.status, "TRUE");
  assert.deepEqual(result.proofs.map((proof) => proof.id), ["F001", "R001@seeded", "R002@seeded"]);
});

test("unknown is not false and reports the missing cell", async () => {
  const result = evaluate(await knowledge("08-conjunction.vk"), "incomplete.accepted");
  assert.equal(result.status, "UNKNOWN");
  assert.deepEqual(result.missing, ["incomplete.accepted"]);
});

test("one hundred evaluations serialize byte-identically", async () => {
  const bundle = await knowledge("09-recursion.vk");
  const expected = JSON.stringify(evaluate(bundle, "seeded.c"));
  for (let index = 0; index < 100; index += 1) {
    assert.equal(JSON.stringify(evaluate(bundle, "seeded.c")), expected);
  }
});

test("golden explanation output is stable", async () => {
  const result = evaluate(await knowledge("06-adult.vk"), "john.adult");
  const output = formatQuery(result, true).replace(result.knowledgeHash, "<HASH>").replaceAll(valid, "<FIXTURES>");
  assert.equal(output, [
    "RESULT: TRUE",
    "query: john.adult",
    "",
    "Proof:",
    "  F001: john.age = 21 (asserted at <FIXTURES>/06-adult.vk:6)",
    "  R001@john: john.adult = true via R001 with entity=john",
    "    john.age = 21; 21 >= 18 = TRUE [F001]",
    "",
    "knowledge: sha256:<HASH>",
  ].join("\n"));
});
