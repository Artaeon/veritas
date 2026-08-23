import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { compile } from "../src/compiler.js";

const fixtures = join(process.cwd(), "tests", "fixtures");

test("all ten valid corpus files compile", async () => {
  const directory = join(fixtures, "valid");
  const files = (await readdir(directory)).sort();
  assert.equal(files.length, 10);
  for (const file of files) {
    const result = compile(await readFile(join(directory, file), "utf8"), file);
    assert.ok(result.knowledge, `${file}: ${JSON.stringify(result.diagnostics)}`);
    assert.deepEqual(result.diagnostics, []);
  }
});

test("all ten invalid corpus files fail loudly", async () => {
  const directory = join(fixtures, "invalid");
  const files = (await readdir(directory)).sort();
  assert.equal(files.length, 10);
  for (const file of files) {
    const result = compile(await readFile(join(directory, file), "utf8"), file);
    assert.equal(result.knowledge, undefined, file);
    assert.ok(result.diagnostics.length > 0, file);
    assert.match(result.diagnostics[0]!.code, /^VK\d{3}$/);
  }
});

test("canonical identity ignores source filename", () => {
  const source = "bundle identity@0.1.0\ntype Thing\n";
  const first = compile(source, "first.vk").knowledge!;
  const second = compile(source, "second.vk").knowledge!;
  assert.equal(first.canonicalHash, second.canonicalHash);
});

test("canonical identity is independent of declaration order", () => {
  const first = compile([
    "bundle identity@0.1.0",
    "type Thing",
    "attribute Thing.b: Integer",
    "attribute Thing.a: Integer",
    "entity item: Thing",
    "fact item.b = 2",
    "fact item.a = 1",
  ].join("\n")).knowledge!;
  const second = compile([
    "bundle identity@0.1.0",
    "type Thing",
    "attribute Thing.a: Integer",
    "attribute Thing.b: Integer",
    "entity item: Thing",
    "fact item.a = 1",
    "fact item.b = 2",
  ].join("\n")).knowledge!;
  assert.equal(first.canonicalHash, second.canonicalHash);
});

test("parser retains a hash character inside strings", () => {
  const source = [
    "bundle hashes@0.1.0",
    "type Thing",
    "attribute Thing.label: String",
    "entity item: Thing",
    'fact item.label = "value # retained" # comment',
  ].join("\n");
  const result = compile(source);
  assert.equal(result.knowledge?.facts[0]?.value.value, "value # retained");
});
