import type { Operator, QueryResult, Truth, TypedValue } from "./model.js";

export type ResolutionState = "ALREADY_RESOLVED" | "RESOLVABLE" | "UNRESOLVABLE" | "CONFLICT";
export type GoalState = "SATISFIED" | "BLOCKED" | "IMPOSSIBLE" | "CYCLIC";
export type RulePathState = "SATISFIED" | "BLOCKED" | "IMPOSSIBLE" | "CYCLIC";
export type ConditionResolutionState = "SATISFIED" | "CONFLICT" | "FALSE" | "UNKNOWN";
export type Relevance = "RELEVANT" | "IRRELEVANT";

export type ResolutionRequirement =
  | { readonly kind: "known"; readonly sourceRuleId?: string }
  | { readonly kind: "comparison"; readonly operator: Operator; readonly expected: TypedValue; readonly sourceRuleId?: string };

export interface ResolutionEvidence {
  readonly cellStatus: Truth;
  readonly matchingProofIds: readonly string[];
  readonly contraryProofIds: readonly string[];
}

export interface ConditionResolutionTrace {
  readonly kind: "condition";
  readonly entity: string;
  readonly property: string;
  readonly operator: Operator;
  readonly expected: TypedValue;
  readonly state: ConditionResolutionState;
  readonly relevance: Relevance;
  readonly evidence: ResolutionEvidence;
  readonly dependency?: GoalResolutionTrace;
}

export interface RuleResolutionPath {
  readonly kind: "rule";
  readonly ruleId: string;
  readonly ruleName: string;
  readonly entity: string;
  readonly effect: { readonly property: string; readonly value: TypedValue };
  readonly state: RulePathState;
  readonly conditions: readonly ConditionResolutionTrace[];
  readonly blockerSets: readonly (readonly string[])[];
}

export interface GoalResolutionTrace {
  readonly kind: "goal";
  readonly id: string;
  readonly entity: string;
  readonly property: string;
  readonly requirement: ResolutionRequirement;
  readonly state: GoalState;
  readonly relevance: Relevance;
  readonly evidence: ResolutionEvidence;
  readonly blockerId?: string;
  readonly paths: readonly RuleResolutionPath[];
  readonly blockerSets: readonly (readonly string[])[];
}

export interface BlockingFact {
  readonly id: string;
  readonly entity: string;
  readonly property: string;
  readonly valueType: string;
  readonly requirements: readonly ResolutionRequirement[];
}

export interface ResolutionResult {
  readonly query: string;
  readonly queryStatus: Truth;
  readonly resolutionState: ResolutionState;
  readonly blockers: readonly BlockingFact[];
  readonly irrelevantUnknowns: readonly BlockingFact[];
  readonly minimalBlockerSets: readonly (readonly string[])[];
  readonly paths: readonly RuleResolutionPath[];
  readonly trace?: GoalResolutionTrace;
  readonly queryProof: QueryResult;
  readonly knowledgeHash: string;
}
