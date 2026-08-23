import { canonicalStringify } from "./canonical.js";
import type { Operator, TypedValue } from "./model.js";

function decimalParts(raw: string): { integer: bigint; scale: number } {
  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  return {
    integer: BigInt(`${whole}${fraction}`) * (negative ? -1n : 1n),
    scale: fraction.length,
  };
}

export function typedValueKey(value: TypedValue): string {
  return canonicalStringify(value);
}

export function typedValuesEqual(left: TypedValue, right: TypedValue): boolean {
  return typedValueKey(left) === typedValueKey(right);
}

export function compareTypedValues(left: TypedValue, right: TypedValue): number {
  if (left.type !== right.type) throw new TypeError(`Cannot compare ${left.type} with ${right.type}.`);
  if (left.type === "Integer") {
    const a = BigInt(left.value as string);
    const b = BigInt(right.value as string);
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (left.type === "Decimal") {
    const a = decimalParts(left.value as string);
    const b = decimalParts(right.value as string);
    const scale = Math.max(a.scale, b.scale);
    const ai = a.integer * 10n ** BigInt(scale - a.scale);
    const bi = b.integer * 10n ** BigInt(scale - b.scale);
    return ai < bi ? -1 : ai > bi ? 1 : 0;
  }
  const a = String(left.value);
  const b = String(right.value);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function comparisonMatches(left: TypedValue, operator: Operator, right: TypedValue): boolean {
  const comparison = compareTypedValues(left, right);
  switch (operator) {
    case "=": return comparison === 0;
    case "!=": return comparison !== 0;
    case "<": return comparison < 0;
    case "<=": return comparison <= 0;
    case ">": return comparison > 0;
    case ">=": return comparison >= 0;
  }
}
