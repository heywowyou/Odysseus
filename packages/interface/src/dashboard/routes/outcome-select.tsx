import { useState } from 'react';
import type { JSX } from 'react';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { useI18n } from '../i18n/provider';
import { LOST_REASONS, type LostReason } from '../i18n/sections/labels';

/** What the operator chose to record. `requestKey` is made when the choice
 *  is, so confirming it twice or retrying it records one outcome. */
export interface OutcomeChoice {
  outcome: string;
  lostReason?: LostReason;
  requestKey: string;
}

/** Core's outreachLostReasonRule, by value: a refusal says why, a "not now"
 *  may, and no other outcome carries a reason. */
export const LOST_REASON_RULE: Readonly<Record<string, 'required' | 'optional'>> = {
  'reply-negative': 'required',
  lost: 'required',
  'reply-not-now': 'optional',
};

/** The body POST /api/prospects/:id/outcome expects for a choice. */
export function outcomeRequestBody(choice: OutcomeChoice): Record<string, string> {
  return {
    outcome: choice.outcome,
    ...(choice.lostReason === undefined ? {} : { lostReason: choice.lostReason }),
    idempotencyKey: choice.requestKey,
  };
}

/**
 * Plan 078: the one control that records an outcome, on the prospect page
 * and in the Results view. An outcome that carries no reason is chosen in
 * one step, as before. A refusal reveals the reason list and is only handed
 * on once a reason is picked.
 */
export function OutcomeSelect(props: {
  outcomes: readonly string[];
  outcomeLabels: Record<string, string>;
  placeholder: string;
  ariaLabel: string;
  disabled?: boolean;
  onChoose: (choice: OutcomeChoice) => void;
}): JSX.Element {
  const { outcomes, outcomeLabels, placeholder, ariaLabel, disabled, onChoose } = props;
  const { strings } = useI18n();
  const copy = strings.labels.lostReasonControl;
  const [awaitingReason, setAwaitingReason] = useState<string | null>(null);
  const [reason, setReason] = useState<LostReason | ''>('');
  const rule = awaitingReason === null ? undefined : LOST_REASON_RULE[awaitingReason];

  const choose = (outcome: string, lostReason?: LostReason): void => {
    setAwaitingReason(null);
    setReason('');
    onChoose({
      outcome,
      ...(lostReason === undefined ? {} : { lostReason }),
      requestKey: crypto.randomUUID(),
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-44 flex-1">
        <Select
          value={awaitingReason ?? ''}
          disabled={disabled}
          onChange={(event) => {
            const outcome = event.target.value;
            setReason('');
            if (outcome === '') setAwaitingReason(null);
            else if (LOST_REASON_RULE[outcome] !== undefined) setAwaitingReason(outcome);
            else choose(outcome);
          }}
          aria-label={ariaLabel}
        >
          <option value="">{placeholder}</option>
          {outcomes.map((outcome) => (
            <option key={outcome} value={outcome}>
              {outcomeLabels[outcome] ?? strings.common.vocabularyFallback}
            </option>
          ))}
        </Select>
      </div>
      {awaitingReason !== null ? (
        <>
          <div className="min-w-44 flex-1">
            <Select
              value={reason}
              disabled={disabled}
              onChange={(event) => setReason(event.target.value as LostReason | '')}
              aria-label={copy.label}
            >
              <option value="">{rule === 'optional' ? copy.none : copy.placeholder}</option>
              {LOST_REASONS.map((value) => (
                <option key={value} value={value}>
                  {strings.labels.lostReason[value]}
                </option>
              ))}
            </Select>
          </div>
          <Button
            size="sm"
            disabled={disabled === true || (rule === 'required' && reason === '')}
            onClick={() => choose(awaitingReason, reason === '' ? undefined : reason)}
          >
            {copy.submit}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAwaitingReason(null)}>
            {strings.common.cancel}
          </Button>
        </>
      ) : null}
    </div>
  );
}
