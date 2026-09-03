import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Link, useParams } from 'react-router';
import { PAGE_WIDTH, PageHeader } from '../components/page-header';
import { Button, buttonStyles } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { Field } from '../components/ui/field';
import { Select } from '../components/ui/select';
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
import type { DashboardStrings } from '../i18n/types';
import { vocabularyLabel } from '../lib/vocabulary';
import { formatDateTime } from '../lib/format';
import { diffVersionOptions, scoreDiffRows, useInsightView } from './insights-model';
import type { ScoreDiffResponse, ScoreResponse } from './insights-model';

/** Both scoring sides, in the order the qualification gate reads them.
 *  They are separate scores, not two halves of one total, so the page draws
 *  them as two tables rather than one merged list. */
const SCORE_SIDES = ['brokenness', 'ability'] as const;

/** Version and computation date, the two facts that qualify every number on
 *  this page: a score is only ever read against the weights that produced it. */
function ScoreReadout(props: {
  version: string;
  computedAt: string;
  strings: DashboardStrings;
}): JSX.Element {
  const { version, computedAt, strings } = props;
  return (
    <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
      <div className="flex items-baseline gap-2">
        <dt className="text-ink-muted">{strings.score.versionLabel}</dt>
        <dd className="ident text-ink">{version}</dd>
      </div>
      <div className="flex items-baseline gap-2">
        <dt className="text-ink-muted">{strings.score.computedAtLabel}</dt>
        <dd className="numeric text-ink">{computedAt}</dd>
      </div>
    </dl>
  );
}

function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`;
}

export function ScorePage(): JSX.Element {
  const { candidateId } = useParams<{ candidateId: string }>();
  const { strings, language } = useI18n();
  const basePath =
    candidateId === undefined ? null : `/api/prospects/${encodeURIComponent(candidateId)}`;
  const score = useInsightView<ScoreResponse>(basePath === null ? null : `${basePath}/score`);
  const [fromVersion, setFromVersion] = useState('');
  const [toVersion, setToVersion] = useState('');

  // The diff selects seed from the score's own version once it arrives: it
  // is the one version the route interface guarantees to exist, and an
  // identical-version diff is the honest zero baseline to start from.
  const scoringVersion = score.data?.scoringVersion;
  useEffect(() => {
    if (scoringVersion !== undefined) {
      setFromVersion((current) => current || scoringVersion);
      setToVersion((current) => current || scoringVersion);
    }
  }, [scoringVersion]);

  const diffPath =
    basePath === null || fromVersion === '' || toVersion === ''
      ? null
      : `${basePath}/score/diff?from=${encodeURIComponent(fromVersion)}&to=${encodeURIComponent(toVersion)}`;
  const diff = useInsightView<ScoreDiffResponse>(diffPath);

  let body: JSX.Element;
  if (score.isNotFound) {
    body = <EmptyState title={strings.score.empty} />;
  } else if (score.error !== undefined && score.data === undefined) {
    body = (
      <EmptyState
        title={strings.common.requestFailed}
        description={score.error}
        action={
          <Button variant="secondary" onClick={score.refresh}>
            {strings.common.retry}
          </Button>
        }
      />
    );
  } else if (score.data === undefined) {
    body = (
      <Card>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      </Card>
    );
  } else {
    const data = score.data;
    const versionOptions = diffVersionOptions(score.data, diff.data);
    body = (
      <>
        <h2 className="mb-3 text-xs uppercase tracking-[0.14em] text-ink-muted">
          {strings.score.breakdownHeading}
        </h2>
        {SCORE_SIDES.map((side) => (
          <Card
            key={side}
            title={strings.labels.scoreSide[side]}
            className="mb-4"
            description={`${strings.score.totalLabel} ${data[side].total}`}
          >
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>{strings.score.breakdownColumns.component}</TableHeaderCell>
                  <TableHeaderCell className="w-24 text-right">
                    {strings.score.breakdownColumns.value}
                  </TableHeaderCell>
                  <TableHeaderCell>{strings.score.breakdownColumns.why}</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data[side].components.map((component) => (
                  <TableRow key={component.id}>
                    <TableCell className="whitespace-nowrap text-ink">
                      {/* An unknown component id keeps its raw code: the id is
                          the precise handle the report and the store share. */}
                      {vocabularyLabel(strings.score.componentLabels, component.id, component.id)}
                    </TableCell>
                    <TableCell className="numeric text-right text-ink">
                      {component.points}
                    </TableCell>
                    <TableCell className="text-ink-muted">
                      {/* A reason code with no copy yet renders as its own code
                          rather than as nothing: the operator can still tell why
                          the component scored, and the gap is visible. */}
                      {vocabularyLabel(
                        strings.labels.scoreReason,
                        component.reason,
                        component.reason,
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        ))}
        <Card title={strings.score.diffHeading}>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={strings.score.diffFromLabel} htmlFor="score-diff-from">
              <Select
                id="score-diff-from"
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
            <Field label={strings.score.diffToLabel} htmlFor="score-diff-to">
              <Select
                id="score-diff-to"
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
                    <TableCell className="numeric text-right">{row.before ?? '-'}</TableCell>
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
        </Card>
      </>
    );
  }

  return (
    <article className={PAGE_WIDTH.surface}>
      <PageHeader
        title={strings.score.title}
        subject={candidateId}
        description={strings.score.description}
        meta={
          score.data === undefined ? null : (
            <ScoreReadout
              version={score.data.scoringVersion}
              computedAt={formatDateTime(score.data.computedAt, language)}
              strings={strings}
            />
          )
        }
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
