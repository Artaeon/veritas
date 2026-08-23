#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { compile, resolve } from "../dist/src/index.js";

const sourcePath = new URL("../examples/bike-commute.vk", import.meta.url);
const baseSource = await readFile(sourcePath, "utf8");
const questions = [
  { id: "today.weather_dry", property: "weather_dry", text: "Ist das Wetter trocken?" },
  { id: "today.bike_working", property: "bike_working", text: "Ist dein Fahrrad fahrbereit?" },
  { id: "today.route_clear", property: "route_clear", text: "Ist deine Strecke frei befahrbar?" },
];

const answers = new Map();
const terminal = createInterface({ input: stdin, output: stdout });
const suppliedArgument = process.argv.find((argument) => argument.startsWith("--answers="));
const suppliedAnswers = suppliedArgument?.slice("--answers=".length).split(",") ?? [];
let suppliedIndex = 0;

function analyze() {
  const facts = [...answers.entries()]
    .map(([property, value]) => `fact today.${property} = ${value}`)
    .join("\n");
  const compiled = compile(`${baseSource}\n${facts}\n`, "friendly-bike-demo.vk");
  if (!compiled.knowledge) throw new Error("Die Demo-Wissensbasis konnte nicht kompiliert werden.");
  return resolve(compiled.knowledge, "cycling_possible(today)");
}

function showResult(result) {
  console.log("\nErgebnis");
  if (result.queryStatus === "TRUE") {
    console.log("✓ Ja – nach den angegebenen Regeln kannst du mit dem Fahrrad fahren.");
  } else if (result.queryStatus === "FALSE") {
    console.log("✗ Nein – mindestens eine ausdrückliche Gegenregel trifft zu.");
  } else if (result.queryStatus === "CONFLICT") {
    console.log("! Die Angaben widersprechen sich. Veritas zeigt deshalb CONFLICT.");
  } else {
    console.log("? Noch nicht entscheidbar. Unbekannt bedeutet nicht automatisch nein.");
  }

  const blockerIds = new Set(result.blockers.map((blocker) => blocker.id));
  const missing = questions
    .filter((question) => blockerIds.has(question.id) && !answers.has(question.property))
    .map((question) => question.text);
  if (missing.length > 0) console.log(`Noch hilfreich: ${missing.join(" · ")}`);
  console.log(`\nVeritas-Status: ${result.queryStatus} · Resolution: ${result.resolutionState}`);
}

console.log("\nVERITAS – Alltagsdemo");
console.log("Frage: Kann ich heute mit dem Fahrrad zur Arbeit fahren?\n");
console.log("Antworte mit j (ja), n (nein) oder ? (weiß nicht).\n");

try {
  for (const question of questions) {
    const current = analyze();
    if (current.queryStatus !== "UNKNOWN") break;
    if (!current.blockers.some((blocker) => blocker.id === question.id)) continue;

    let answer = "";
    while (!new Set(["j", "ja", "n", "nein", "?"]).has(answer)) {
      if (suppliedIndex < suppliedAnswers.length) {
        answer = suppliedAnswers[suppliedIndex++]?.trim().toLowerCase() ?? "?";
        console.log(`${question.text} [j/n/?] ${answer}`);
      } else {
        answer = (await terminal.question(`${question.text} [j/n/?] `)).trim().toLowerCase();
      }
      if (!answer) answer = "?";
    }
    if (answer === "j" || answer === "ja") answers.set(question.property, true);
    if (answer === "n" || answer === "nein") answers.set(question.property, false);
  }

  showResult(analyze());
} finally {
  terminal.close();
}
