import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { ImageOff } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import type { BadgeTone } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { Field } from '../components/ui/field';
import { Select } from '../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../components/ui/table';
import { useI18n } from '../i18n/provider';
import { vocabularyLabel } from '../lib/vocabulary';
import { formatDateTime } from '../lib/format';
import { useInsightView } from './insights-model';
import {
  diffVersionOptions,
  evidenceAssetRows,
  evidenceAssetSrc,
  formatByteSize,
  prescanRows,
  scoreDiffRows,
} from './insights-model';
import type { PrescanStatus, ScoreDiffResponse, Severity } from './insights-model';
import type { ProspectDetailResponse, ProspectHubActionability } from './prospects-model';

const STATUS_TONES: Record<PrescanStatus, BadgeTone> = {
  complete: 'accent',
  'blocked-by-robots': 'serious',
  'homepage-unreachable': 'critical',
  'homepage-interstitial-unresolved': 'critical',
};

const SEVERITY_TONES: Record<Severity, BadgeTone> = {
  critical: 'critical',
  serious: 'serious',
  moderate: 'moderate',
  minor: 'minor',
};

/** Both scoring sides, in the order the qualification gate reads them. */
const SCORE_SIDES = ['brokenness', 'ability'] as const;

/** Issue #199: a selected hotel without a score states that plainly, in
 *  place of the score breakdown, instead of leaving the section silent
 *  (which reads as "no problems"). Issue #201: when there is no prescan at
 *  all yet, the notice also offers the one-click remedy instead of only
 *  describing it - the CLI two-step round-trip that left the gap stays
 *  available, but is no longer the only path. */
function NotScoredNotice(props: {
  onRunQuickCheck: (() => void) | undefined;
  isQuickCheckBusy: boolean;
  action: ProspectHubActionability | undefined;
  blockedReason: string | null;
}): JSX.Element {
  const { strings } = useI18n();
  return (
    <div className="rounded-lg border border-line bg-raised p-4">
      <p className="text-sm font-medium text-ink">{strings.score.notScoredHeading}</p>
      <p className="mt-1 text-sm text-ink-soft">
        {props.onRunQuickCheck !== undefined
          ? strings.score.notScoredBodyWithAction
          : strings.score.notScoredBody}
      </p>
      {props.onRunQuickCheck !== undefined ? (
        <div className="mt-3">
          <Button
            variant="secondary"
            size="sm"
            isLoading={props.isQuickCheckBusy || props.action?.state === 'running'}
            disabled={
              props.isQuickCheckBusy ||
              props.action?.state === 'running' ||
              props.action?.state === 'blocked'
            }
            onClick={props.onRunQuickCheck}
          >
            {strings.score.runQuickCheckAction}
          </Button>
        </div>
      ) : null}
      {props.blockedReason !== null ? (
        <p className="mt-2 text-sm text-ink-soft" role="note">
          {props.blockedReason}
        </p>
      ) : null}
    </div>
  );
}

/** Issue #217: the section's recovery banner for a stale prospect - a
 *  qualification, quick check, or score naming an older pipeline version
 *  than the one currently running. Distinct from NotScoredNotice, which
 *  handles the "never run" case; this one handles "ran, but on an old
 *  version". */
function StaleNotice(props: {
  onRefresh: (() => void) | undefined;
  isRefreshBusy: boolean;
}): JSX.Element {
  const { strings } = useI18n();
  return (
    <div className="rounded-lg border border-sev-serious/40 bg-raised p-4">
      <p className="text-sm text-ink">{strings.hub.quickCheck.staleNotice}</p>
      {props.onRefresh !== undefined ? (
        <div className="mt-3">
          <Button
            variant="secondary"
            size="sm"
            isLoading={props.isRefreshBusy}
            disabled={props.isRefreshBusy}
            onClick={props.onRefresh}
          >
            {strings.hub.quickCheck.refreshAction}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`;
}

/** One evidence screenshot. The bytes come from the asset endpoint; when
 *  they cannot be resolved from this machine, the explicit unavailable
 *  state takes the image's place instead of a broken image. */
function EvidenceAssetFigure(props: {
  src: string;
  name: string;
  alt: string;
  pageRole: string;
  meta: string;
  unavailableText: string;
}): JSX.Element {
  const [failed, setFailed] = useState(false);
  return (
    <Card>
      {failed ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-line bg-raised p-3 text-sm text-ink-soft"
        >
          <ImageOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{props.unavailableText}</span>
        </div>
      ) : (
        <img
          src={props.src}
          alt={props.alt}
          onError={() => setFailed(true)}
          loading="lazy"
          className="w-full rounded-lg border border-line bg-white"
        />
      )}
      <div className="mt-2 flex flex-col gap-1">
        <span className="text-sm font-medium text-ink">{props.name}</span>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="accent">{props.pageRole}</Badge>
          <span className="numeric text-xs text-ink-muted">{props.meta}</span>
        </div>
      </div>
    </Card>
  );
}

/** The hub's second section: the quick check's per-page summary, the
 *  score and its breakdown, and the evidence summaries. The full
 *  per-page metrics and the score version diff sit behind disclosures
 *  (approved IA, section 2). Everything renders from the composed detail
 *  response; only the version diff fetches on demand. */
export function HubQuickCheckSection(props: {
  candidateId: string;
  detail: ProspectDetailResponse;
  /** Issue #201: the page's own handler for the per-hotel quick-check
   *  action. Optional so a caller that has nothing to run (there is none
   *  in this codebase; kept optional for test convenience) still compiles;
   *  this section decides whether to actually render the button, from
   *  prescan being null, not from this prop alone. */
  onRunQuickCheck?: () => void;
  isQuickCheckBusy?: boolean;
  /** Issue #217: the section's recovery action for a stale prospect
   *  (qualification, quick check, or score naming an older pipeline
   *  version). Optional for the same reason as onRunQuickCheck above. */
  onRefresh?: () => void;
  isRefreshBusy?: boolean;
  action?: ProspectHubActionability | undefined;
  blockedReason?: string | null | undefined;
}): JSX.Element {
  const {
    candidateId,
    detail,
    onRunQuickCheck,
    isQuickCheckBusy = false,
    onRefresh,
    isRefreshBusy = false,
    action,
    blockedReason = null,
  } = props;
  const { strings, language } = useI18n();
  const isStale =
    detail.qualificationFreshness.state === 'stale' ||
    detail.prescanFreshness.state === 'stale' ||
    detail.scoreFreshness.state === 'stale';
  const [showMetrics, setShowMetrics] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [fromVersion, setFromVersion] = useState('');
  const [toVersion, setToVersion] = useState('');

  const prescan = detail.prescan;
  const score = detail.score;
  const evidence = detail.evidence;
  const hasAnything = prescan !== null || score !== null || evidence !== null;

  // The diff selects seed from the score's own version: the one version
  // the payload guarantees to exist.
  const scoringVersion = score?.scoringVersion;
  useEffect(() => {
    if (scoringVersion !== undefined) {
      setFromVersion((current) => current || scoringVersion);
      setToVersion((current) => current || scoringVersion);
    }
  }, [scoringVersion]);

  const diffPath =
    candidateId === undefined ||
    !showDiff ||
    fromVersion === '' ||
    toVersion === '' ||
    score === null
      ? null
      : `/api/prospects/${encodeURIComponent(candidateId)}/score/diff?from=${encodeURIComponent(fromVersion)}&to=${encodeURIComponent(toVersion)}`;
  const diff = useInsightView<ScoreDiffResponse>(diffPath);

  if (!hasAnything) {
    return (
      <Card title={strings.hub.steps['quick-check']}>
        <div className="flex flex-col gap-4">
          {isStale ? <StaleNotice onRefresh={onRefresh} isRefreshBusy={isRefreshBusy} /> : null}
          <EmptyState title={strings.hub.quickCheck.empty} />
          {detail.selectionVerdict?.inSelection === true ? (
            <NotScoredNotice
              onRunQuickCheck={onRunQuickCheck}
              isQuickCheckBusy={isQuickCheckBusy}
              action={action}
              blockedReason={blockedReason}
            />
          ) : null}
        </div>
      </Card>
    );
  }

  const versionOptions = score !== null ? diffVersionOptions(score, diff.data) : [];

  return (
    <Card title={strings.hub.steps['quick-check']}>
      <div className="flex flex-col gap-6">
        {isStale ? <StaleNotice onRefresh={onRefresh} isRefreshBusy={isRefreshBusy} /> : null}
        {prescan !== null ? (
          <div>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-ink-muted">{strings.prescan.statusLabel}</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge tone={STATUS_TONES[prescan.status]}>{prescan.status}</Badge>
                  <Badge tone="neutral">
                    <span className="ident">{prescan.prescanVersion}</span>
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">{strings.prescan.scannedAtLabel}</dt>
                <dd className="mt-1 text-sm text-ink">
                  {formatDateTime(prescan.startedAt, language)}
                </dd>
              </div>
            </dl>
            <div className="mt-3">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>{strings.prescan.columns.role}</TableHeaderCell>
                    <TableHeaderCell>{strings.prescan.columns.status}</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {prescanRows(prescan).map((row) => (
                    <TableRow key={row.role}>
                      <TableCell className="text-ink">
                        {vocabularyLabel(strings.prescan.roleLabels, row.role, row.role)}
                      </TableCell>
                      {row.page !== null ? (
                        <TableCell className="numeric">{row.page.httpStatus ?? '-'}</TableCell>
                      ) : (
                        <TableCell className="text-ink-muted">{row.reason}</TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-3">
              <Button
                variant="secondary"
                size="sm"
                aria-expanded={showMetrics}
                onClick={() => {
                  setShowMetrics((current) => !current);
                }}
              >
                {showMetrics
                  ? strings.hub.quickCheck.hideMetrics
                  : strings.hub.quickCheck.metricsDisclosure}
              </Button>
              {showMetrics ? (
                <div className="mt-3">
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>
                          {strings.hub.quickCheck.metricsColumns.page}
                        </TableHeaderCell>
                        <TableHeaderCell className="text-right">
                          {strings.hub.quickCheck.metricsColumns.lcp}
                        </TableHeaderCell>
                        <TableHeaderCell className="text-right">
                          {strings.hub.quickCheck.metricsColumns.cls}
                        </TableHeaderCell>
                        <TableHeaderCell className="text-right">
                          {strings.hub.quickCheck.metricsColumns.blocking}
                        </TableHeaderCell>
                        <TableHeaderCell className="text-right">
                          {strings.hub.quickCheck.metricsColumns.requests}
                        </TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {prescan.pages.map((page) => (
                        <TableRow key={page.role}>
                          <TableCell className="text-ink">
                            {vocabularyLabel(strings.prescan.roleLabels, page.role, page.role)}
                          </TableCell>
                          <TableCell className="numeric text-right">
                            {page.metrics?.largestContentfulPaintMs ?? '-'}
                          </TableCell>
                          <TableCell className="numeric text-right">
                            {page.metrics?.cumulativeLayoutShift ?? '-'}
                          </TableCell>
                          <TableCell className="numeric text-right">
                            {page.metrics?.mainThreadBlockingMs ?? '-'}
                          </TableCell>
                          <TableCell className="numeric text-right">
                            {page.metrics?.requestCount ?? '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {score !== null ? (
          <div>
            <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {strings.score.breakdownHeading}
              </h3>
              <span className="ident text-xs text-ink-muted">{score.scoringVersion}</span>
              <span className="numeric text-xs text-ink-muted">
                {strings.score.computedAtLabel} {formatDateTime(score.computedAt, language)}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {SCORE_SIDES.map((side) => (
                <Card
                  key={side}
                  title={strings.labels.scoreSide[side]}
                  description={`${strings.score.totalLabel} ${score[side].total}`}
                >
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>
                          {strings.score.breakdownColumns.component}
                        </TableHeaderCell>
                        <TableHeaderCell className="w-20 text-right">
                          {strings.score.breakdownColumns.value}
                        </TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {score[side].components.map((component) => (
                        <TableRow key={component.id}>
                          <TableCell className="text-ink">
                            {vocabularyLabel(
                              strings.score.componentLabels,
                              component.id,
                              component.id,
                            )}
                          </TableCell>
                          <TableCell className="numeric text-right text-ink">
                            {component.points}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              ))}
            </div>
            <div className="mt-3">
              <Button
                variant="secondary"
                size="sm"
                aria-expanded={showDiff}
                onClick={() => {
                  setShowDiff((current) => !current);
                }}
              >
                {strings.score.diffHeading}
              </Button>
              {showDiff ? (
                <div className="mt-3">
                  <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label={strings.score.diffFromLabel} htmlFor="hub-score-diff-from">
                      <Select
                        id="hub-score-diff-from"
                        value={fromVersion}
                        onChange={(event) => setFromVersion(event.target.value)}
                      >
                        {versionOptions.map((version) => (
                          <option key={version} value={version}>
                            {version}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={strings.score.diffToLabel} htmlFor="hub-score-diff-to">
                      <Select
                        id="hub-score-diff-to"
                        value={toVersion}
                        onChange={(event) => setToVersion(event.target.value)}
                      >
                        {versionOptions.map((version) => (
                          <option key={version} value={version}>
                            {version}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  {diff.data !== undefined ? (
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableHeaderCell>{strings.score.diffColumns.field}</TableHeaderCell>
                          <TableHeaderCell className="w-28 text-right">
                            {strings.score.diffColumns.before}
                          </TableHeaderCell>
                          <TableHeaderCell className="w-28 text-right">
                            {strings.score.diffColumns.after}
                          </TableHeaderCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {scoreDiffRows(diff.data).map((row) => (
                          <TableRow key={row.field}>
                            <TableCell className="text-ink">
                              {strings.labels.scoreSide[row.field]}
                            </TableCell>
                            <TableCell className="numeric text-right">
                              {row.before ?? '-'}
                            </TableCell>
                            <TableCell className="numeric text-right">
                              {row.after ?? '-'}
                              {row.after !== null && row.delta !== null && row.delta !== 0 ? (
                                <span className="ml-2 text-xs text-ink-muted">
                                  {formatDelta(row.delta)}
                                </span>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-sm text-ink-muted">{strings.common.loading}</p>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {score === null && detail.selectionVerdict?.inSelection === true ? (
          <NotScoredNotice
            onRunQuickCheck={prescan === null ? onRunQuickCheck : undefined}
            isQuickCheckBusy={isQuickCheckBusy}
            action={action}
            blockedReason={blockedReason}
          />
        ) : null}

        {evidence !== null ? (
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {strings.evidence.title}
            </h3>
            {evidenceAssetRows(evidence).some(({ asset }) => asset.state === 'captured') ? (
              <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                {evidenceAssetRows(evidence).map(({ slot, asset }) =>
                  asset.state === 'captured' ? (
                    <EvidenceAssetFigure
                      key={slot}
                      src={evidenceAssetSrc(candidateId, slot)}
                      name={strings.evidence.assetNames[slot]}
                      alt={asset.altText[language] || strings.evidence.assetNames[slot]}
                      pageRole={asset.pageRole}
                      meta={`${asset.width}x${asset.height} · ${formatByteSize(asset.byteSize)} · ${asset.selectionReason}`}
                      unavailableText={strings.evidence.unavailable}
                    />
                  ) : null,
                )}
              </div>
            ) : null}
            {evidence.summaries.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {evidence.summaries.map((summary, index) => (
                  <li key={index} className="flex flex-wrap items-center gap-2">
                    <Badge tone={SEVERITY_TONES[summary.severity]}>
                      {strings.common.severityLabels[summary.severity]}
                    </Badge>
                    <span className="text-sm text-ink">
                      {language === 'fr' ? summary.observation.fr : summary.observation.en}
                    </span>
                    {summary.wcagCriteria.length > 0 ? (
                      <span className="numeric text-xs text-ink-muted">
                        WCAG {summary.wcagCriteria.join(', ')}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
