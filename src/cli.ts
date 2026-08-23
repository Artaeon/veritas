#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { compile } from "./compiler.js";
import { formatCheck, formatDiagnostics, formatQuery } from "./format.js";
import { evaluate } from "./runtime.js";
import { ResourceLimitError } from "./limits.js";

function errorMessage(error: unknown): string {
  if (error instanceof ResourceLimitError) return `ERROR ${error.code}\n${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

function usage(): never {
  console.error("Usage: veritas <check|run|query|explain> <knowledge.vk> [entity.property]");
  process.exit(2);
}

async function load(path: string) {
  const source = await readFile(path, "utf8");
  const result = compile(source, path);
  if (!result.knowledge) {
    console.error(formatDiagnostics(result.diagnostics));
    process.exitCode = 1;
    return undefined;
  }
  return { source, knowledge: result.knowledge };
}

async function main(): Promise<void> {
  const [command, path, query] = process.argv.slice(2);
  if (!command || !path || !["check", "run", "query", "explain"].includes(command)) usage();
  const loaded = await load(path);
  if (!loaded) return;

  if (command === "check") {
    console.log(formatCheck(loaded.knowledge));
    return;
  }
  if (command === "query" || command === "explain") {
    if (!query) usage();
    try {
      console.log(formatQuery(evaluate(loaded.knowledge, query), command === "explain"));
    } catch (error) {
      console.error(errorMessage(error));
      process.exitCode = 1;
    }
    return;
  }

  console.log("VERITAS\n");
  console.log(formatCheck(loaded.knowledge));
  console.log("\nCommands: ask entity.property, why entity.property, exit");
  const terminal = createInterface({ input: stdin, output: stdout });
  try {
    while (true) {
      const answer = (await terminal.question("> ")).trim();
      if (answer === "exit" || answer === "quit") break;
      const match = answer.match(/^(ask|why)\s+(.+)$/);
      if (!match) {
        console.log("Expected: ask entity.property, why entity.property, or exit");
        continue;
      }
      try {
        console.log(formatQuery(evaluate(loaded.knowledge, match[2]!), match[1] === "why"));
      } catch (error) {
        console.log(errorMessage(error));
      }
    }
  } finally {
    terminal.close();
  }
}

main().catch((error: unknown) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
