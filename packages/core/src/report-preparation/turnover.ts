export const MANUAL_TURNOVER_SOURCES = [
  'official-annual-accounts',
  'client-stated',
  'other-documented',
] as const;

export type ManualTurnoverSource = (typeof MANUAL_TURNOVER_SOURCES)[number];
export type DetectedTurnoverSource = 'sirene-api';

interface ManualTurnoverBase {
  year: number;
  source: ManualTurnoverSource;
  sourceNote?: string | undefined;
}

export type ManualTurnover =
  | (ManualTurnoverBase & { kind: 'exact'; amountEur: number })
  | (ManualTurnoverBase & { kind: 'range'; lowerEur: number; upperEur: number });

export interface DetectedOfficialTurnover {
  amountEur: number;
  year: number;
  source: DetectedTurnoverSource;
}

export interface TurnoverChoice {
  detected?: DetectedOfficialTurnover;
  replacement?: ManualTurnover;
  useReplacement: boolean;
}

export type EffectiveTurnover =
  | {
      status: 'available';
      amountEur: number;
      calculationAmountEur: number;
      rangeUpperEur?: number;
      year: number;
      source: DetectedTurnoverSource | ManualTurnoverSource;
      provenance: 'detected' | 'replacement';
      inputKind: 'exact' | 'range';
    }
  | { status: 'omitted'; reason: 'missing-turnover' | 'missing-replacement' };

/**
 * Resolve the one turnover value every downstream caller uses. A typed
 * replacement is inert until the operator explicitly enables it. Range
 * calculations always use the lower bound.
 */
export function resolveEffectiveTurnover(choice: TurnoverChoice): EffectiveTurnover {
  if (choice.useReplacement) {
    const replacement = choice.replacement;
    if (!replacement) return { status: 'omitted', reason: 'missing-replacement' };
    if (replacement.kind === 'range') {
      return {
        status: 'available',
        amountEur: replacement.lowerEur,
        calculationAmountEur: replacement.lowerEur,
        rangeUpperEur: replacement.upperEur,
        year: replacement.year,
        source: replacement.source,
        provenance: 'replacement',
        inputKind: 'range',
      };
    }
    return {
      status: 'available',
      amountEur: replacement.amountEur,
      calculationAmountEur: replacement.amountEur,
      year: replacement.year,
      source: replacement.source,
      provenance: 'replacement',
      inputKind: 'exact',
    };
  }

  const detected = choice.detected;
  if (!detected) return { status: 'omitted', reason: 'missing-turnover' };
  return {
    status: 'available',
    amountEur: detected.amountEur,
    calculationAmountEur: detected.amountEur,
    year: detected.year,
    source: detected.source,
    provenance: 'detected',
    inputKind: 'exact',
  };
}
