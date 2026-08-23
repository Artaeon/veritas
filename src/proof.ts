import { stableCompare } from "./canonical.js";
import { comparisonMatches, typedValueKey, typedValuesEqual } from "./semantics.js";
import type { KnowledgeIR, ProofNode, ProofVerification, QueryResult, Truth } from "./model.js";

function conclusionKey(proof: ProofNode): string {
  return `${proof.conclusion.entity}.${proof.conclusion.property}`;
}

export function verifyProof(knowledge: KnowledgeIR, result: QueryResult): ProofVerification {
  const errors: string[] = [];
  const nodes = new Map<string, ProofNode>();
  if (new Set(result.proofIds).size !== result.proofIds.length) errors.push("Duplicate proof root ID.");
  for (const proof of result.proofs) {
    if (nodes.has(proof.id)) errors.push(`Duplicate proof node: ${proof.id}.`);
    nodes.set(proof.id, proof);
  }
  if (result.knowledgeHash !== knowledge.canonicalHash) errors.push("Knowledge hash does not match the proof result.");

  for (const proof of result.proofs) {
    if (proof.kind === "asserted") {
      const fact = knowledge.facts.find((candidate) => candidate.id === proof.factId);
      if (!fact) {
        errors.push(`${proof.id}: asserted fact does not exist.`);
      } else if (
        proof.conclusion.entity !== fact.entity
        || proof.conclusion.property !== fact.property
        || !typedValuesEqual(proof.conclusion.value, fact.value)
      ) {
        errors.push(`${proof.id}: asserted conclusion does not match ${fact.id}.`);
      }
      if (fact && (
        proof.source.file !== fact.source.file
        || proof.source.line !== fact.source.line
        || proof.source.column !== fact.source.column
      )) errors.push(`${proof.id}: asserted provenance does not match ${fact.id}.`);
      continue;
    }

    const rule = knowledge.rules.find((candidate) => candidate.id === proof.ruleId);
    const entity = knowledge.entities.find((candidate) => candidate.name === proof.entity);
    if (!rule) {
      errors.push(`${proof.id}: rule ${proof.ruleId} does not exist.`);
      continue;
    }
    if (!entity || entity.type !== rule.variable.type) errors.push(`${proof.id}: invalid entity substitution.`);
    if (proof.id !== `${rule.id}@${proof.entity}`) errors.push(`${proof.id}: non-canonical derived proof ID.`);
    if (
      proof.conclusion.entity !== proof.entity
      || proof.conclusion.property !== rule.effect.property
      || !typedValuesEqual(proof.conclusion.value, rule.effect.value)
    ) {
      errors.push(`${proof.id}: conclusion does not match the rule effect.`);
    }
    if (proof.conditions.length !== rule.conditions.length) {
      errors.push(`${proof.id}: condition count does not match the rule.`);
      continue;
    }
    for (let index = 0; index < rule.conditions.length; index += 1) {
      const expected = rule.conditions[index]!;
      const evidence = proof.conditions[index]!;
      const parent = nodes.get(evidence.proofId);
      if (
        evidence.property !== expected.property
        || evidence.operator !== expected.operator
        || !typedValuesEqual(evidence.expected, expected.value)
      ) {
        errors.push(`${proof.id}: condition ${index + 1} does not match the rule.`);
      }
      if (!parent) {
        errors.push(`${proof.id}: missing supporting proof ${evidence.proofId}.`);
      } else if (
        parent.conclusion.entity !== proof.entity
        || parent.conclusion.property !== evidence.property
        || !typedValuesEqual(parent.conclusion.value, evidence.observed)
      ) {
        errors.push(`${proof.id}: support ${evidence.proofId} does not prove the observed premise.`);
      }
      try {
        if (!comparisonMatches(evidence.observed, evidence.operator, evidence.expected)) {
          errors.push(`${proof.id}: observed premise does not satisfy condition ${index + 1}.`);
        }
      } catch {
        errors.push(`${proof.id}: observed premise has an invalid comparison type.`);
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const reachable = new Set<string>();
  for (const rootId of result.proofIds) {
    const stack: Array<{ id: string; exit: boolean }> = [{ id: rootId, exit: false }];
    while (stack.length > 0) {
      const frame = stack.pop()!;
      if (frame.exit) {
        visiting.delete(frame.id);
        visited.add(frame.id);
        continue;
      }
      if (visited.has(frame.id)) continue;
      if (visiting.has(frame.id)) {
        errors.push(`Proof graph contains a cycle at ${frame.id}.`);
        continue;
      }
      const proof = nodes.get(frame.id);
      if (!proof) {
        errors.push(`Missing proof root: ${frame.id}.`);
        continue;
      }
      visiting.add(frame.id);
      reachable.add(frame.id);
      stack.push({ id: frame.id, exit: true });
      if (proof.kind === "derived") {
        for (let index = proof.conditions.length - 1; index >= 0; index -= 1) {
          stack.push({ id: proof.conditions[index]!.proofId, exit: false });
        }
      }
    }
  }
  for (const id of nodes.keys()) if (!reachable.has(id)) errors.push(`Unreachable proof node: ${id}.`);

  const rootProofs = result.proofIds.map((id) => nodes.get(id)).filter((proof): proof is ProofNode => proof !== undefined);
  for (const proof of rootProofs) if (conclusionKey(proof) !== result.query) errors.push(`${proof.id}: root proves ${conclusionKey(proof)}, not ${result.query}.`);
  const distinctValues = [...new Set(rootProofs.map((proof) => typedValueKey(proof.conclusion.value)))].sort(stableCompare);
  let expectedStatus: Truth;
  if (distinctValues.length === 0) expectedStatus = "UNKNOWN";
  else if (distinctValues.length > 1) expectedStatus = "CONFLICT";
  else {
    const rootValue = rootProofs[0]!.conclusion.value;
    expectedStatus = rootValue.type === "Boolean" ? (rootValue.value ? "TRUE" : "FALSE") : "TRUE";
  }
  if (expectedStatus !== result.status) errors.push(`Result status ${result.status} does not match proof status ${expectedStatus}.`);
  if (distinctValues.length === 1) {
    if (!result.value || !typedValuesEqual(result.value, rootProofs[0]!.conclusion.value)) errors.push("Result value does not match its proof root.");
  } else if (result.value !== undefined) {
    errors.push("Unknown or conflicting result must not expose a single value.");
  }
  return { valid: errors.length === 0, errors: errors.sort(stableCompare) };
}
