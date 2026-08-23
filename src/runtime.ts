import { stableCompare } from "./canonical.js";
import { ResourceLimitError, V01_LIMITS } from "./limits.js";
import { comparisonMatches, typedValueKey } from "./semantics.js";
import type { ConditionIR, KnowledgeIR, ProofNode, QueryResult, Truth, TypedValue } from "./model.js";

export interface RuntimeSupport {
  readonly value: TypedValue;
  readonly proofId: string;
}

interface ConditionEvidence {
  readonly status: Truth;
  readonly support?: RuntimeSupport;
}

type FactStore = Map<string, Map<string, RuntimeSupport>>;

export interface RuntimeSnapshot {
  readonly knowledge: KnowledgeIR;
  readonly store: ReadonlyMap<string, ReadonlyMap<string, RuntimeSupport>>;
  readonly proofs: ReadonlyMap<string, ProofNode>;
}

interface QueryTarget {
  readonly entityName: string;
  readonly propertyName: string;
  readonly valueType: string;
}

function cellKey(entity: string, property: string): string {
  return `${entity}.${property}`;
}

function queryTarget(knowledge: KnowledgeIR, query: string): QueryTarget {
  const match = query.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/);
  if (!match) throw new Error(`Invalid query: ${query}. Expected entity.property.`);
  const [, entityName, propertyName] = match as [string, string, string];
  const entity = knowledge.entities.find((candidate) => candidate.name === entityName);
  if (!entity) throw new Error(`Unknown query entity: ${entityName}.`);
  const property = knowledge.properties.find((candidate) => candidate.ownerType === entity.type && candidate.name === propertyName);
  if (!property) throw new Error(`Unknown query property: ${entity.type}.${propertyName}.`);
  return { entityName, propertyName, valueType: property.valueType };
}

function evaluateCondition(store: FactStore, entity: string, condition: ConditionIR): ConditionEvidence {
  const supports = store.get(cellKey(entity, condition.property));
  if (!supports || supports.size === 0) return { status: "UNKNOWN" };
  const ordered = [...supports.values()].sort((a, b) => stableCompare(typedValueKey(a.value), typedValueKey(b.value)));
  const matching = ordered.filter((support) => comparisonMatches(support.value, condition.operator, condition.value));
  const nonMatching = ordered.length - matching.length;
  if (matching.length === 0) return { status: "FALSE" };
  return { status: nonMatching === 0 ? "TRUE" : "CONFLICT", support: matching[0]! };
}

export function materialize(knowledge: KnowledgeIR): RuntimeSnapshot {
  const store: FactStore = new Map();
  const proofs = new Map<string, ProofNode>();
  const add = (entityKey: string, propertyKey: string, value: TypedValue, proof: ProofNode): boolean => {
    const key = cellKey(entityKey, propertyKey);
    const values = store.get(key) ?? new Map<string, RuntimeSupport>();
    if (values.has(typedValueKey(value))) return false;
    values.set(typedValueKey(value), { value, proofId: proof.id });
    store.set(key, values);
    proofs.set(proof.id, proof);
    return true;
  };

  for (const fact of knowledge.facts) {
    add(fact.entity, fact.property, fact.value, {
      kind: "asserted",
      id: fact.id,
      factId: fact.id,
      conclusion: { entity: fact.entity, property: fact.property, value: fact.value },
      source: fact.source,
    });
  }

  const entitiesByType = new Map<string, typeof knowledge.entities>();
  for (const type of knowledge.types) entitiesByType.set(type, knowledge.entities.filter((candidate) => candidate.type === type));

  let changed = true;
  let rounds = 0;
  let ruleEvaluations = 0;
  let derivedSupports = 0;
  while (changed) {
    rounds += 1;
    if (rounds > V01_LIMITS.maxFixpointRounds) {
      throw new ResourceLimitError("VK501", `Evaluation exceeded ${V01_LIMITS.maxFixpointRounds} fixpoint rounds.`);
    }
    changed = false;
    const pending: { entity: string; property: string; value: TypedValue; proof: ProofNode }[] = [];
    for (const rule of knowledge.rules) {
      for (const candidate of entitiesByType.get(rule.variable.type) ?? []) {
        ruleEvaluations += 1;
        if (ruleEvaluations > V01_LIMITS.maxRuleEvaluations) {
          throw new ResourceLimitError("VK502", `Evaluation exceeded ${V01_LIMITS.maxRuleEvaluations} rule instantiations.`);
        }
        const conditionResults = rule.conditions.map((condition) => ({ condition, evidence: evaluateCondition(store, candidate.name, condition) }));
        if (!conditionResults.every(({ evidence }) => evidence.support !== undefined)) continue;
        const proofId = `${rule.id}@${candidate.name}`;
        const conclusion = { entity: candidate.name, property: rule.effect.property, value: rule.effect.value };
        if (pending.length >= V01_LIMITS.maxPendingEffectsPerRound) {
          throw new ResourceLimitError("VK504", `Evaluation exceeded ${V01_LIMITS.maxPendingEffectsPerRound} pending effects in one round.`);
        }
        pending.push({
          ...conclusion,
          proof: {
            kind: "derived",
            id: proofId,
            ruleId: rule.id,
            entity: candidate.name,
            conclusion,
            conditions: conditionResults.map(({ condition, evidence }) => ({
              property: condition.property,
              operator: condition.operator,
              expected: condition.value,
              observed: evidence.support!.value,
              proofId: evidence.support!.proofId,
            })),
          },
        });
      }
    }
    pending.sort((a, b) => stableCompare(
      `${a.entity}.${a.property}:${typedValueKey(a.value)}:${a.proof.id}`,
      `${b.entity}.${b.property}:${typedValueKey(b.value)}:${b.proof.id}`,
    ));
    for (const item of pending) {
      if (add(item.entity, item.property, item.value, item.proof)) {
        derivedSupports += 1;
        if (derivedSupports > V01_LIMITS.maxDerivedSupports) {
          throw new ResourceLimitError("VK503", `Evaluation exceeded ${V01_LIMITS.maxDerivedSupports} derived supports.`);
        }
        changed = true;
      }
    }
  }
  return { knowledge, store, proofs };
}

function evaluateTarget(snapshot: RuntimeSnapshot, target: QueryTarget): QueryResult {
  const { entityName, propertyName, valueType } = target;
  const supports = snapshot.store.get(cellKey(entityName, propertyName));
  const ordered = supports ? [...supports.values()].sort((a, b) => stableCompare(typedValueKey(a.value), typedValueKey(b.value))) : [];
  let status: Truth;
  let value: TypedValue | undefined;
  if (ordered.length === 0) status = "UNKNOWN";
  else if (ordered.length > 1) status = "CONFLICT";
  else {
    value = ordered[0]!.value;
    status = valueType === "Boolean" ? (value.value ? "TRUE" : "FALSE") : "TRUE";
  }
  const proofIds = ordered.map((support) => support.proofId);
  const reachable = new Set<string>();
  const stack = [...proofIds];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    const proof = snapshot.proofs.get(id);
    if (proof?.kind === "derived") for (const condition of proof.conditions) stack.push(condition.proofId);
  }
  return {
    query: `${entityName}.${propertyName}`,
    status,
    ...(value === undefined ? {} : { value }),
    missing: status === "UNKNOWN" ? [`${entityName}.${propertyName}`] : [],
    proofIds,
    proofs: [...reachable].sort(stableCompare).map((id) => snapshot.proofs.get(id)!).filter(Boolean),
    knowledgeHash: snapshot.knowledge.canonicalHash,
  };
}

export function evaluateSnapshot(snapshot: RuntimeSnapshot, query: string): QueryResult {
  return evaluateTarget(snapshot, queryTarget(snapshot.knowledge, query));
}

export function evaluate(knowledge: KnowledgeIR, query: string): QueryResult {
  const target = queryTarget(knowledge, query);
  return evaluateTarget(materialize(knowledge), target);
}

export function formatValue(value: TypedValue): string {
  if (value.type === "String") return JSON.stringify(value.value);
  if (value.type === "Date") return `@${value.value}`;
  return String(value.value);
}
