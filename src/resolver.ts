import { deepFreeze, stableCompare } from "./canonical.js";
import { ResourceLimitError, V02_RESOLUTION_LIMITS } from "./limits.js";
import type { KnowledgeIR, QueryResult, TypedValue } from "./model.js";
import type {
  BlockingFact,
  ConditionResolutionTrace,
  GoalResolutionTrace,
  ResolutionEvidence,
  ResolutionRequirement,
  ResolutionResult,
  RuleResolutionPath,
} from "./resolution-model.js";
import { evaluateSnapshot, materialize, type RuntimeSnapshot } from "./runtime.js";
import { comparisonMatches, typedValueKey } from "./semantics.js";

interface SupportView {
  readonly value: TypedValue;
  readonly proofId: string;
}

interface AnalysisContext {
  readonly knowledge: KnowledgeIR;
  readonly snapshot: RuntimeSnapshot;
  readonly evaluations: Map<string, QueryResult>;
  nodes: number;
}

interface BlockerOccurrence {
  readonly id: string;
  readonly requirement: ResolutionRequirement;
  readonly relevance: "RELEVANT" | "IRRELEVANT";
}

function normalizeQuery(query: string): string {
  const dot = query.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/);
  if (dot) return `${dot[1]}.${dot[2]}`;
  const functional = query.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\(([A-Za-z_][A-Za-z0-9_]*)\)$/);
  if (functional) return `${functional[2]}.${functional[1]}`;
  throw new Error(`Invalid query: ${query}. Expected entity.property or property(entity).`);
}

function requirementKey(requirement: ResolutionRequirement): string {
  return requirement.kind === "known"
    ? "KNOWN"
    : `${requirement.operator}:${typedValueKey(requirement.expected)}`;
}

function goalKey(entity: string, property: string, requirement: ResolutionRequirement): string {
  return `${entity}.${property}:${requirementKey(requirement)}`;
}

function requirementMatches(value: TypedValue, requirement: ResolutionRequirement): boolean {
  return requirement.kind === "known" || comparisonMatches(value, requirement.operator, requirement.expected);
}

function evaluateCell(context: AnalysisContext, entity: string, property: string): QueryResult {
  const key = `${entity}.${property}`;
  const cached = context.evaluations.get(key);
  if (cached) return cached;
  const result = evaluateSnapshot(context.snapshot, key);
  context.evaluations.set(key, result);
  return result;
}

function rootSupports(result: QueryResult): SupportView[] {
  const proofs = new Map(result.proofs.map((proof) => [proof.id, proof]));
  return result.proofIds.map((proofId) => {
    const proof = proofs.get(proofId);
    if (!proof) throw new Error(`Evaluation result is missing proof root ${proofId}.`);
    return { value: proof.conclusion.value, proofId };
  }).sort((a, b) => stableCompare(`${typedValueKey(a.value)}:${a.proofId}`, `${typedValueKey(b.value)}:${b.proofId}`));
}

function evidenceFor(result: QueryResult, requirement: ResolutionRequirement): ResolutionEvidence {
  const supports = rootSupports(result);
  const matching = supports.filter((support) => requirementMatches(support.value, requirement));
  const contrary = supports.filter((support) => !requirementMatches(support.value, requirement));
  return {
    cellStatus: result.status,
    matchingProofIds: matching.map((support) => support.proofId),
    contraryProofIds: contrary.map((support) => support.proofId),
  };
}

function normalizeFrontiers(frontiers: readonly (readonly string[])[]): string[][] {
  const unique = new Map<string, string[]>();
  for (const frontier of frontiers) {
    const normalized = [...new Set(frontier)].sort(stableCompare);
    unique.set(normalized.join("\u0000"), normalized);
  }
  const ordered = [...unique.values()].sort((a, b) => a.length - b.length || stableCompare(a.join("\u0000"), b.join("\u0000")));
  const minimal: string[][] = [];
  for (const candidate of ordered) {
    if (minimal.some((existing) => existing.every((id) => candidate.includes(id)))) continue;
    minimal.push(candidate);
    if (minimal.length > V02_RESOLUTION_LIMITS.maxResolutionFrontiers) {
      throw new ResourceLimitError("VR503", `Resolution exceeded ${V02_RESOLUTION_LIMITS.maxResolutionFrontiers} alternative blocker frontiers.`);
    }
  }
  return minimal;
}

function combineFrontiers(left: readonly (readonly string[])[], right: readonly (readonly string[])[]): string[][] {
  const combined: string[][] = [];
  for (const a of left) {
    for (const b of right) {
      combined.push([...a, ...b]);
      if (combined.length > V02_RESOLUTION_LIMITS.maxResolutionFrontiers * 4) {
        throw new ResourceLimitError("VR503", `Resolution exceeded ${V02_RESOLUTION_LIMITS.maxResolutionFrontiers} alternative blocker frontiers.`);
      }
    }
  }
  return normalizeFrontiers(combined);
}

function markGoalIrrelevant(goal: GoalResolutionTrace): GoalResolutionTrace {
  return {
    ...goal,
    relevance: "IRRELEVANT",
    paths: goal.paths.map((path) => ({
      ...path,
      conditions: path.conditions.map((condition) => ({
        ...condition,
        relevance: condition.state === "UNKNOWN" ? "IRRELEVANT" : condition.relevance,
        ...(condition.dependency ? { dependency: markGoalIrrelevant(condition.dependency) } : {}),
      })),
    })),
  };
}

function producerRules(context: AnalysisContext, entity: string, property: string, requirement: ResolutionRequirement) {
  const entityType = context.knowledge.entities.find((candidate) => candidate.name === entity)?.type;
  if (!entityType) return [];
  return context.knowledge.rules.filter((rule) =>
    rule.variable.type === entityType
    && rule.effect.property === property
    && requirementMatches(rule.effect.value, requirement)
  );
}

function analyzeGoal(
  context: AnalysisContext,
  entity: string,
  property: string,
  requirement: ResolutionRequirement,
  active: ReadonlySet<string>,
  depth: number,
): GoalResolutionTrace {
  context.nodes += 1;
  if (context.nodes > V02_RESOLUTION_LIMITS.maxResolutionNodes) {
    throw new ResourceLimitError("VR502", `Resolution exceeded ${V02_RESOLUTION_LIMITS.maxResolutionNodes} trace nodes.`);
  }
  if (depth > V02_RESOLUTION_LIMITS.maxResolutionDepth) {
    throw new ResourceLimitError("VR501", `Resolution exceeded dependency depth ${V02_RESOLUTION_LIMITS.maxResolutionDepth}.`);
  }
  const id = goalKey(entity, property, requirement);
  const result = evaluateCell(context, entity, property);
  const evidence = evidenceFor(result, requirement);
  if (evidence.matchingProofIds.length > 0) {
    return { kind: "goal", id, entity, property, requirement, state: "SATISFIED", relevance: "RELEVANT", evidence, paths: [], blockerSets: [[]] };
  }
  if (evidence.contraryProofIds.length > 0) {
    return { kind: "goal", id, entity, property, requirement, state: "IMPOSSIBLE", relevance: "RELEVANT", evidence, paths: [], blockerSets: [] };
  }
  if (active.has(id)) {
    return { kind: "goal", id, entity, property, requirement, state: "CYCLIC", relevance: "RELEVANT", evidence, paths: [], blockerSets: [] };
  }

  const producers = producerRules(context, entity, property, requirement);
  if (producers.length === 0) {
    const blockerId = `${entity}.${property}`;
    return { kind: "goal", id, entity, property, requirement, state: "BLOCKED", relevance: "RELEVANT", evidence, blockerId, paths: [], blockerSets: [[blockerId]] };
  }

  const nextActive = new Set(active);
  nextActive.add(id);
  const paths = producers.map((rule): RuleResolutionPath => {
    context.nodes += 1;
    if (context.nodes > V02_RESOLUTION_LIMITS.maxResolutionNodes) {
      throw new ResourceLimitError("VR502", `Resolution exceeded ${V02_RESOLUTION_LIMITS.maxResolutionNodes} trace nodes.`);
    }
    const preliminary = rule.conditions.map((condition): ConditionResolutionTrace => {
      context.nodes += 1;
      if (context.nodes > V02_RESOLUTION_LIMITS.maxResolutionNodes) {
        throw new ResourceLimitError("VR502", `Resolution exceeded ${V02_RESOLUTION_LIMITS.maxResolutionNodes} trace nodes.`);
      }
      const cellResult = evaluateCell(context, entity, condition.property);
      const conditionRequirement: ResolutionRequirement = {
        kind: "comparison",
        operator: condition.operator,
        expected: condition.value,
        sourceRuleId: rule.id,
      };
      const conditionEvidence = evidenceFor(cellResult, conditionRequirement);
      if (conditionEvidence.matchingProofIds.length > 0) {
        return {
          kind: "condition", entity, property: condition.property, operator: condition.operator, expected: condition.value,
          state: conditionEvidence.contraryProofIds.length > 0 ? "CONFLICT" : "SATISFIED",
          relevance: "RELEVANT", evidence: conditionEvidence,
        };
      }
      if (conditionEvidence.contraryProofIds.length > 0) {
        return {
          kind: "condition", entity, property: condition.property, operator: condition.operator, expected: condition.value,
          state: "FALSE", relevance: "RELEVANT", evidence: conditionEvidence,
        };
      }
      const dependency = analyzeGoal(context, entity, condition.property, conditionRequirement, nextActive, depth + 1);
      return {
        kind: "condition", entity, property: condition.property, operator: condition.operator, expected: condition.value,
        state: "UNKNOWN", relevance: "RELEVANT", evidence: conditionEvidence, dependency,
      };
    });

    const hasFalse = preliminary.some((condition) => condition.state === "FALSE");
    const unknownDependencies = preliminary.filter((condition) => condition.state === "UNKNOWN").map((condition) => condition.dependency!);
    const hasImpossible = unknownDependencies.some((dependency) => dependency.state === "IMPOSSIBLE");
    const hasCycle = unknownDependencies.some((dependency) => dependency.state === "CYCLIC");
    let state: RuleResolutionPath["state"];
    let blockerSets: string[][];
    if (hasFalse || hasImpossible) {
      state = "IMPOSSIBLE";
      blockerSets = [];
    } else if (hasCycle) {
      state = "CYCLIC";
      blockerSets = [];
    } else if (unknownDependencies.length === 0) {
      state = "SATISFIED";
      blockerSets = [[]];
    } else {
      state = "BLOCKED";
      blockerSets = [[]];
      for (const dependency of unknownDependencies) blockerSets = combineFrontiers(blockerSets, dependency.blockerSets);
    }
    const conditions = state === "IMPOSSIBLE" || state === "CYCLIC"
      ? preliminary.map((condition) => condition.state === "UNKNOWN"
        ? { ...condition, relevance: "IRRELEVANT" as const, dependency: markGoalIrrelevant(condition.dependency!) }
        : condition)
      : preliminary;
    return {
      kind: "rule", ruleId: rule.id, ruleName: rule.name, entity,
      effect: rule.effect, state, conditions, blockerSets,
    };
  });

  const blockedPaths = paths.filter((path) => path.state === "BLOCKED");
  if (paths.some((path) => path.state === "SATISFIED")) {
    return { kind: "goal", id, entity, property, requirement, state: "SATISFIED", relevance: "RELEVANT", evidence, paths, blockerSets: [[]] };
  }
  if (blockedPaths.length > 0) {
    return {
      kind: "goal", id, entity, property, requirement, state: "BLOCKED", relevance: "RELEVANT", evidence, paths,
      blockerSets: normalizeFrontiers(blockedPaths.flatMap((path) => path.blockerSets)),
    };
  }
  const state = paths.every((path) => path.state === "CYCLIC") ? "CYCLIC" : "IMPOSSIBLE";
  return { kind: "goal", id, entity, property, requirement, state, relevance: "RELEVANT", evidence, paths, blockerSets: [] };
}

function collectBlockerOccurrences(goal: GoalResolutionTrace, output: BlockerOccurrence[]): void {
  if (goal.blockerId) output.push({ id: goal.blockerId, requirement: goal.requirement, relevance: goal.relevance });
  for (const path of goal.paths) {
    for (const condition of path.conditions) if (condition.dependency) collectBlockerOccurrences(condition.dependency, output);
  }
}

function requirementSortKey(requirement: ResolutionRequirement): string {
  return `${requirementKey(requirement)}:${requirement.sourceRuleId ?? ""}`;
}

function makeBlockers(context: AnalysisContext, occurrences: readonly BlockerOccurrence[], relevance: BlockerOccurrence["relevance"]): BlockingFact[] {
  const grouped = new Map<string, ResolutionRequirement[]>();
  for (const occurrence of occurrences.filter((candidate) => candidate.relevance === relevance)) {
    const existing = grouped.get(occurrence.id) ?? [];
    existing.push(occurrence.requirement);
    grouped.set(occurrence.id, existing);
  }
  return [...grouped.entries()].sort(([a], [b]) => stableCompare(a, b)).map(([id, requirements]) => {
    const [entity, property] = id.split(".") as [string, string];
    const entityType = context.knowledge.entities.find((candidate) => candidate.name === entity)!.type;
    const valueType = context.knowledge.properties.find((candidate) => candidate.ownerType === entityType && candidate.name === property)!.valueType;
    const unique = new Map(requirements.map((requirement) => [requirementSortKey(requirement), requirement]));
    return { id, entity, property, valueType, requirements: [...unique.values()].sort((a, b) => stableCompare(requirementSortKey(a), requirementSortKey(b))) };
  });
}

export function resolve(knowledge: KnowledgeIR, query: string): ResolutionResult {
  const normalizedQuery = normalizeQuery(query);
  const [entity, property] = normalizedQuery.split(".") as [string, string];
  const queryEntity = knowledge.entities.find((candidate) => candidate.name === entity);
  if (!queryEntity) throw new Error(`Unknown query entity: ${entity}.`);
  if (!knowledge.properties.some((candidate) => candidate.ownerType === queryEntity.type && candidate.name === property)) {
    throw new Error(`Unknown query property: ${queryEntity.type}.${property}.`);
  }
  const snapshot = materialize(knowledge);
  const queryProof = evaluateSnapshot(snapshot, normalizedQuery);
  if (queryProof.status !== "UNKNOWN") {
    return deepFreeze({
      query: normalizedQuery,
      queryStatus: queryProof.status,
      resolutionState: queryProof.status === "CONFLICT" ? "CONFLICT" : "ALREADY_RESOLVED",
      blockers: [], irrelevantUnknowns: [], minimalBlockerSets: [], paths: [], queryProof,
      knowledgeHash: knowledge.canonicalHash,
    });
  }
  const context: AnalysisContext = { knowledge, snapshot, evaluations: new Map([[normalizedQuery, queryProof]]), nodes: 0 };
  const trace = analyzeGoal(context, entity, property, { kind: "known" }, new Set(), 0);
  const occurrences: BlockerOccurrence[] = [];
  collectBlockerOccurrences(trace, occurrences);
  const relevantBlockerIds = new Set(occurrences.filter((occurrence) => occurrence.relevance === "RELEVANT").map((occurrence) => occurrence.id));
  const blockers = makeBlockers(context, occurrences, "RELEVANT");
  const irrelevantUnknowns = makeBlockers(
    context,
    occurrences.filter((occurrence) => !relevantBlockerIds.has(occurrence.id)),
    "IRRELEVANT",
  );
  return deepFreeze({
    query: normalizedQuery,
    queryStatus: queryProof.status,
    resolutionState: trace.state === "BLOCKED" ? "RESOLVABLE" : "UNRESOLVABLE",
    blockers,
    irrelevantUnknowns,
    minimalBlockerSets: trace.blockerSets,
    paths: trace.paths,
    trace,
    queryProof,
    knowledgeHash: knowledge.canonicalHash,
  });
}
