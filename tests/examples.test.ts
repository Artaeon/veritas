import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { compile } from "../src/compiler.js";
import { resolve } from "../src/resolver.js";

async function compileExample(name: string, additionalFacts = "") {
  const path = join(process.cwd(), "examples", name);
  const source = `${await readFile(path, "utf8")}\n${additionalFacts}`;
  const compiled = compile(source, path);
  assert.ok(compiled.knowledge, JSON.stringify(compiled.diagnostics));
  return compiled.knowledge;
}

test("friendly bike example preserves open-world and explicit counter-rule behavior", async () => {
  const unknown = resolve(await compileExample("bike-commute.vk"), "cycling_possible(today)");
  assert.equal(unknown.queryStatus, "UNKNOWN");
  assert.deepEqual(unknown.blockers.map((blocker) => blocker.id), [
    "today.bike_working",
    "today.route_clear",
    "today.weather_dry",
  ]);

  const possible = resolve(await compileExample("bike-commute.vk", [
    "fact today.weather_dry = true",
    "fact today.bike_working = true",
    "fact today.route_clear = true",
  ].join("\n")), "cycling_possible(today)");
  assert.equal(possible.queryStatus, "TRUE");

  const prevented = resolve(
    await compileExample("bike-commute.vk", "fact today.weather_dry = false"),
    "cycling_possible(today)",
  );
  assert.equal(prevented.queryStatus, "FALSE");
});

test("procurement example asks only for information on viable paths", async () => {
  const knowledge = await compileExample("procurement-approval.vk");

  const software = resolve(knowledge, "purchase_approved(analytics_subscription)");
  assert.equal(software.queryStatus, "UNKNOWN");
  assert.deepEqual(software.blockers.map((blocker) => blocker.id), [
    "analytics_subscription.security_review_passed",
  ]);
  assert.deepEqual(software.irrelevantUnknowns.map((blocker) => blocker.id), [
    "analytics_subscription.finance_approved",
  ]);

  assert.equal(resolve(knowledge, "purchase_approved(office_chairs)").queryStatus, "TRUE");

  const platform = resolve(knowledge, "purchase_approved(data_platform)");
  assert.equal(platform.queryStatus, "UNKNOWN");
  assert.deepEqual(platform.blockers.map((blocker) => blocker.id), ["data_platform.finance_approved"]);
  assert.deepEqual(platform.irrelevantUnknowns.map((blocker) => blocker.id), [
    "data_platform.security_review_passed",
  ]);
});

test("friendly presentation layer covers positive, negative, and unknown outcomes", () => {
  const script = join(process.cwd(), "scripts", "friendly-demo.mjs");
  const cases = [
    { answers: "j,j,j", expected: "Veritas-Status: TRUE" },
    { answers: "n", expected: "Veritas-Status: FALSE" },
    { answers: "?,?,?", expected: "Veritas-Status: UNKNOWN" },
  ];

  for (const current of cases) {
    const run = spawnSync(process.execPath, [script, `--answers=${current.answers}`], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, new RegExp(current.expected));
  }
});
