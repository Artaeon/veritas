import type {
  BundleAst,
  ConditionAst,
  DeclarationAst,
  Diagnostic,
  EffectAst,
  RuleAst,
  SourceSpan,
} from "./model.js";
import { V01_LIMITS } from "./limits.js";

export interface ParseResult {
  readonly ast: BundleAst;
  readonly diagnostics: readonly Diagnostic[];
}

const id = "[A-Za-z_][A-Za-z0-9_]*";

function span(file: string, line: number, text: string): SourceSpan {
  return { file, line, column: Math.max(1, text.search(/\S/) + 1) };
}

function stripComment(line: string): string {
  let quoted = false;
  let escaped = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (escaped) {
      escaped = false;
    } else if (char === "\\" && quoted) {
      escaped = true;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "#" && !quoted) {
      return line.slice(0, i);
    }
  }
  return line;
}

export function parse(source: string, file = "<input>"): ParseResult {
  if (Buffer.byteLength(source, "utf8") > V01_LIMITS.maxSourceBytes) {
    return {
      ast: { declarations: [] },
      diagnostics: [{ code: "VK001", message: `Source exceeds ${V01_LIMITS.maxSourceBytes} UTF-8 bytes.`, source: { file, line: 1, column: 1 } }],
    };
  }
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  if (lines.length > V01_LIMITS.maxLines) {
    return {
      ast: { declarations: [] },
      diagnostics: [{ code: "VK002", message: `Source exceeds ${V01_LIMITS.maxLines} lines.`, source: { file, line: V01_LIMITS.maxLines + 1, column: 1 } }],
    };
  }
  const declarations: DeclarationAst[] = [];
  const diagnostics: Diagnostic[] = [];
  let header: BundleAst["header"];
  let index = 0;
  let sawDeclaration = false;

  const error = (code: string, message: string, line: number, text: string, hint?: string): void => {
    if (diagnostics.length >= V01_LIMITS.maxDiagnostics) return;
    diagnostics.push({ code, message, source: span(file, line, text), ...(hint === undefined ? {} : { hint }) });
  };

  const addDeclaration = (declaration: DeclarationAst): void => {
    sawDeclaration = true;
    if (declarations.length >= V01_LIMITS.maxDeclarations) {
      error("VK004", `Source exceeds ${V01_LIMITS.maxDeclarations} declarations.`, declaration.source.line, "");
      return;
    }
    declarations.push(declaration);
  };

  while (index < lines.length) {
    const original = lines[index] ?? "";
    const text = stripComment(original).trim();
    const lineNumber = index + 1;
    index += 1;
    if (original.length > V01_LIMITS.maxLineCodeUnits) {
      error("VK003", `Line exceeds ${V01_LIMITS.maxLineCodeUnits} UTF-16 code units.`, lineNumber, original);
      continue;
    }
    if (text === "") continue;

    let match: RegExpMatchArray | null;
    match = text.match(new RegExp(`^bundle\\s+(${id})@([0-9]+(?:\\.[0-9]+){2}(?:[-+][A-Za-z0-9.-]+)?)$`));
    if (match) {
      if (header) error("VK101", "Duplicate bundle header.", lineNumber, original);
      else if (sawDeclaration) {
        header = { name: match[1]!, version: match[2]!, source: span(file, lineNumber, original) };
        error("VK103", "Bundle header must be the first declaration.", lineNumber, original);
      }
      else header = { name: match[1]!, version: match[2]!, source: span(file, lineNumber, original) };
      continue;
    }

    match = text.match(new RegExp(`^type\\s+(${id})$`));
    if (match) {
      addDeclaration({ kind: "type", name: match[1]!, source: span(file, lineNumber, original) });
      continue;
    }

    match = text.match(new RegExp(`^attribute\\s+(${id})\\.(${id})\\s*:\\s*(${id})$`));
    if (match) {
      addDeclaration({ kind: "attribute", ownerType: match[1]!, name: match[2]!, valueType: match[3]!, source: span(file, lineNumber, original) });
      continue;
    }

    match = text.match(new RegExp(`^predicate\\s+(${id})\\.(${id})$`));
    if (match) {
      addDeclaration({ kind: "predicate", ownerType: match[1]!, name: match[2]!, source: span(file, lineNumber, original) });
      continue;
    }

    match = text.match(new RegExp(`^entity\\s+(${id})\\s*:\\s*(${id})$`));
    if (match) {
      addDeclaration({ kind: "entity", name: match[1]!, entityType: match[2]!, source: span(file, lineNumber, original) });
      continue;
    }

    match = text.match(new RegExp(`^fact\\s+(${id})\\.(${id})\\s*=\\s*(.+)$`));
    if (match) {
      addDeclaration({ kind: "fact", entity: match[1]!, property: match[2]!, rawValue: match[3]!.trim(), source: span(file, lineNumber, original) });
      continue;
    }

    match = text.match(new RegExp(`^rule\\s+(${id})\\(\\$(${id})\\s*:\\s*(${id})\\)\\s*:$`));
    if (match) {
      const ruleSource = span(file, lineNumber, original);
      const conditions: ConditionAst[] = [];
      let effect: EffectAst | undefined;
      let ended = false;
      let sawWhen = false;
      let sawEffect = false;
      while (index < lines.length) {
        const bodyOriginal = lines[index] ?? "";
        const body = stripComment(bodyOriginal).trim();
        const bodyLine = index + 1;
        index += 1;
        if (bodyOriginal.length > V01_LIMITS.maxLineCodeUnits) {
          error("VK003", `Line exceeds ${V01_LIMITS.maxLineCodeUnits} UTF-16 code units.`, bodyLine, bodyOriginal);
          continue;
        }
        if (body === "") continue;
        if (body === "end") {
          ended = true;
          break;
        }
        const conditionMatch = body.match(new RegExp(`^(when|and)\\s+\\$(${id})\\.(${id})\\s*(<=|>=|!=|=|<|>)\\s*(.+)$`));
        if (conditionMatch) {
          const keyword = conditionMatch[1]!;
          if (sawEffect) {
            error("VK112", "Rule condition cannot appear after its effect.", bodyLine, bodyOriginal);
            continue;
          }
          if (keyword === "and" && !sawWhen) {
            error("VK113", "The first rule condition must start with when.", bodyLine, bodyOriginal);
            continue;
          }
          if (keyword === "when" && sawWhen) {
            error("VK114", "Additional rule conditions must start with and.", bodyLine, bodyOriginal);
            continue;
          }
          sawWhen = true;
          if (conditions.length >= V01_LIMITS.maxConditionsPerRule) {
            error("VK005", `Rule exceeds ${V01_LIMITS.maxConditionsPerRule} conditions.`, bodyLine, bodyOriginal);
          } else {
            conditions.push({ variable: conditionMatch[2]!, property: conditionMatch[3]!, operator: conditionMatch[4]!, rawValue: conditionMatch[5]!.trim(), source: span(file, bodyLine, bodyOriginal) });
          }
          continue;
        }
        const effectMatch = body.match(new RegExp(`^derive\\s+\\$(${id})\\.(${id})\\s*=\\s*(.+)$`));
        if (effectMatch) {
          if (!sawWhen) {
            error("VK115", "Rule effect must follow at least one condition.", bodyLine, bodyOriginal);
            continue;
          }
          if (effect) error("VK108", "A V0.1 rule has exactly one effect.", bodyLine, bodyOriginal);
          else {
            effect = { variable: effectMatch[1]!, property: effectMatch[2]!, rawValue: effectMatch[3]!.trim(), source: span(file, bodyLine, bodyOriginal) };
            sawEffect = true;
          }
          continue;
        }
        error("VK100", "Invalid rule statement.", bodyLine, bodyOriginal, "Expected when, and, derive, or end.");
      }
      if (!ended) error("VK109", `Rule ${match[1]} is missing end.`, lineNumber, original);
      if (conditions.length === 0) error("VK110", `Rule ${match[1]} has no conditions.`, lineNumber, original);
      if (!effect) error("VK111", `Rule ${match[1]} has no effect.`, lineNumber, original);
      if (effect) {
        const rule: RuleAst = { kind: "rule", name: match[1]!, variable: match[2]!, variableType: match[3]!, conditions, effect, source: ruleSource };
        addDeclaration(rule);
      }
      continue;
    }

    sawDeclaration = true;
    error("VK100", "Invalid declaration.", lineNumber, original);
  }

  if (!header) {
    diagnostics.unshift({ code: "VK102", message: "Missing bundle header.", source: { file, line: 1, column: 1 }, hint: "Start with: bundle name@0.1.0" });
    if (diagnostics.length > V01_LIMITS.maxDiagnostics) diagnostics.pop();
  }
  return { ast: { ...(header === undefined ? {} : { header }), declarations }, diagnostics };
}
