/** The record summary and its identity editor (issue #532). */

import type { JSX } from 'react';
import { ExternalLink } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { formatCommune, formatSector } from '../../lib/format';
import type { ProspectDetailShared } from './shared';
import type { IdentityEdit } from './use-identity-edit';
import type { ContactActions } from './use-contact-actions';
import { ContactsEditor } from './contacts-editor';

export function SummaryPanel(props: {
  shared: ProspectDetailShared;
  identity: IdentityEdit;
  contacts: ContactActions;
}): JSX.Element {
  const { prospect, copy, strings, saving, primaryWebsite, recommendation } = props.shared;
  const { editedFields, setEditedFields, fieldValue, sirenError, identityNotes, saveDetails } =
    props.identity;
  return (
    <Card title={copy.summary} description={copy.info}>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <SummaryField label={copy.name} value={prospect.name} />
        <SummaryField
          label={copy.sector}
          value={formatSector(prospect.sector, strings.common.sectorLabels)}
        />
        <SummaryField label={copy.email} value={prospect.emails[0]?.address ?? copy.notProvided} />
        <SummaryField
          label={copy.commune}
          value={
            [prospect.commune && formatCommune(prospect.commune), prospect.department]
              .filter(Boolean)
              .join(' · ') || copy.notProvided
          }
        />
        <SummaryField label={copy.siren} value={prospect.siren || copy.notProvided} />
        <SummaryField label={copy.tradingName} value={prospect.tradingName || copy.notProvided} />
        <SummaryField label={copy.legalName} value={prospect.legalName || copy.notProvided} />
        <div className="sm:col-span-2">
          <dt className="text-xs text-ink-muted">{copy.site}</dt>
          <dd className="mt-1">
            {primaryWebsite ? (
              <a
                className="inline-flex items-center gap-1 text-ink hover:underline"
                href={primaryWebsite.url}
                target="_blank"
                rel="noreferrer"
              >
                {primaryWebsite.url}
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            ) : (
              <span className="text-ink-muted">{copy.noSite}</span>
            )}
          </dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        {prospect.hotel?.stars ? <Badge tone="neutral">{prospect.hotel.stars}★</Badge> : null}
        {prospect.hotel?.rooms ? (
          <Badge tone="neutral">
            {copy.roomsSummary.replace('{count}', String(prospect.hotel.rooms))}
          </Badge>
        ) : null}
        {prospect.hotel?.groupStatus ? (
          <Badge tone="neutral">
            {strings.prospectHub.directory.groupLabels[prospect.hotel.groupStatus] ??
              strings.common.vocabularyFallback}
          </Badge>
        ) : null}
        {primaryWebsite ? (
          <Badge tone="neutral">
            {strings.prospectHub.directory.websiteKindLabels[primaryWebsite.kind] ??
              strings.common.vocabularyFallback}
          </Badge>
        ) : null}
      </div>
      <details
        id="edit-details"
        open={recommendation?.action === 'review-prospect'}
        className="mt-5 border-t border-line pt-4"
      >
        <summary className="cursor-pointer text-sm font-medium text-ink">{copy.editRecord}</summary>
        <div className="mt-4 grid gap-4 text-sm">
          <div className="grid gap-3 md:grid-cols-2">
            {(
              [
                ['name', copy.name],
                ['sector', copy.sector],
                ['address', copy.address],
                ['postcode', copy.postcode],
                ['commune', copy.commune],
                ['department', copy.department],
                ['phone', copy.phone],
                ['tradingName', copy.tradingName],
                ['legalName', copy.legalName],
              ] as const
            ).map(([key, title]) => (
              <label key={key} className="grid gap-1">
                <span className="text-xs text-ink-muted">{title}</span>
                <Input
                  value={fieldValue(key)}
                  onChange={(event) =>
                    setEditedFields((current) => ({ ...current, [key]: event.target.value }))
                  }
                />
              </label>
            ))}
            <label className="grid gap-1">
              <span className="text-xs text-ink-muted">{copy.siren}</span>
              <Input
                value={fieldValue('siren')}
                inputMode="numeric"
                placeholder="123 456 789"
                onChange={(event) =>
                  setEditedFields((current) => ({ ...current, siren: event.target.value }))
                }
              />
              {sirenError !== null ? (
                <p className="text-xs text-danger" role="alert">
                  {sirenError}
                </p>
              ) : null}
            </label>
            <label className="grid gap-1 md:col-span-2">
              <span className="text-xs text-ink-muted">{copy.notes}</span>
              <Input
                value={fieldValue('notes')}
                onChange={(event) =>
                  setEditedFields((current) => ({ ...current, notes: event.target.value }))
                }
              />
            </label>
          </div>
          {identityNotes.length > 0 ? (
            <p className="text-xs text-ink-muted">
              {identityNotes.map(({ field, note }) => `${copy[field]} — ${note}`).join(' · ')}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button
              variant="secondary"
              isLoading={saving}
              disabled={Object.keys(editedFields).length === 0 || sirenError !== null}
              onClick={() => void saveDetails()}
            >
              {copy.saveDetails}
            </Button>
          </div>
          <ContactsEditor shared={props.shared} contacts={props.contacts} />
          <p className="text-xs text-ink-muted">
            {copy.origin}:{' '}
            {copy.originLabels[prospect.fieldOrigins.name ?? ''] ??
              strings.common.vocabularyFallback}
          </p>
        </div>
      </details>
    </Card>
  );
}

function SummaryField({ label: title, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{title}</dt>
      <dd className="mt-1 text-ink">{value}</dd>
    </div>
  );
}
