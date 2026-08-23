import { readFile } from "node:fs/promises";
import { compile } from "../src/compiler.js";
import { formatQuery } from "../src/format.js";
import { evaluate } from "../src/runtime.js";

const [path, query] = process.argv.slice(2);
if (!path || !query) throw new Error("Expected path and query.");
const source = await readFile(path, "utf8");
const compiled = compile(source, "stable-input.vk");
if (!compiled.knowledge) throw new Error(JSON.stringify(compiled.diagnostics));
const result = evaluate(compiled.knowledge, query);
process.stdout.write(JSON.stringify({ hash: compiled.knowledge.canonicalHash, result, formatted: formatQuery(result, true) }));
