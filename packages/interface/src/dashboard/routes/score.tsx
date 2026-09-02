import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Link, useParams } from 'react-router';
import { PageHeader } from '../components/page-header';
import { Button, buttonStyles } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { Field } from '../components/ui/field';
import { KpiTile } from '../components/ui/kpi';
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
import { vocabularyLabel } from '../lib/vocabulary';
import { formatDateTime } from '../lib/format';
import {
  diffVersionOptions,
  scoreComponentRows,
  scoreDiffRows,
  useInsightView,
} from './insights-model';
import type { ScoreDiffResponse, ScoreResponse } from './insights-model';

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
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiTile label={strings.score.totalLabel} value={data.brokenness.total} />
          <KpiTile
            label={strings.score.versionLabel}
            value={data.scoringVersion}
            className="col-span-2"
          />
          <KpiTile
            label={strings.score.computedAtLabel}
            value={formatDateTime(data.computedAt, language)}
          />
        </div>
        <Card
          title={strings.score.breakdownHeading}
          className="mb-4"
          description={strings.score.breakdownSummary
            .replace('{x}', String(data.brokenness.total))
            .replace('{y}', String(data.ability.total))}
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
              {scoreComponentRows(data).map(({ group, component }) => (
                <TableRow key={`${group}-${component.id}`}>
                  <TableCell className="text-ink">
                    {/* An unknown component id keeps its raw code: the id is
                        the precise handle the report and the store share. */}
                    {vocabularyLabel(strings.score.componentLabels, component.id, component.id)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{component.points}</TableCell>
                  <TableCell className="text-ink-muted">{component.reason}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
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
                    <TableCell className="text-ink">{row.field}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.before ?? '-'}</TableCell>
                    <TableCell className="text-right tabular-nums">
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
    <article>
      <PageHeader
        title={strings.score.title}
        description={strings.score.description}
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
