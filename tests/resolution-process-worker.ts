import { readFile } from "node:fs/promises";
import { canonicalStringify } from "../src/canonical.js";
import { compile } from "../src/compiler.js";
import { formatResolution } from "../src/format.js";
import { resolve } from "../src/resolver.js";

const [path, query] = process.argv.slice(2);
if (!path || !query) throw new Error("Expected path and query.");
const compiled = compile(await readFile(path, "utf8"), "stable-resolution-input.vk");
if (!compiled.knowledge) throw new Error(JSON.stringify(compiled.diagnostics));
const result = resolve(compiled.knowledge, query);
process.stdout.write(canonicalStringify({ result, formatted: formatResolution(result) }));
