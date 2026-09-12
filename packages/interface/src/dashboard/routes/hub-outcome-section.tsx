import { useState } from 'react';
import type { JSX } from 'react';
import { toast } from 'sonner';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { ConfirmDialog } from '../components/ui/dialog';
import { Field } from '../components/ui/field';
import { Select } from '../components/ui/select';
import { useI18n } from '../i18n/provider';
import { sendJson } from '../lib/api';
import { vocabularyLabel } from '../lib/vocabulary';
import { formatDateTime } from '../lib/format';
import type { ProspectDetailResponse } from './prospects-model';

type OutcomeRow = ProspectDetailResponse['outcomes']['rows'][number];

/** The closed outcome vocabulary the record endpoint accepts, minus
 *  opt-out: that one is the dedicated danger action below, because it
 *  also suppresses the address and withdraws every live preview, which a
 *  mere outcome event must never do silently. By-value from
 *  @odysseus/core's OUTREACH_OUTCOMES: the dashboard project reads no
 *  workspace packages. */
const FORM_OUTCOMES = [
  'no-reply',
  'reply-positive',
  'reply-not-now',
  'reply-negative',
  'call',
  'quoted',
  'won',
  'lost',
] as const;

const LOST_REASONS = [
  'budget',
  'timing',
  'not-a-priority',
  'existing-provider',
  'scope-mismatch',
  'other',
] as const;

type FormOutcome = (typeof FORM_OUTCOMES)[number];

/** The hub's sixth section: the outcome history, the outcome form (the
 *  capability the slice 1 audit found missing from the dashboard), and
 *  the opt-out action with its own confirmation text (approved IA,
 *  section 6). */
export function HubOutcomeSection(props: {
  thread: ProspectDetailResponse['thread'];
  outcomes: ProspectDetailResponse['outcomes'];
  refresh: () => void;
}): JSX.Element {
  const { thread, outcomes, refresh } = props;
  const { strings, language } = useI18n();

  const [outcome, setOutcome] = useState<FormOutcome | ''>('');
  const [lostReason, setLostReason] = useState<(typeof LOST_REASONS)[number] | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOptingOut, setIsOptingOut] = useState(false);
  const [isOptOutOpen, setIsOptOutOpen] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);

  const submitOutcome = async (): Promise<void> => {
    if (thread === null || outcome === '') return;
    setIsSubmitting(true);
    setActionFailed(false);
    try {
      await sendJson(
        `/api/outreach/threads/${encodeURIComponent(thread.threadId)}/outcome`,
        'POST',
        {
          outcome,
          ...(outcome === 'lost' && lostReason !== '' ? { lostReason } : {}),
        },
      );
      toast.success(strings.hub.outcome.recorded);
      setOutcome('');
      setLostReason('');
      refresh();
    } catch {
      setActionFailed(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitOptOut = async (): Promise<void> => {
    if (thread === null) return;
    setIsOptingOut(true);
    setActionFailed(false);
    try {
      await sendJson(
        `/api/outreach/threads/${encodeURIComponent(thread.threadId)}/opt-out`,
        'POST',
        {},
      );
      toast.success(strings.hub.outcome.optOutDone);
      refresh();
    } catch {
      setActionFailed(true);
    } finally {
      setIsOptingOut(false);
    }
  };

  return (
    <Card title={strings.hub.steps.outcome}>
      {thread?.currentOutcome != null ? (
        <p className="text-sm text-ink">
          <span className="font-medium">
            {vocabularyLabel(
              strings.labels.outcome,
              thread.currentOutcome.outcome,
              strings.common.vocabularyFallback,
            )}
          </span>
          {thread.currentOutcome.lostReason !== null
            ? ` (${vocabularyLabel(
                strings.labels.lostReason,
                thread.currentOutcome.lostReason,
                strings.common.vocabularyFallback,
              )})`
            : ''}{' '}
          · {formatDateTime(thread.currentOutcome.recordedAt, language)}
        </p>
      ) : null}

      {outcomes.rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">{strings.prospectDetail.outcomeNone}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1">
          {outcomes.rows.map((event) => (
            <OutcomeEventRow key={event.outcomeId} event={event} />
          ))}
        </ul>
      )}

      {thread !== null ? (
        <div className="mt-4 border-t border-line pt-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {strings.hub.outcome.formHeading}
          </h3>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label={strings.hub.outcome.outcomeLabel} htmlFor="hub-outcome-value">
              <Select
                id="hub-outcome-value"
                value={outcome}
                onChange={(event) => setOutcome(event.target.value as FormOutcome | '')}
              >
                <option value="">-</option>
                {FORM_OUTCOMES.map((value) => (
                  <option key={value} value={value}>
                    {vocabularyLabel(strings.labels.outcome, value, value)}
                  </option>
                ))}
              </Select>
            </Field>
            {outcome === 'lost' ? (
              <Field label={strings.hub.outcome.lostReasonLabel} htmlFor="hub-outcome-lost">
                <Select
                  id="hub-outcome-lost"
                  value={lostReason}
                  onChange={(event) =>
                    setLostReason(event.target.value as (typeof LOST_REASONS)[number] | '')
                  }
                >
                  <option value="">-</option>
                  {LOST_REASONS.map((value) => (
                    <option key={value} value={value}>
                      {vocabularyLabel(strings.labels.lostReason, value, value)}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Button
              size="sm"
              isLoading={isSubmitting}
              disabled={isSubmitting || outcome === ''}
              onClick={() => {
                void submitOutcome();
              }}
            >
              {strings.hub.outcome.submit}
            </Button>
            <Button
              variant="danger"
              size="sm"
              isLoading={isOptingOut}
              disabled={isOptingOut}
              onClick={() => {
                setIsOptOutOpen(true);
              }}
            >
              {strings.outcomes.optOut}
            </Button>
          </div>
          {actionFailed ? (
            <p className="mt-3 text-sm text-danger" role="alert">
              {strings.hub.outcome.actionError}
            </p>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={isOptOutOpen}
        onOpenChange={setIsOptOutOpen}
        title={strings.hub.outcome.optOutConfirmTitle}
        description={strings.hub.outcome.optOutConfirmBody}
        confirmLabel={strings.outcomes.optOut}
        cancelLabel={strings.common.cancel}
        onConfirm={submitOptOut}
      />
    </Card>
  );
}

function OutcomeEventRow(props: { event: OutcomeRow }): JSX.Element {
  const { event } = props;
  const { strings, language } = useI18n();
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm text-ink">
      <Badge tone={event.outcome === 'won' ? 'accent' : 'neutral'}>
        {vocabularyLabel(strings.labels.outcome, event.outcome, strings.common.vocabularyFallback)}
      </Badge>
      {event.lostReason !== null ? (
        <span className="text-xs text-ink-muted">
          {vocabularyLabel(
            strings.labels.lostReason,
            event.lostReason,
            strings.common.vocabularyFallback,
          )}
        </span>
      ) : null}
      <span className="text-xs text-ink-muted">
        {event.actor} · {formatDateTime(event.recordedAt, language)}
      </span>
    </li>
  );
}
