export const V01_LIMITS = Object.freeze({
  maxSourceBytes: 1_048_576,
  maxLines: 20_000,
  maxLineCodeUnits: 16_384,
  maxDeclarations: 10_000,
  maxConditionsPerRule: 256,
  maxDiagnostics: 100,
  maxNumericDigits: 4_096,
  maxFixpointRounds: 10_000,
  maxRuleEvaluations: 1_000_000,
  maxPendingEffectsPerRound: 100_000,
  maxDerivedSupports: 100_000,
});

export const V02_RESOLUTION_LIMITS = Object.freeze({
  maxResolutionDepth: 256,
  maxResolutionNodes: 10_000,
  maxResolutionFrontiers: 1_024,
});

export class ResourceLimitError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ResourceLimitError";
    this.code = code;
  }
}
