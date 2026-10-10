import { useCallback, useState } from 'react';
import type { JSX } from 'react';
import { Send } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { PageHeader } from '../components/page-header';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { CoverageBar, type CoverageSegmentKind } from '../components/ui/coverage-bar';
import { EmptyState } from '../components/ui/empty-state';
import { InfoTip } from '../components/ui/info-tip';
import type { KpiValueState } from '../components/ui/kpi';
import { ProgressBar } from '../components/ui/progress-bar';
import { SegmentedControl } from '../components/ui/segmented';
import { Skeleton } from '../components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../components/ui/table';
import { useI18n } from '../i18n/provider';
import type { DashboardLanguage, DashboardStrings } from '../i18n/types';
import { fetchJsonValidated } from '../lib/api';
import { outreachFunnelPageSchema } from '../lib/api-schemas';
import { cn } from '../lib/cn';
import { formatDate } from '../lib/format';
import { usePolling } from '../lib/use-polling';
import {
  CAMPAIGN_FACETS,
  buildCampaignView,
  formatRate,
  hasDeliveredFirstEmail,
  selectCampaign,
  type CampaignFacet,
  type CampaignView,
  type CheckpointRow,
  type StandingKey,
} from './campaign-model';

type CampaignCopy = DashboardStrings['campaign'];

/** The page is a reading column, not an operator table. */
const COLUMN = 'mx-auto w-full max-w-5xl';

/** The strip reuses the coverage bar: drawn to scale, strongest ink for the
 *  strongest claim, every count repeated as text in its legend. A thread
 *  closed for an unlisted reason is detached and hatched, as anything the
 *  page cannot place is. */
const STANDING_KIND: Record<StandingKey, CoverageSegmentKind> = {
  replied: 'measured',
  silent: 'checked',
  'reply-window': 'reached',
  'in-sequence': 'excluded',
  'closed-other': 'omitted',
};

/** A stored UTC day, printed in the dashboard language. Noon keeps the
 *  calendar day the same in every European time zone. */
function day(value: string, language: DashboardLanguage): string {
  return formatDate(`${value}T12:00:00.000Z`, language);
}

function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (text, [token, value]) => text.replace(`{${token}}`, String(value)),
    template,
  );
}

/**
 * Plan 078: one campaign in the unit the brief's checkpoints are written
 * in. Read-only: it prepares nothing, sends nothing and changes no
 * prospect. Counts the operator can stand behind, and no verdict.
 */
export function CampaignPage(): JSX.Element {
  const { strings, language } = useI18n();
  const copy = strings.campaign;
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useCallback(
    (signal: AbortSignal) =>
      fetchJsonValidated('/api/outreach/funnel', outreachFunnelPageSchema, { signal }),
    [],
  );
  // Fetched once per visit; the counts move with a mailbox sync, not by the second.
  const funnel = usePolling(fetcher, 0, { key: 'campaign' });
  const [facet, setFacet] = useState<CampaignFacet>('stars');

  const campaigns = funnel.data?.campaigns ?? [];
  const selected = selectCampaign(campaigns, searchParams.get('campagne'));
  const view =
    selected === undefined
      ? undefined
      : buildCampaignView(selected, new Date().toISOString().slice(0, 10));
  const state: KpiValueState =
    funnel.data !== undefined ? 'loaded' : funnel.error !== undefined ? 'unavailable' : 'loading';

  const description =
    view === undefined
      ? undefined
      : view.firstSendDay === undefined
        ? fill(copy.descriptionNoSend, { campaign: view.campaignVersion })
        : fill(copy.description, {
            campaign: view.campaignVersion,
            date: day(view.firstSendDay, language),
          });

  return (
    <article className={COLUMN}>
      <PageHeader
        title={strings.nav.campaign}
        description={description}
        meta={
          campaigns.length > 1 && selected !== undefined ? (
            <SegmentedControl
              value={selected.campaignVersion}
              onValueChange={(campaignVersion) =>
                setSearchParams({ campagne: campaignVersion }, { replace: true })
              }
              options={campaigns.map((campaign) => ({
                value: campaign.campaignVersion,
                label: campaign.campaignVersion,
              }))}
              ariaLabel={copy.campaignSwitchAria}
            />
          ) : undefined
        }
      />
      {state === 'unavailable' ? (
        <div className="mb-4 flex flex-wrap items-center gap-3" role="alert">
          <p className="text-sm text-ink-muted">{strings.common.requestFailed}</p>
          <Button variant="secondary" size="sm" onClick={funnel.refresh}>
            {strings.common.retry}
          </Button>
        </div>
      ) : null}
      {state === 'loaded' && !hasDeliveredFirstEmail(campaigns) ? (
        <EmptyState icon={Send} title={copy.empty} description={copy.emptyDescription} />
      ) : (
        <>
          <KpiRow view={view} state={state} copy={copy} language={language} strings={strings} />
          {view === undefined ? (
            state === 'loading' ? (
              <Card>
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 5 }, (_, index) => (
                    <Skeleton key={index} className="h-10 w-full" />
                  ))}
                </div>
              </Card>
            ) : null
          ) : (
            <>
              <StandingCard view={view} copy={copy} language={language} />
              <CheckpointsCard view={view} copy={copy} language={language} />
              <RepliesCard view={view} copy={copy} strings={strings} />
              <SegmentsCard
                view={view}
                copy={copy}
                strings={strings}
                language={language}
                facet={facet}
                onFacetChange={setFacet}
              />
              <footer className="mt-6 flex flex-col gap-1 text-xs text-ink-muted">
                <p>{copy.footnote.delivered}</p>
                <p>{copy.footnote.matured}</p>
                <p>{fill(copy.footnote.merged, { count: view.merged })}</p>
                <p>{copy.footnote.retention}</p>
              </footer>
            </>
          )}
        </>
      )}
    </article>
  );
}

function KpiRow(props: {
  view: CampaignView | undefined;
  state: KpiValueState;
  copy: CampaignCopy;
  language: DashboardLanguage;
  strings: DashboardStrings;
}): JSX.Element {
  const { view, state, copy, language, strings } = props;
  const tiles = [
    {
      label: copy.kpi.delivered,
      value: view?.delivered,
      note: view && fill(copy.kpi.deliveredNote, { bounced: view.bounced }),
    },
    {
      label: copy.kpi.matured,
      value: view?.matured,
      note: view && fill(copy.kpi.maturedNote, { rate: formatRate(view.maturedShare, language) }),
    },
    {
      label: copy.kpi.replies,
      value: view?.replies,
      note:
        view &&
        fill(copy.kpi.repliesNote, {
          positive: view.positiveReplies,
          objections: view.objections,
        }),
    },
    { label: copy.kpi.won, value: view?.won, note: copy.kpi.wonNote },
  ];
  return (
    <dl className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-xl border border-line bg-panel px-4 py-3">
          <dt className="text-xs text-ink-muted">{tile.label}</dt>
          {state === 'loading' ? (
            <dd>
              <Skeleton className="mt-1 h-7 w-12" />
            </dd>
          ) : (
            <dd
              className={cn(
                'numeric text-xl font-semibold tracking-tight',
                // A failed load is never a zero (DESIGN.md, Evidence Desk).
                tile.value === undefined ? 'text-ink-muted' : 'text-ink',
              )}
            >
              {tile.value ?? strings.common.valueUnavailable}
            </dd>
          )}
          {tile.value !== undefined && tile.note ? (
            <dd className="mt-0.5 text-xs text-ink-muted">{tile.note}</dd>
          ) : null}
        </div>
      ))}
    </dl>
  );
}

function StandingCard(props: {
  view: CampaignView;
  copy: CampaignCopy;
  language: DashboardLanguage;
}): JSX.Element {
  const { view, copy, language } = props;
  const labels: Record<StandingKey, string> = {
    replied: copy.standing.replied,
    silent: copy.standing.silent,
    'reply-window': copy.standing.replyWindow,
    'in-sequence': copy.standing.inSequence,
    'closed-other': copy.standing.closedOther,
  };
  return (
    <Card title={copy.standing.heading} className="mb-4">
      <CoverageBar
        caption={copy.standing.caption}
        segments={view.standing.map((segment) => ({
          kind: STANDING_KIND[segment.key],
          label: labels[segment.key],
          value: segment.count,
        }))}
      />
      <p className="mt-4 text-sm text-ink-soft">
        {view.nextMaturityDay === undefined
          ? copy.standing.noneWaiting
          : fill(copy.standing.nextMaturity, {
              date: day(view.nextMaturityDay, language),
              count: view.maturingWithinSevenDays,
            })}
      </p>
    </Card>
  );
}

/** What a checkpoint row says about its date, and the muted line under it.
 *  Dated and estimated are worded differently on purpose (decision 6). */
function checkpointDate(
  row: CheckpointRow,
  copy: CampaignCopy,
  language: DashboardLanguage,
): { text: string; hint?: string } {
  const { status } = row;
  switch (status.kind) {
    case 'reached':
      return status.reachedOn === undefined
        ? { text: copy.checkpoints.reachedNoDay }
        : {
            text: fill(copy.checkpoints.reachedOn, { date: day(status.reachedOn.day, language) }),
            hint: fill(copy.checkpoints.reachedThatDay, {
              replies: status.reachedOn.replies,
              positive: status.reachedOn.positiveReplies,
            }),
          };
    case 'dated':
      return {
        text: fill(copy.checkpoints.dated, { date: day(status.day, language) }),
        hint: copy.checkpoints.datedHint,
      };
    case 'estimated':
      return {
        text: fill(copy.checkpoints.estimated, {
          date: day(status.day, language),
          pace: new Intl.NumberFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
            maximumFractionDigits: 1,
          }).format(status.firstTouchesPerDay),
        }),
      };
    case 'no-estimate':
      return { text: copy.checkpoints.noEstimate, hint: copy.checkpoints.noEstimateHint };
  }
}

function CheckpointsCard(props: {
  view: CampaignView;
  copy: CampaignCopy;
  language: DashboardLanguage;
}): JSX.Element {
  const { view, copy, language } = props;
  return (
    <Card
      title={copy.checkpoints.heading}
      description={copy.checkpoints.description}
      className="mb-4"
    >
      <ul className="flex flex-col divide-y divide-line">
        {view.checkpoints.map((row) => {
          const date = checkpointDate(row, copy, language);
          const rule = copy.checkpoints.rules[String(row.checkpoint) as '100' | '300' | '500'];
          return (
            <li key={row.checkpoint} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <h3 className="text-sm font-medium text-ink">
                  {fill(copy.checkpoints.rowHeading, { checkpoint: row.checkpoint })}
                </h3>
                <p className="numeric text-sm font-semibold text-ink">
                  {row.matured} / {row.checkpoint}
                </p>
              </div>
              <div className="mt-2">
                <ProgressBar
                  value={row.progress}
                  ariaLabel={fill(copy.checkpoints.progressAria, {
                    matured: row.matured,
                    checkpoint: row.checkpoint,
                  })}
                />
              </div>
              <p className="mt-2 text-sm text-ink-soft">{date.text}</p>
              {date.hint !== undefined ? (
                <p className="text-xs text-ink-muted">{date.hint}</p>
              ) : null}
              {rule !== undefined ? (
                <p className="mt-2 max-w-reading text-xs text-ink-muted">{rule}</p>
              ) : null}
              <p className="mt-1 text-xs text-ink-soft">
                {fill(copy.checkpoints.measured, {
                  replies: view.replies,
                  positive: view.positiveReplies,
                  won: view.won,
                })}
              </p>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function RepliesCard(props: {
  view: CampaignView;
  copy: CampaignCopy;
  strings: DashboardStrings;
}): JSX.Element {
  const { view, copy, strings } = props;
  const reasonLabels: Record<string, string> = {
    ...strings.labels.lostReason,
    unspecified: copy.replies.unspecified,
  };
  return (
    <Card title={copy.replies.heading} className="mb-4">
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h3 className="mb-2 text-xs font-medium text-ink-muted">{copy.replies.byTouchHeading}</h3>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell scope="col">{copy.replies.touchColumn}</TableHeaderCell>
                <TableHeaderCell scope="col" className="text-right">
                  {copy.replies.countColumn}
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {view.repliesByLastTouch.map((row) => (
                <TableRow key={row.touch}>
                  <RowHeader>{copy.replies.touchLabels[row.touch]}</RowHeader>
                  <TableCell className="numeric text-right">{row.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
        <section>
          <h3 className="mb-2 text-xs font-medium text-ink-muted">{copy.replies.declineHeading}</h3>
          {view.declineReasons.length === 0 ? (
            <p className="text-sm text-ink-muted">{copy.replies.noDecline}</p>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell scope="col">{copy.replies.reasonColumn}</TableHeaderCell>
                  <TableHeaderCell scope="col" className="text-right">
                    {copy.replies.countColumn}
                  </TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {view.declineReasons.map((row) => (
                  <TableRow key={row.reason}>
                    <RowHeader>
                      {reasonLabels[row.reason] ?? strings.common.vocabularyFallback}
                    </RowHeader>
                    <TableCell className="numeric text-right">{row.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      </div>
    </Card>
  );
}

function SegmentsCard(props: {
  view: CampaignView;
  copy: CampaignCopy;
  strings: DashboardStrings;
  language: DashboardLanguage;
  facet: CampaignFacet;
  onFacetChange: (facet: CampaignFacet) => void;
}): JSX.Element {
  const { view, copy, strings, language, facet, onFacetChange } = props;
  const labels: Record<CampaignFacet, Record<string, string>> = {
    stars: copy.segments.starLabels,
    groupStatus: strings.labels.group,
    accessibilityCard: copy.segments.accessibilityLabels,
  };
  const segmentLabel = (segment: string): string =>
    segment === 'unknown'
      ? copy.segments.unknown
      : (labels[facet][segment] ?? strings.common.vocabularyFallback);
  const columns = copy.segments.columns;
  return (
    <Card title={copy.segments.heading}>
      {/* In the body, not the card header: three long labels must wrap on a
          narrow screen instead of widening the page. */}
      <div className="mb-3">
        <SegmentedControl
          value={facet}
          onValueChange={onFacetChange}
          options={CAMPAIGN_FACETS.map((value) => ({
            value,
            label: copy.segments.facets[value],
          }))}
          ariaLabel={copy.segments.facetAria}
        />
      </div>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell scope="col">{columns.segment}</TableHeaderCell>
            <TableHeaderCell scope="col" className="text-right">
              {columns.delivered}
            </TableHeaderCell>
            <TableHeaderCell scope="col" className="text-right">
              {columns.matured}
            </TableHeaderCell>
            <TableHeaderCell scope="col" className="text-right">
              {columns.replies}
            </TableHeaderCell>
            <TableHeaderCell scope="col" className="text-right">
              {columns.positiveReplies}
            </TableHeaderCell>
            <TableHeaderCell scope="col" className="text-right">
              <span className="inline-flex items-center gap-1">
                {columns.replyRate}
                <InfoTip label={columns.replyRate} hint={copy.segments.rateHint} />
              </span>
            </TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {view.segments[facet].map((row) => (
            <TableRow key={row.segment}>
              <RowHeader>{segmentLabel(row.segment)}</RowHeader>
              <TableCell className="numeric text-right">{row.delivered}</TableCell>
              <TableCell className="numeric text-right">{row.matured}</TableCell>
              <TableCell className="numeric text-right">{row.replies}</TableCell>
              <TableCell className="numeric text-right">{row.positiveReplies}</TableCell>
              <TableCell className="numeric whitespace-nowrap text-right">
                {formatRate(row.replyRate, language)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

/** A row's own header cell, so each count is announced with its row. */
function RowHeader({ children }: { children: string }): JSX.Element {
  return (
    <TableHeaderCell scope="row" className="py-2.5 text-sm font-normal text-ink">
      {children}
    </TableHeaderCell>
  );
}
