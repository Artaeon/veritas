import { canonicalStringify, deepFreeze, sha256, stableCompare } from "./canonical.js";
import { V01_LIMITS } from "./limits.js";
import { parse } from "./parser.js";
import {
  primitiveTypes,
  type CompileResult,
  type ConditionIR,
  type Diagnostic,
  type EntityIR,
  type FactIR,
  type KnowledgeIR,
  type Operator,
  type PrimitiveType,
  type PropertyIR,
  type RuleIR,
  type SourceSpan,
  type TypedValue,
} from "./model.js";

const primitiveSet = new Set<string>(primitiveTypes);
const operators = new Set<string>(["=", "!=", "<", "<=", ">", ">="]);

function isWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function isValidDate(raw: string): boolean {
  const match = raw.match(/^@([0-9]{4})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1]!;
}

function normalizeDecimal(raw: string): string | undefined {
  if (!/^[+-]?[0-9]+\.[0-9]+$/.test(raw)) return undefined;
  let sign = "";
  let unsigned = raw;
  if (unsigned[0] === "+" || unsigned[0] === "-") {
    sign = unsigned[0] === "-" ? "-" : "";
    unsigned = unsigned.slice(1);
  }
  let [whole = "0", fraction = "0"] = unsigned.split(".");
  whole = whole.replace(/^0+(?=\d)/, "");
  fraction = fraction.replace(/0+$/, "");
  if (fraction === "") fraction = "0";
  if (/^0+$/.test(whole) && /^0+$/.test(fraction)) sign = "";
  return `${sign}${whole}.${fraction}`;
}

function parseLiteral(raw: string, expected: PrimitiveType): TypedValue | undefined {
  switch (expected) {
    case "Boolean":
      return raw === "true" || raw === "false" ? { type: expected, value: raw === "true" } : undefined;
    case "Integer":
      return /^[+-]?[0-9]+$/.test(raw) ? { type: expected, value: BigInt(raw).toString() } : undefined;
    case "Decimal": {
      const normalized = normalizeDecimal(raw);
      return normalized === undefined ? undefined : { type: expected, value: normalized };
    }
    case "String":
      try {
        const value: unknown = JSON.parse(raw);
        return typeof value === "string" && isWellFormedUnicode(value) ? { type: expected, value } : undefined;
      } catch {
        return undefined;
      }
    case "Symbol":
      return /^[A-Za-z_][A-Za-z0-9_]*$/.test(raw) ? { type: expected, value: raw } : undefined;
    case "Date":
      return isValidDate(raw) ? { type: expected, value: raw.slice(1) } : undefined;
    case "Duration":
      return /^P(?=\d|T\d)(?:\d+Y)?(?:\d+M)?(?:\d+D)?(?:T(?=\d)(?:\d+H)?(?:\d+M)?(?:\d+S)?)?$/.test(raw) ? { type: expected, value: raw } : undefined;
  }
}

function numericLiteralTooLarge(raw: string, expected: PrimitiveType): boolean {
  return (expected === "Integer" || expected === "Decimal") && raw.replace(/[^0-9]/g, "").length > V01_LIMITS.maxNumericDigits;
}

function propertyKey(ownerType: string, name: string): string {
  return `${ownerType}.${name}`;
}

export function compile(source: string, file = "<input>"): CompileResult {
  const parsed = parse(source, file);
  const diagnostics: Diagnostic[] = [...parsed.diagnostics];
  const types = new Set<string>();
  const properties = new Map<string, PropertyIR>();
  const entities = new Map<string, EntityIR>();
  const facts: FactIR[] = [];
  const rules: RuleIR[] = [];
  const ruleNames = new Set<string>();

  const error = (code: string, message: string, sourceSpan: SourceSpan, hint?: string): void => {
    diagnostics.push({ code, message, source: sourceSpan, ...(hint === undefined ? {} : { hint }) });
  };

  for (const declaration of parsed.ast.declarations) {
    if (declaration.kind !== "type") continue;
    if (types.has(declaration.name)) error("VK201", `Duplicate type: ${declaration.name}.`, declaration.source);
    else types.add(declaration.name);
  }

  for (const declaration of parsed.ast.declarations) {
    if (declaration.kind !== "attribute" && declaration.kind !== "predicate") continue;
    if (!types.has(declaration.ownerType)) {
      error("VK202", `Unknown type: ${declaration.ownerType}.`, declaration.source);
      continue;
    }
    const key = propertyKey(declaration.ownerType, declaration.name);
    if (properties.has(key)) {
      error("VK203", `Duplicate property: ${key}.`, declaration.source);
      continue;
    }
    if (declaration.kind === "attribute" && !primitiveSet.has(declaration.valueType)) {
      error("VK204", `Unknown primitive type: ${declaration.valueType}.`, declaration.source);
      continue;
    }
    properties.set(key, {
      ownerType: declaration.ownerType,
      name: declaration.name,
      valueType: declaration.kind === "predicate" ? "Boolean" : declaration.valueType as PrimitiveType,
      kind: declaration.kind,
    });
  }

  for (const declaration of parsed.ast.declarations) {
    if (declaration.kind !== "entity") continue;
    if (!types.has(declaration.entityType)) {
      error("VK205", `Unknown entity type: ${declaration.entityType}.`, declaration.source);
      continue;
    }
    if (entities.has(declaration.name)) error("VK206", `Duplicate entity: ${declaration.name}.`, declaration.source);
    else entities.set(declaration.name, { name: declaration.name, type: declaration.entityType });
  }

  let factIndex = 0;
  for (const declaration of parsed.ast.declarations) {
    if (declaration.kind !== "fact") continue;
    const entity = entities.get(declaration.entity);
    if (!entity) {
      error("VK207", `Unknown entity: ${declaration.entity}.`, declaration.source);
      continue;
    }
    const property = properties.get(propertyKey(entity.type, declaration.property));
    if (!property) {
      error("VK208", `Unknown property: ${entity.type}.${declaration.property}.`, declaration.source);
      continue;
    }
    if (numericLiteralTooLarge(declaration.rawValue, property.valueType)) {
      error("VK215", `Numeric literal exceeds ${V01_LIMITS.maxNumericDigits} digits.`, declaration.source);
      continue;
    }
    const value = parseLiteral(declaration.rawValue, property.valueType);
    if (!value) {
      error("VK209", `Expected ${property.valueType}; received ${declaration.rawValue}.`, declaration.source);
      continue;
    }
    factIndex += 1;
    facts.push({ id: `F${String(factIndex).padStart(3, "0")}`, entity: entity.name, property: property.name, value, source: declaration.source });
  }

  let ruleIndex = 0;
  for (const declaration of parsed.ast.declarations) {
    if (declaration.kind !== "rule") continue;
    if (ruleNames.has(declaration.name)) {
      error("VK210", `Duplicate rule: ${declaration.name}.`, declaration.source);
      continue;
    }
    ruleNames.add(declaration.name);
    if (!types.has(declaration.variableType)) {
      error("VK211", `Unknown rule variable type: ${declaration.variableType}.`, declaration.source);
      continue;
    }
    let valid = true;
    const conditions: ConditionIR[] = [];
    for (const condition of declaration.conditions) {
      if (condition.variable !== declaration.variable) {
        error("VK212", `Unknown rule variable: $${condition.variable}.`, condition.source);
        valid = false;
        continue;
      }
      const property = properties.get(propertyKey(declaration.variableType, condition.property));
      if (!property) {
        error("VK208", `Unknown property: ${declaration.variableType}.${condition.property}.`, condition.source);
        valid = false;
        continue;
      }
      if (!operators.has(condition.operator)) {
        error("VK213", `Unknown operator: ${condition.operator}.`, condition.source);
        valid = false;
        continue;
      }
      if (!["Integer", "Decimal", "Date"].includes(property.valueType) && !["=", "!="].includes(condition.operator)) {
        error("VK214", `Operator ${condition.operator} is invalid for ${property.valueType}.`, condition.source);
        valid = false;
        continue;
      }
      if (numericLiteralTooLarge(condition.rawValue, property.valueType)) {
        error("VK215", `Numeric literal exceeds ${V01_LIMITS.maxNumericDigits} digits.`, condition.source);
        valid = false;
        continue;
      }
      const value = parseLiteral(condition.rawValue, property.valueType);
      if (!value) {
        error("VK209", `Expected ${property.valueType}; received ${condition.rawValue}.`, condition.source);
        valid = false;
        continue;
      }
      conditions.push({ property: property.name, operator: condition.operator as Operator, value });
    }
    const effect = declaration.effect;
    if (effect.variable !== declaration.variable) {
      error("VK212", `Unknown rule variable: $${effect.variable}.`, effect.source);
      valid = false;
    }
    const effectProperty = properties.get(propertyKey(declaration.variableType, effect.property));
    if (!effectProperty) {
      error("VK208", `Unknown property: ${declaration.variableType}.${effect.property}.`, effect.source);
      valid = false;
    }
    const effectTooLarge = effectProperty ? numericLiteralTooLarge(effect.rawValue, effectProperty.valueType) : false;
    if (effectProperty && effectTooLarge) {
      error("VK215", `Numeric literal exceeds ${V01_LIMITS.maxNumericDigits} digits.`, effect.source);
      valid = false;
    }
    const effectValue = effectProperty && !effectTooLarge
      ? parseLiteral(effect.rawValue, effectProperty.valueType)
      : undefined;
    if (effectProperty && !effectValue && !effectTooLarge) {
      error("VK209", `Expected ${effectProperty.valueType}; received ${effect.rawValue}.`, effect.source);
      valid = false;
    }
    if (!valid || !effectProperty || !effectValue) continue;
    ruleIndex += 1;
    rules.push({
      id: `R${String(ruleIndex).padStart(3, "0")}`,
      name: declaration.name,
      variable: { name: declaration.variable, type: declaration.variableType },
      conditions: conditions.sort((a, b) => stableCompare(`${a.property}:${a.operator}:${canonicalStringify(a.value)}`, `${b.property}:${b.operator}:${canonicalStringify(b.value)}`)),
      effect: { property: effectProperty.name, value: effectValue },
      source: declaration.source,
    });
  }

  diagnostics.sort((a, b) => a.source.line - b.source.line || a.source.column - b.source.column || stableCompare(a.code, b.code));
  if (diagnostics.length > 0 || !parsed.ast.header) return { diagnostics };

  const sortedFacts = facts
    .sort((a, b) => stableCompare(`${a.entity}.${a.property}:${canonicalStringify(a.value)}`, `${b.entity}.${b.property}:${canonicalStringify(b.value)}`))
    .map((fact, index) => ({ ...fact, id: `F${String(index + 1).padStart(3, "0")}` }));
  const sortedRules = rules
    .sort((a, b) => stableCompare(a.name, b.name))
    .map((rule, index) => ({ ...rule, id: `R${String(index + 1).padStart(3, "0")}` }));
  const base = {
    irVersion: 1 as const,
    bundle: { name: parsed.ast.header.name, version: parsed.ast.header.version },
    types: [...types].sort(stableCompare),
    properties: [...properties.values()].sort((a, b) => stableCompare(propertyKey(a.ownerType, a.name), propertyKey(b.ownerType, b.name))),
    entities: [...entities.values()].sort((a, b) => stableCompare(a.name, b.name)),
    facts: sortedFacts,
    rules: sortedRules,
  };
  const canonical = {
    ...base,
    facts: base.facts.map(({ source: _source, ...fact }) => fact),
    rules: base.rules.map(({ source: _source, ...rule }) => rule),
  };
  const knowledge: KnowledgeIR = deepFreeze({ ...base, canonicalHash: sha256(canonicalStringify(canonical)) });
  return { diagnostics, knowledge };
}
