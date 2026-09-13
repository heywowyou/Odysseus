import { useState } from 'react';
import type { JSX } from 'react';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
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
import { qualificationBadgeTone, reviewBadgeTone } from './prospects-model';
import type { ProspectDetailResponse } from './prospects-model';
import { HubContactEditor } from './hub-contact-editor';

type ReviewAction = 'accept' | 'reject';

/** href for a raw websites value: the value when it already carries an
 *  http(s) scheme, https-prefixed otherwise, so 'www.exemple.fr' opens as a
 *  site instead of resolving as a path relative to the dashboard. Any other
 *  scheme is undefined: the caller renders the raw string as plain text, so
 *  an unusual stored scheme never becomes an anchor href (React 19 already
 *  blocks javascript:, this keeps the rule in the code that builds the
 *  href). */
export function websiteHref(raw: string): string | undefined {
  if (/^https?:/i.test(raw)) return raw;
  if (/:/.test(raw)) return undefined;
  return `https://${raw}`;
}

/** A labelled catalogue row: label from the strings table, value from the
 *  payload, rendered only when the value exists. */
function DefinitionRow(props: { label: string; value: React.ReactNode }): JSX.Element {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line py-1.5 last:border-b-0">
      <span className="text-xs text-ink-muted">{props.label}</span>
      <span className="text-sm text-ink">{props.value}</span>
    </div>
  );
}

/** The hub's first section: catalogue, identity, sources, and
 *  qualification merged into one record (approved IA, section 1). The
 *  internal identifiers, version codes, source lists, and the
 *  qualification history sit behind a "Technical details" disclosure, so
 *  the operator reads the business first and the codes on demand. */
export function HubFicheSection(props: {
  detail: ProspectDetailResponse;
  onRequestReview: (action: ReviewAction) => void;
}): JSX.Element {
  const { detail, onRequestReview } = props;
  const { strings, language } = useI18n();
  const [showTechnical, setShowTechnical] = useState(false);
  const decided = detail.reviewState === 'accepted' || detail.reviewState === 'rejected';

  return (
    <Card title={strings.hub.steps.fiche}>
      <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
        <div>
          <DefinitionRow label={strings.prospectDetail.catalogue.name} value={detail.name} />
          {detail.commune !== null || detail.postcode !== null ? (
            <DefinitionRow
              label={strings.prospectDetail.catalogue.city}
              value={[detail.commune, detail.postcode].filter(Boolean).join(' ')}
            />
          ) : null}
          {detail.starRating !== null ? (
            <DefinitionRow label={strings.hub.fiche.starsLabel} value={detail.starRating} />
          ) : null}
          {detail.roomCount !== null ? (
            <DefinitionRow label={strings.hub.fiche.roomsLabel} value={detail.roomCount} />
          ) : null}
          {detail.capacity !== null ? (
            <DefinitionRow label={strings.hub.fiche.capacityLabel} value={detail.capacity} />
          ) : null}
          {detail.ownRegistrableDomain !== null ? (
            <DefinitionRow
              label={strings.prospectDetail.catalogue.ownDomain}
              value={
                <a
                  href={`https://${detail.ownRegistrableDomain}`}
                  target="_blank"
                  rel="noreferrer"
                  title={strings.prospectDetail.openSite}
                  aria-label={strings.prospectDetail.openSite}
                  className="hover:text-accent-bright"
                >
                  {detail.ownRegistrableDomain}
                </a>
              }
            />
          ) : null}
          {detail.groupDomain !== null ? (
            <DefinitionRow
              label={strings.prospectDetail.catalogue.groupId}
              value={detail.groupDomain}
            />
          ) : null}
        </div>
        <div>
          <DefinitionRow
            label={strings.prospectDetail.sections.identity}
            value={vocabularyLabel(
              strings.labels.identity,
              detail.identityStatus,
              strings.common.vocabularyFallback,
            )}
          />
          <DefinitionRow
            label={strings.prospects.columns.qualification}
            value={
              <span className="inline-flex items-center gap-2">
                <Badge tone={qualificationBadgeTone(detail.qualificationOutcome)}>
                  {vocabularyLabel(
                    strings.labels.qualification,
                    detail.qualificationOutcome,
                    strings.common.vocabularyFallback,
                  )}
                </Badge>
              </span>
            }
          />
          <DefinitionRow
            label={strings.prospects.columns.review}
            value={
              <span className="flex flex-wrap items-center gap-2">
                <Badge tone={reviewBadgeTone(detail.reviewState)}>
                  {vocabularyLabel(
                    strings.labels.review,
                    detail.reviewState,
                    strings.common.vocabularyFallback,
                  )}
                </Badge>
                {decided ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => onRequestReview('accept')}>
                      {strings.operator.accept}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onRequestReview('reject')}>
                      {strings.operator.reject}
                    </Button>
                  </>
                ) : null}
              </span>
            }
          />
          {detail.contact !== null ? (
            <>
              <DefinitionRow
                label={strings.prospectDetail.contact.decision}
                value={vocabularyLabel(
                  strings.labels.contact,
                  detail.contact.state,
                  strings.common.vocabularyFallback,
                )}
              />
              <DefinitionRow
                label={strings.prospectDetail.contact.reason}
                value={vocabularyLabel(
                  strings.labels.contactReason,
                  detail.contact.reason,
                  strings.common.vocabularyFallback,
                )}
              />
              <DefinitionRow
                label={strings.prospectDetail.contact.mailbox}
                value={vocabularyLabel(
                  strings.labels.mailDomain,
                  detail.contact.mxStatus,
                  strings.common.vocabularyFallback,
                )}
              />
              {detail.contact.sourceKind !== null ? (
                <DefinitionRow
                  label={strings.prospectDetail.contact.source}
                  value={vocabularyLabel(
                    strings.labels.contactSource,
                    detail.contact.sourceKind,
                    strings.common.vocabularyFallback,
                  )}
                />
              ) : null}
              <DefinitionRow
                label={strings.prospectDetail.contact.validatedAt}
                value={formatDateTime(detail.contact.validatedAt, language)}
              />
            </>
          ) : null}
        </div>
      </div>

      <HubContactEditor candidateId={detail.candidateId} />

      {detail.review.actor !== null || detail.review.reason !== null ? (
        <p className="mt-3 text-xs text-ink-muted">
          <span className="font-medium text-ink-soft">{strings.operator.provenanceLabel}</span>
          {' · '}
          {detail.review.actor ?? ''}
          {detail.review.reason !== null
            ? ` · ${
                // Issue #183: 'dashboard-review' is the backend's own internal
                // fallback constant (REVIEW_REASON_FALLBACK), not a
                // meaningful note - show a real sentence instead.
                detail.review.reason === 'dashboard-review'
                  ? strings.operator.provenanceReasonFallback
                  : detail.review.reason
              }`
            : ''}
          {detail.review.decidedAt !== null
            ? ` · ${formatDateTime(detail.review.decidedAt, language)}`
            : ''}
        </p>
      ) : null}

      <div className="mt-4 border-t border-line pt-3">
        <Button
          variant="secondary"
          size="sm"
          aria-expanded={showTechnical}
          onClick={() => {
            setShowTechnical((current) => !current);
          }}
        >
          {showTechnical
            ? strings.hub.fiche.hideTechnicalDetails
            : strings.hub.fiche.technicalDetails}
        </Button>
        {showTechnical ? (
          <div className="mt-4 flex flex-col gap-4">
            <div>
              <DefinitionRow
                label="candidateId"
                value={<span className="ident">{detail.candidateId}</span>}
              />
              <DefinitionRow
                label="identityKey"
                value={<span className="ident">{detail.identityKey}</span>}
              />
              <DefinitionRow
                label="resolutionVersion"
                value={<span className="ident">{detail.resolutionVersion}</span>}
              />
              {detail.siret !== null ? <DefinitionRow label="SIRET" value={detail.siret} /> : null}
              {detail.siren !== null ? <DefinitionRow label="SIREN" value={detail.siren} /> : null}
              {detail.matchedOn !== null ? (
                <DefinitionRow
                  label={strings.prospectDetail.sources.field}
                  value={`${detail.matchedOn.kind}: ${detail.matchedOn.value}`}
                />
              ) : null}
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {strings.prospectDetail.sourcesHeading}
              </h3>
              {detail.conflicts.length === 0 ? (
                <p className="text-sm text-ink-muted">{strings.prospectDetail.sources.none}</p>
              ) : (
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell className="w-48">
                        {strings.prospectDetail.sources.field}
                      </TableHeaderCell>
                      <TableHeaderCell>{strings.prospectDetail.sources.value}</TableHeaderCell>
                      <TableHeaderCell>{strings.prospectDetail.sources.source}</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {detail.conflicts.map((conflict) => (
                      <TableRow key={`${conflict.kind}:${conflict.detail}`}>
                        <TableCell className="text-xs text-ink-muted">{conflict.kind}</TableCell>
                        <TableCell className="text-ink">{conflict.detail}</TableCell>
                        <TableCell className="text-xs text-ink-soft">
                          {conflict.candidateIds.join(', ')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <ul className="mt-2 flex flex-col gap-1">
                {detail.sourceRefs.map((ref) => (
                  <li
                    key={`${ref.source}:${ref.sourceId}`}
                    className="font-mono text-xs text-ink-soft"
                  >
                    {ref.source}/{ref.sourceId} ({ref.sourceVersion}) · {ref.ingestRunId}
                  </li>
                ))}
                {detail.websites.map((website) => {
                  const href = websiteHref(website.raw);
                  return (
                    <li
                      key={website.raw}
                      className="font-mono text-xs text-ink-soft"
                      title={website.unusableReason ?? undefined}
                    >
                      {href === undefined ? (
                        website.raw
                      ) : (
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          title={strings.prospectDetail.openSite}
                          aria-label={strings.prospectDetail.openSite}
                          className="hover:text-accent-bright"
                        >
                          {website.raw}
                        </a>
                      )}{' '}
                      [{website.kind}
                      {website.registrableDomain !== null ? ` → ${website.registrableDomain}` : ''}]
                    </li>
                  );
                })}
              </ul>
            </div>
            {detail.qualification !== null ? (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  {strings.prospectDetail.sections.qualification}
                </h3>
                <p className="text-sm text-ink">
                  {vocabularyLabel(
                    strings.labels.qualification,
                    detail.qualification.outcome,
                    strings.common.vocabularyFallback,
                  )}
                  {' · '}
                  <span className="ident">{detail.qualification.qualificationVersion}</span> ·{' '}
                  {formatDateTime(detail.qualification.evaluatedAt, language)}
                </p>
                {detail.qualification.reasons.length > 0 ? (
                  <ul className="mt-1 flex flex-col gap-1">
                    {detail.qualification.reasons.map((reason) => (
                      <li key={reason} className="text-sm text-ink-soft">
                        {strings.prospectDetail.qualification.reason}: {reason}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            {detail.qualificationHistory.rows.length > 0 ? (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  {strings.prospectDetail.qualification.events}
                </h3>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell className="w-48">
                        {strings.prospectDetail.thread.lastEventAt}
                      </TableHeaderCell>
                      <TableHeaderCell>
                        {strings.prospectDetail.qualification.outcome}
                      </TableHeaderCell>
                      <TableHeaderCell>
                        {strings.prospectDetail.qualification.reason}
                      </TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {detail.qualificationHistory.rows.map((event) => (
                      <TableRow key={event.qualificationId}>
                        <TableCell className="text-xs text-ink-muted">
                          {formatDateTime(event.evaluatedAt, language)}
                        </TableCell>
                        <TableCell>
                          <Badge tone={qualificationBadgeTone(event.outcome)}>
                            {vocabularyLabel(
                              strings.labels.qualification,
                              event.outcome,
                              strings.common.vocabularyFallback,
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-ink-soft">
                          {event.reasons.join(', ')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
