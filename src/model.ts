export const primitiveTypes = [
  "Boolean",
  "Integer",
  "Decimal",
  "String",
  "Symbol",
  "Date",
  "Duration",
] as const;

export type PrimitiveType = (typeof primitiveTypes)[number];
export type Operator = "=" | "!=" | "<" | "<=" | ">" | ">=";

export interface SourceSpan {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

export interface HeaderAst {
  readonly name: string;
  readonly version: string;
  readonly source: SourceSpan;
}

export type DeclarationAst =
  | { readonly kind: "type"; readonly name: string; readonly source: SourceSpan }
  | { readonly kind: "attribute"; readonly ownerType: string; readonly name: string; readonly valueType: string; readonly source: SourceSpan }
  | { readonly kind: "predicate"; readonly ownerType: string; readonly name: string; readonly source: SourceSpan }
  | { readonly kind: "entity"; readonly name: string; readonly entityType: string; readonly source: SourceSpan }
  | { readonly kind: "fact"; readonly entity: string; readonly property: string; readonly rawValue: string; readonly source: SourceSpan }
  | RuleAst;

export interface RuleAst {
  readonly kind: "rule";
  readonly name: string;
  readonly variable: string;
  readonly variableType: string;
  readonly conditions: readonly ConditionAst[];
  readonly effect: EffectAst;
  readonly source: SourceSpan;
}

export interface ConditionAst {
  readonly variable: string;
  readonly property: string;
  readonly operator: string;
  readonly rawValue: string;
  readonly source: SourceSpan;
}

export interface EffectAst {
  readonly variable: string;
  readonly property: string;
  readonly rawValue: string;
  readonly source: SourceSpan;
}

export interface BundleAst {
  readonly header?: HeaderAst;
  readonly declarations: readonly DeclarationAst[];
}

export interface Diagnostic {
  readonly code: string;
  readonly message: string;
  readonly source: SourceSpan;
  readonly hint?: string;
}

export interface TypedValue {
  readonly type: PrimitiveType;
  readonly value: string | boolean;
}

export interface PropertyIR {
  readonly ownerType: string;
  readonly name: string;
  readonly valueType: PrimitiveType;
  readonly kind: "attribute" | "predicate";
}

export interface EntityIR {
  readonly name: string;
  readonly type: string;
}

export interface FactIR {
  readonly id: string;
  readonly entity: string;
  readonly property: string;
  readonly value: TypedValue;
  readonly source: SourceSpan;
}

export interface ConditionIR {
  readonly property: string;
  readonly operator: Operator;
  readonly value: TypedValue;
}

export interface RuleIR {
  readonly id: string;
  readonly name: string;
  readonly variable: { readonly name: string; readonly type: string };
  readonly conditions: readonly ConditionIR[];
  readonly effect: { readonly property: string; readonly value: TypedValue };
  readonly source: SourceSpan;
}

export interface KnowledgeIR {
  readonly irVersion: 1;
  readonly bundle: { readonly name: string; readonly version: string };
  readonly types: readonly string[];
  readonly properties: readonly PropertyIR[];
  readonly entities: readonly EntityIR[];
  readonly facts: readonly FactIR[];
  readonly rules: readonly RuleIR[];
  readonly canonicalHash: string;
}

export interface CompileResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly knowledge?: KnowledgeIR;
}

export type Truth = "TRUE" | "FALSE" | "UNKNOWN" | "CONFLICT";

export type ProofNode =
  | {
      readonly kind: "asserted";
      readonly id: string;
      readonly factId: string;
      readonly conclusion: ProofConclusion;
      readonly source: SourceSpan;
    }
  | {
      readonly kind: "derived";
      readonly id: string;
      readonly ruleId: string;
      readonly entity: string;
      readonly conclusion: ProofConclusion;
      readonly conditions: readonly ProofCondition[];
    };

export interface ProofConclusion {
  readonly entity: string;
  readonly property: string;
  readonly value: TypedValue;
}

export interface ProofCondition {
  readonly property: string;
  readonly operator: Operator;
  readonly expected: TypedValue;
  readonly observed: TypedValue;
  readonly proofId: string;
}

export interface QueryResult {
  readonly query: string;
  readonly status: Truth;
  readonly value?: TypedValue;
  readonly missing: readonly string[];
  readonly proofIds: readonly string[];
  readonly proofs: readonly ProofNode[];
  readonly knowledgeHash: string;
}

export interface ProofVerification {
  readonly valid: boolean;
  readonly errors: readonly string[];
}
