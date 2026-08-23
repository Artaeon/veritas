import type { Diagnostic, KnowledgeIR, QueryResult } from "./model.js";
import { formatValue } from "./runtime.js";
import type { ResolutionRequirement, ResolutionResult, RuleResolutionPath } from "./resolution-model.js";

export function formatDiagnostics(diagnostics: readonly Diagnostic[]): string {
  return diagnostics.map((diagnostic) => {
    const location = `${diagnostic.source.file}:${diagnostic.source.line}:${diagnostic.source.column}`;
    return [`ERROR ${diagnostic.code}`, diagnostic.message, location, ...(diagnostic.hint ? [`Hint: ${diagnostic.hint}`] : [])].join("\n");
  }).join("\n\n");
}

export function formatCheck(knowledge: KnowledgeIR): string {
  return [
    "PASS",
    `bundle: ${knowledge.bundle.name}@${knowledge.bundle.version}`,
    `types: ${knowledge.types.length}`,
    `properties: ${knowledge.properties.length}`,
    `entities: ${knowledge.entities.length}`,
    `rules: ${knowledge.rules.length}`,
    `sha256:${knowledge.canonicalHash}`,
  ].join("\n");
}

export function formatQuery(result: QueryResult, explain = false): string {
  const lines = [`RESULT: ${result.status}`, `query: ${result.query}`];
  if (result.value && result.value.type !== "Boolean") lines.push(`value: ${formatValue(result.value)}`);
  if (result.missing.length > 0) lines.push("", "Missing:", ...result.missing.map((item) => `  ${item}`));
  if (explain && result.proofs.length > 0) {
    lines.push("", "Proof:");
    for (const proof of result.proofs) {
      if (proof.kind === "asserted") {
        lines.push(`  ${proof.id}: ${proof.conclusion.entity}.${proof.conclusion.property} = ${formatValue(proof.conclusion.value)} (asserted at ${proof.source.file}:${proof.source.line})`);
      } else {
        lines.push(`  ${proof.id}: ${proof.conclusion.entity}.${proof.conclusion.property} = ${formatValue(proof.conclusion.value)} via ${proof.ruleId} with entity=${proof.entity}`);
        for (const condition of proof.conditions) {
          lines.push(`    ${proof.entity}.${condition.property} = ${formatValue(condition.observed)}; ${formatValue(condition.observed)} ${condition.operator} ${formatValue(condition.expected)} = TRUE [${condition.proofId}]`);
        }
      }
    }
  }
  lines.push("", `knowledge: sha256:${result.knowledgeHash}`);
  return lines.join("\n");
}

function formatRequirement(requirement: ResolutionRequirement): string {
  return requirement.kind === "known" ? "a known value" : `${requirement.operator} ${formatValue(requirement.expected)}`;
}

function formatRulePath(path: RuleResolutionPath, indent: string): string[] {
  const lines = [`${indent}${path.ruleId} → ${path.effect.property}(${path.entity}) = ${formatValue(path.effect.value)} [${path.state}]`];
  for (const condition of path.conditions) {
    const marker = condition.state === "SATISFIED" ? "✓" : condition.state === "CONFLICT" ? "! CONFLICT" : condition.state === "FALSE" ? "✗" : "?";
    const relevance = condition.relevance === "IRRELEVANT" ? " (irrelevant: path impossible)" : "";
    lines.push(`${indent}  ${condition.property}(${condition.entity}) ${condition.operator} ${formatValue(condition.expected)} ${marker}${relevance}`);
    if (condition.dependency) {
      for (const nested of condition.dependency.paths) lines.push(...formatRulePath(nested, `${indent}    `));
      if (condition.dependency.blockerId) lines.push(`${indent}    blocker: ${condition.dependency.blockerId}`);
      if (condition.dependency.state === "CYCLIC") lines.push(`${indent}    cycle: ${condition.dependency.id}`);
      if (condition.dependency.state === "IMPOSSIBLE" && condition.dependency.paths.length === 0) lines.push(`${indent}    impossible: existing evidence does not match`);
    }
  }
  return lines;
}

export function formatResolution(result: ResolutionResult): string {
  const lines = [
    `RESULT: ${result.queryStatus}`,
    `query: ${result.query}`,
    `resolution: ${result.resolutionState}`,
  ];
  if (result.blockers.length > 0) {
    lines.push("", "Blockers:");
    for (const blocker of result.blockers) {
      lines.push(`  - ${blocker.property}(${blocker.entity}): ${blocker.valueType}`);
      for (const requirement of blocker.requirements) lines.push(`    requires: ${formatRequirement(requirement)}`);
    }
  }
  if (result.minimalBlockerSets.length > 0) {
    lines.push("", "Minimal blocker sets:");
    for (const set of result.minimalBlockerSets) lines.push(`  - ${set.join(" + ")}`);
  }
  if (result.irrelevantUnknowns.length > 0) {
    lines.push("", "Irrelevant unknowns:");
    for (const blocker of result.irrelevantUnknowns) lines.push(`  - ${blocker.property}(${blocker.entity}): ${blocker.valueType}`);
  }
  if (result.paths.length > 0) {
    lines.push("", "Paths:");
    for (const path of result.paths) lines.push(...formatRulePath(path, "  "));
  }
  lines.push("", `knowledge: sha256:${result.knowledgeHash}`);
  return lines.join("\n");
}
