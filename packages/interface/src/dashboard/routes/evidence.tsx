import { useState } from 'react';
import type { JSX } from 'react';
import { Link, useParams } from 'react-router';
import { ImageOff } from 'lucide-react';
import { PAGE_WIDTH, PageHeader } from '../components/page-header';
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
import {
  candidateCityLabel,
  evidenceAssetRows,
  evidenceAssetSrc,
  formatByteSize,
  useInsightView,
} from './insights-model';
import type { EvidenceResponse, EvidenceSlotKey, Severity } from './insights-model';

const SEVERITY_TONES: Record<Severity, BadgeTone> = {
  critical: 'critical',
  serious: 'serious',
  moderate: 'moderate',
  minor: 'minor',
};

/** One evidence screenshot (issue #92). The bytes come from the asset
 *  endpoint; when they cannot be resolved from this machine, the explicit
 *  unavailable state takes the image's place instead of a broken image. */
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
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      </Card>
    );
  } else {
    body = (
      <>
        {candidateId !== undefined &&
        evidenceAssetRows(data).some(({ asset }) => asset.state === 'captured') ? (
          <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {evidenceAssetRows(data).map(({ slot, asset }) =>
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
                        <span className="numeric text-xs text-ink-muted">
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
                    <span className="numeric text-xs text-ink-muted">
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
    <article className={PAGE_WIDTH.reading}>
      <PageHeader
        eyebrow={strings.evidence.title}
        title={data?.name ?? strings.evidence.title}
        subject={data === undefined ? undefined : candidateCityLabel(data)}
        description={strings.evidence.description}
        meta={
          data === undefined ? null : <p className="ident text-xs text-ink-muted">{candidateId}</p>
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
