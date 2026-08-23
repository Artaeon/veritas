import type { Diagnostic, KnowledgeIR, QueryResult } from "./model.js";
import { formatValue } from "./runtime.js";

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
