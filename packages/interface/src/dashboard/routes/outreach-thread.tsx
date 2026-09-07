import type { JSX } from 'react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { PAGE_WIDTH, PageHeader } from '../components/page-header';
import { Badge } from '../components/ui/badge';
import type { BadgeTone } from '../components/ui/badge';
import { Button, buttonStyles } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { Skeleton } from '../components/ui/skeleton';
import { useI18n } from '../i18n/provider';
import { sendJson } from '../lib/api';
import { useInsightView } from './insights-model';
import {
  canGenerateFollowUp,
  type OutreachDraftActionResponse,
  type OutreachThreadResponse,
} from './prospects-model';

const STATE_TONES: Record<string, BadgeTone> = {
  'e1-drafted': 'accent',
  'e1-sent': 'accent',
  'e2-drafted': 'accent',
  'e2-sent': 'accent',
  'e3-drafted': 'accent',
  'e3-sent': 'accent',
  closed: 'neutral',
};

function stateLabel(
  state: string,
  states: Record<
    'e1-drafted' | 'e1-sent' | 'e2-drafted' | 'e2-sent' | 'e3-drafted' | 'e3-sent' | 'closed',
    string
  >,
): string {
  return state in states ? states[state as keyof typeof states] : state;
}

export function OutreachThreadPage(): JSX.Element {
  const { candidateId } = useParams<{ candidateId: string }>();
  const { strings } = useI18n();
  const path =
    candidateId === undefined ? null : `/api/prospects/${encodeURIComponent(candidateId)}/outreach`;
  const { data, error, refresh } = useInsightView<OutreachThreadResponse>(path);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const runAction = async (actionPath: string, successMessage: string): Promise<void> => {
    setIsSubmitting(true);
    try {
      const result = await sendJson<OutreachDraftActionResponse>(actionPath, 'POST', {});
      if (result.created) {
        toast.success(successMessage);
      } else {
        toast.error(strings.outreachThread.actionRefused);
      }
      refresh();
    } catch {
      toast.error(strings.outreachThread.actionError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGenerateFirstEmail = (): void => {
    if (candidateId === undefined) return;
    void runAction(
      `/api/prospects/${encodeURIComponent(candidateId)}/outreach/draft`,
      strings.outreachThread.draftCreated,
    );
  };

  const handleGenerateFollowUp = (): void => {
    if (candidateId === undefined) return;
    void runAction(
      `/api/prospects/${encodeURIComponent(candidateId)}/outreach/follow-up`,
      strings.outreachThread.followUpCreated,
    );
  };

  let body: JSX.Element;
  if (error !== undefined && data === undefined) {
    body = (
      <EmptyState
        title={strings.common.requestFailed}
        description={error}
        action={
          <Button variant="secondary" onClick={refresh}>
            {strings.common.retry}
          </Button>
        }
      />
    );
  } else if (data === undefined) {
    body = (
      <Card>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
        </div>
      </Card>
    );
  } else if (data.thread === null) {
    body = (
      <EmptyState
        title={strings.outreachThread.noThread}
        action={
          <Button onClick={handleGenerateFirstEmail} disabled={isSubmitting}>
            {strings.outreachThread.generateFirstEmail}
          </Button>
        }
      />
    );
  } else {
    const thread = data.thread;
    body = (
      <Card>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-ink-muted">{strings.outreachThread.stateLabel}</dt>
            <dd className="mt-1">
              <Badge tone={STATE_TONES[thread.state] ?? 'neutral'}>
                {stateLabel(thread.state, strings.outreachThread.states)}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">{strings.outreachThread.touchLabel}</dt>
            <dd className="mt-1 text-sm text-ink">{thread.currentTouch}</dd>
          </div>
        </dl>
        {canGenerateFollowUp(thread.state) ? (
          <div className="mt-4 border-t border-line pt-4">
            <Button onClick={handleGenerateFollowUp} disabled={isSubmitting}>
              {strings.outreachThread.generateFollowUp}
            </Button>
          </div>
        ) : null}
      </Card>
    );
  }

  return (
    <article className={PAGE_WIDTH.reading}>
      <PageHeader
        title={strings.outreachThread.title}
        description={strings.outreachThread.description}
        actions={
          candidateId !== undefined ? (
            <Link
              to={`/prospects/${encodeURIComponent(candidateId)}`}
              className={buttonStyles('secondary', 'sm')}
            >
              {strings.operator.backToProspects}
            </Link>
          ) : null
        }
      />
      {body}
    </article>
  );
}
