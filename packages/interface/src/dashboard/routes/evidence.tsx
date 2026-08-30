import type { JSX } from 'react';
import { Link, useParams } from 'react-router';
import { PageHeader } from '../components/page-header';
import { Badge } from '../components/ui/badge';
import type { BadgeTone } from '../components/ui/badge';
import { Button, buttonStyles } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
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
import { evidenceAssetRows, formatByteSize, useInsightView } from './insights-model';
import type { EvidenceResponse, Severity } from './insights-model';

const SEVERITY_TONES: Record<Severity, BadgeTone> = {
  critical: 'critical',
  serious: 'serious',
  moderate: 'moderate',
  minor: 'minor',
};

export function EvidencePage(): JSX.Element {
  const { candidateId } = useParams<{ candidateId: string }>();
  const { strings, language } = useI18n();
  const path =
    candidateId === undefined ? null : `/api/prospects/${encodeURIComponent(candidateId)}/evidence`;
  const { data, error, refresh, isNotFound } = useInsightView<EvidenceResponse>(path);

  let body: JSX.Element;
  if (isNotFound) {
    body = <EmptyState title={strings.evidence.empty} />;
  } else if (error !== undefined && data === undefined) {
    body = (
      <EmptyState
        title={strings.common.error}
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
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      </Card>
    );
  } else {
    body = (
      <>
        <Card className="mb-4">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{strings.evidence.columns.asset}</TableHeaderCell>
                <TableHeaderCell>{strings.evidence.columns.status}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {evidenceAssetRows(data).map(({ slot, asset }) => (
                <TableRow key={slot}>
                  <TableCell className="text-ink">{strings.evidence.assetNames[slot]}</TableCell>
                  <TableCell>
                    {asset.state === 'captured' ? (
                      <div className="flex flex-col gap-1">
                        <Badge tone="accent">{asset.pageRole}</Badge>
                        <span className="text-xs text-ink-muted tabular-nums">
                          {asset.width}x{asset.height} · {formatByteSize(asset.byteSize)} ·{' '}
                          {asset.selectionReason}
                        </span>
                      </div>
                    ) : (
                      <Badge tone="neutral">{asset.reason}</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        {data.summaries.length > 0 ? (
          <Card>
            <ul className="flex flex-col gap-3">
              {data.summaries.map((summary, index) => (
                <li key={index} className="flex flex-wrap items-center gap-2">
                  <Badge tone={SEVERITY_TONES[summary.severity]}>
                    {strings.common.severityLabels[summary.severity]}
                  </Badge>
                  <span className="text-sm text-ink">
                    {language === 'fr' ? summary.observation.fr : summary.observation.en}
                  </span>
                  {summary.wcagCriteria.length > 0 ? (
                    <span className="text-xs text-ink-muted tabular-nums">
                      WCAG {summary.wcagCriteria.join(', ')}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </>
    );
  }

  return (
    <article>
      <PageHeader
        title={strings.evidence.title}
        description={strings.evidence.description}
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
