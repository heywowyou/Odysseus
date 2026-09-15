import { useState } from 'react';
import type { JSX } from 'react';
import { ArrowLeft, ExternalLink, History, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { PageHeader, PAGE_WIDTH } from '../components/page-header';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { useI18n } from '../i18n/provider';
import { sendJson } from '../lib/api';
import { useApi } from '../lib/use-api';
import type { ProspectHubRow, ProspectStatus } from './prospect-hub-model';

interface ProspectEvent {
  eventId: string;
  type: string;
  actor: string;
  at: string;
  payload: Record<string, unknown>;
}

interface ProspectAudit {
  auditId: string;
  siteUrl: string;
  kind: string;
  startedAt: string;
  finishedAt: string;
}

interface ProspectPreview {
  previewId: string;
  status: string;
  publishedAt: string;
  publicExpiresAt: string;
  revokedAt?: string;
  revokedReason?: string;
}

interface ProspectActionability {
  actions: Record<string, { state: 'available' | 'blocked'; reason?: string }>;
}

interface ProspectWorkSummary {
  items: { kind: string; action: string; href: string; since: string }[];
  recommendation?: { action: string; href: string; reason?: string };
  auditState: string;
  qualifyingAuditId?: string;
  websiteSuppressed: boolean;
  emailSuppressed: boolean;
}

interface ProspectThread {
  threadId: string;
  state: string;
  currentTouch: number;
  updatedAt: string;
  needsReview?: { reason: string; detectedAt: string };
}

interface ProspectDraft {
  draftId: string;
  touch: number;
  status: string;
  subject: string;
  previewUrl?: string;
  createdAt: string;
}

interface ProspectHubDetail extends ProspectHubRow {
  address?: string;
  postcode?: string;
  phone?: string;
  siren?: string;
  siret?: string;
  notes?: string;
  fieldOrigins: Record<string, string>;
  audits?: ProspectAudit[];
  previews?: ProspectPreview[];
  events: ProspectEvent[];
  work?: ProspectWorkSummary;
  thread?: ProspectThread | null;
  drafts?: ProspectDraft[];
}

const STATUSES: ProspectStatus[] = [
  'new',
  'audited',
  'contacted',
  'follow-up',
  'replied',
  'call',
  'quoted',
  'won',
  'lost',
  'opted-out',
];
const OUTCOMES = [
  'no-reply',
  'reply-positive',
  'reply-not-now',
  'reply-negative',
  'opt-out',
  'call',
  'quoted',
  'won',
  'lost',
] as const;

function label(value: string, labels: Record<string, string>): string {
  return labels[value] ?? value;
}

export function ProspectHubDetailPage(): JSX.Element {
  const { language, strings } = useI18n();
  const copy = strings.prospectHub.detail;
  const { prospectId } = useParams<{ prospectId: string }>();
  const navigate = useNavigate();
  const response = useApi<ProspectHubDetail>(
    prospectId ? `/api/prospects/${encodeURIComponent(prospectId)}` : null,
  );
  const actionability = useApi<ProspectActionability>(
    prospectId ? `/api/prospects/${encodeURIComponent(prospectId)}/actionability` : null,
  );
  const prospect = response.data;
  const [website, setWebsite] = useState('');
  const [email, setEmail] = useState('');
  const [editedFields, setEditedFields] = useState<
    Partial<
      Record<
        'name' | 'sector' | 'address' | 'postcode' | 'commune' | 'department' | 'phone' | 'notes',
        string
      >
    >
  >({});
  const [saving, setSaving] = useState(false);
  const [outreachBusy, setOutreachBusy] = useState<string | null>(null);
  const [outreachNotice, setOutreachNotice] = useState<string | null>(null);

  if (response.error)
    return (
      <main className={`${PAGE_WIDTH.reading} px-5 py-8`}>
        <EmptyState
          title={copy.missing}
          description={response.error}
          action={
            <Link to="/prospects">
              <Button>{copy.return}</Button>
            </Link>
          }
        />
      </main>
    );
  if (!prospect)
    return (
      <main className={`${PAGE_WIDTH.reading} px-5 py-8`}>
        <p className="text-sm text-ink-muted">{copy.loading}</p>
      </main>
    );

  const primaryWebsite = prospect.websites.find((item) => item.primary) ?? prospect.websites[0];
  const audits = prospect.audits ?? [];
  const previews = prospect.previews ?? [];
  const drafts = prospect.drafts ?? [];
  const work = prospect.work;
  const saveWebsite = async (): Promise<void> => {
    if (!website.trim()) return;
    setSaving(true);
    try {
      const url = new URL(website.trim());
      await sendJson(`/api/prospects/${prospect.prospectId}`, 'PATCH', {
        websites: [
          { url: url.toString(), registrableDomain: url.hostname, kind: 'unknown', primary: true },
        ],
      });
      setWebsite('');
      response.refresh();
    } finally {
      setSaving(false);
    }
  };
  const saveEmail = async (): Promise<void> => {
    const address = email.trim().toLowerCase();
    if (!address || prospect.emails.some((item) => item.address === address)) return;
    setSaving(true);
    try {
      await sendJson(`/api/prospects/${prospect.prospectId}`, 'PATCH', {
        emails: [...prospect.emails, { address, origin: 'operator' }],
      });
      setEmail('');
      response.refresh();
    } finally {
      setSaving(false);
    }
  };
  const fieldValue = (key: keyof typeof editedFields): string =>
    editedFields[key] ?? String(prospect[key] ?? '');
  const saveDetails = async (): Promise<void> => {
    const patch = Object.fromEntries(
      Object.entries(editedFields).map(([key, value]) => [key, value?.trim() || undefined]),
    );
    if (Object.keys(patch).length === 0) return;
    setSaving(true);
    try {
      await sendJson(`/api/prospects/${prospect.prospectId}`, 'PATCH', patch);
      setEditedFields({});
      response.refresh();
    } finally {
      setSaving(false);
    }
  };
  const launchScan = async (
    type: 'quick-check' | 'light-audit' | 'prospecting-audit',
  ): Promise<void> => {
    if (!primaryWebsite) return;
    const result = await sendJson<{ started: boolean; jobId?: string }>('/api/scans', 'POST', {
      type,
      url: primaryWebsite.url,
      options: { prospectId: prospect.prospectId },
    });
    if (result.jobId) navigate(`/scans/${result.jobId}`);
  };
  const deleteRecord = async (): Promise<void> => {
    if (!window.confirm(copy.confirm)) return;
    await sendJson(`/api/prospects/${prospect.prospectId}`, 'DELETE', {});
    navigate('/prospects');
  };
  const publishPreview = async (): Promise<void> => {
    setOutreachBusy('preview');
    setOutreachNotice(null);
    try {
      const result = await sendJson<{ published: boolean; refusal?: string }>(
        `/api/prospects/${prospect.prospectId}/preview/publish`,
        'POST',
        {},
      );
      setOutreachNotice(
        result.published
          ? copy.publishPreview
          : copy.actionRefused.replace(
              '{reason}',
              copy.refusalLabels[result.refusal ?? ''] ?? strings.common.vocabularyFallback,
            ),
      );
      response.refresh();
      actionability.refresh();
    } catch {
      setOutreachNotice(copy.actionFailed);
    } finally {
      setOutreachBusy(null);
    }
  };
  const runFirstEmail = async (): Promise<void> => {
    setOutreachBusy('first-email');
    setOutreachNotice(null);
    try {
      const result = await sendJson<{ created: boolean; refusal?: string }>(
        `/api/prospects/${prospect.prospectId}/outreach/first-email`,
        'POST',
        { language },
      );
      setOutreachNotice(
        result.created
          ? copy.firstEmailCreated
          : copy.actionRefused.replace(
              '{reason}',
              copy.refusalLabels[result.refusal ?? ''] ?? strings.common.vocabularyFallback,
            ),
      );
      response.refresh();
      actionability.refresh();
    } catch {
      setOutreachNotice(copy.actionFailed);
    } finally {
      setOutreachBusy(null);
    }
  };
  const runFollowUp = async (): Promise<void> => {
    setOutreachBusy('follow-up');
    setOutreachNotice(null);
    try {
      const result = await sendJson<{ created: boolean; refusal?: string }>(
        `/api/prospects/${prospect.prospectId}/outreach/follow-up`,
        'POST',
        {},
      );
      setOutreachNotice(
        result.created
          ? copy.followUpCreated
          : copy.actionRefused.replace(
              '{reason}',
              copy.refusalLabels[result.refusal ?? ''] ?? strings.common.vocabularyFallback,
            ),
      );
      response.refresh();
      actionability.refresh();
    } catch {
      setOutreachNotice(copy.actionFailed);
    } finally {
      setOutreachBusy(null);
    }
  };
  const detachAudit = async (auditId: string): Promise<void> => {
    if (!window.confirm(copy.confirmDetachAudit)) return;
    setOutreachBusy(`detach-${auditId}`);
    setOutreachNotice(null);
    try {
      await sendJson(`/api/audits/${encodeURIComponent(auditId)}/prospect`, 'POST', {
        prospectId: null,
      });
      setOutreachNotice(copy.auditDetached);
      response.refresh();
      actionability.refresh();
    } catch {
      setOutreachNotice(copy.actionFailed);
    } finally {
      setOutreachBusy(null);
    }
  };

  return (
    <main className={`${PAGE_WIDTH.reading} px-5 py-8`}>
      <PageHeader
        eyebrow={
          <Link className="inline-flex items-center gap-1 hover:underline" to="/prospects">
            <ArrowLeft className="size-3" aria-hidden="true" />
            {copy.back}
          </Link>
        }
        title={prospect.name}
        subject={prospect.prospectId}
        actions={
          <Select
            value={prospect.status}
            onChange={(event) =>
              void sendJson(`/api/prospects/${prospect.prospectId}/status`, 'PATCH', {
                status: event.target.value,
              }).then(() => response.refresh())
            }
            aria-label={copy.statusAria}
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {label(status, copy.statusLabels)}
              </option>
            ))}
          </Select>
        }
      />
      <div className="grid gap-5">
        <Card title={copy.record} description={copy.info}>
          <div className="grid gap-4 text-sm">
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
            <div className="flex justify-end">
              <Button
                variant="secondary"
                isLoading={saving}
                disabled={Object.keys(editedFields).length === 0}
                onClick={() => void saveDetails()}
              >
                {copy.saveDetails}
              </Button>
            </div>
            <div>
              <p className="text-xs text-ink-muted">{copy.site}</p>
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
              <span className="ml-2 text-xs text-ink-muted">
                (
                {copy.originLabels[
                  prospect.fieldOrigins.websites ?? prospect.fieldOrigins.name ?? ''
                ] ?? strings.common.vocabularyFallback}
                )
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {prospect.hotel?.stars ? <Badge tone="neutral">{prospect.hotel.stars}★</Badge> : null}
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
            <div className="grid gap-2 md:grid-cols-[1fr_auto]">
              <Input
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                placeholder={strings.prospectHub.list.websitePlaceholder}
                aria-label={copy.site}
              />
              <Button
                isLoading={saving}
                disabled={!website.trim()}
                onClick={() => void saveWebsite()}
              >
                {copy.saveSite}
              </Button>
            </div>
            <div>
              <p className="mb-2 text-xs text-ink-muted">{copy.email}</p>
              <div className="flex flex-wrap gap-2">
                {prospect.emails.map((item) => (
                  <Badge key={item.address} tone="neutral">
                    {item.address} ·{' '}
                    {copy.originLabels[item.origin] ?? strings.common.vocabularyFallback}
                  </Badge>
                ))}
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto]">
                <Input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="contact@exemple.fr"
                  aria-label={copy.email}
                />
                <Button
                  isLoading={saving}
                  disabled={!email.trim()}
                  onClick={() => void saveEmail()}
                >
                  {copy.addEmail}
                </Button>
              </div>
            </div>
            <p className="text-xs text-ink-muted">
              {copy.origin}:{' '}
              {copy.originLabels[prospect.fieldOrigins.name ?? ''] ??
                strings.common.vocabularyFallback}
            </p>
          </div>
        </Card>
        <Card id="emails" title={copy.actions}>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!primaryWebsite} onClick={() => void launchScan('quick-check')}>
              {copy.quick}
            </Button>
            <Button disabled={!primaryWebsite} onClick={() => void launchScan('light-audit')}>
              {copy.light}
            </Button>
            <Button disabled={!primaryWebsite} onClick={() => void launchScan('prospecting-audit')}>
              {copy.prospecting}
            </Button>
            <Button
              variant="secondary"
              disabled={
                actionability.data?.actions.preview?.state !== 'available' || outreachBusy !== null
              }
              onClick={() => void publishPreview()}
            >
              {copy.publishPreview}
            </Button>
          </div>
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-sm font-medium text-ink">{copy.outreach}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {(
                [
                  ['preview', copy.preview],
                  ['first-email', copy.firstEmail],
                  ['follow-up', copy.followUp],
                ] as const
              ).map(([key, title]) => {
                const action = actionability.data?.actions[key];
                const available = action?.state === 'available';
                return (
                  <div key={key} className="rounded-lg border border-line px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span>{title}</span>
                      <Badge tone={available ? 'accent' : 'neutral'}>
                        {available ? copy.ready : copy.blocked}
                      </Badge>
                    </div>
                    {!available && action?.reason ? (
                      <p className="mt-1 text-xs text-ink-muted">
                        {copy.refusalLabels[action.reason] ?? strings.common.vocabularyFallback}
                      </p>
                    ) : null}
                    {key === 'first-email' ? (
                      <Button
                        className="mt-2"
                        size="sm"
                        variant="secondary"
                        disabled={!available || outreachBusy !== null}
                        isLoading={outreachBusy === 'first-email'}
                        onClick={() => void runFirstEmail()}
                      >
                        {title}
                      </Button>
                    ) : null}
                    {key === 'follow-up' ? (
                      <Button
                        className="mt-2"
                        size="sm"
                        variant="secondary"
                        disabled={!available || outreachBusy !== null}
                        isLoading={outreachBusy === 'follow-up'}
                        onClick={() => void runFollowUp()}
                      >
                        {title}
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-4 grid gap-2 border-t border-line pt-4 text-sm">
            <p className="font-medium text-ink">{copy.emailSection}</p>
            <p className="text-xs text-ink-muted">
              {copy.auditState.replace(
                '{state}',
                copy.auditStateLabels[work?.auditState ?? 'missing'] ??
                  strings.common.vocabularyFallback,
              )}
            </p>
            {prospect.thread ? (
              <p className="text-xs text-ink-muted">
                {copy.threadState}:{' '}
                {strings.labels.thread[
                  prospect.thread.state as keyof typeof strings.labels.thread
                ] ?? strings.common.vocabularyFallback}
              </p>
            ) : (
              <p className="text-xs text-ink-muted">{copy.noThread}</p>
            )}
            {drafts.length > 0 ? (
              <ul className="grid gap-2">
                {drafts.map((draft) => (
                  <li key={draft.draftId} className="rounded-lg border border-line px-3 py-2">
                    <p className="font-medium">
                      {copy.draftLabel.replace('{touch}', String(draft.touch))}
                    </p>
                    <p>{draft.subject}</p>
                    <p className="text-xs text-ink-muted">
                      {copy.draftCreated.replace(
                        '{date}',
                        new Date(draft.createdAt).toLocaleString(),
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-ink-muted">{copy.noDraft}</p>
            )}
            {outreachNotice ? (
              <p className="text-xs text-ink-muted" role="status">
                {outreachNotice}
              </p>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Select
              defaultValue=""
              onChange={(event) => {
                if (event.target.value)
                  void sendJson(`/api/prospects/${prospect.prospectId}/outcome`, 'POST', {
                    outcome: event.target.value,
                  }).then(() => response.refresh());
              }}
              aria-label={copy.outcome}
            >
              <option value="">{copy.outcome}</option>
              {OUTCOMES.map((outcome) => (
                <option key={outcome} value={outcome}>
                  {label(outcome, copy.outcomeLabels)}
                </option>
              ))}
            </Select>
            <Button variant="secondary" onClick={() => void deleteRecord()}>
              <Trash2 className="size-4" aria-hidden="true" />
              {copy.delete}
            </Button>
          </div>
        </Card>
        <Card
          id="history"
          title={copy.history}
          actions={<History className="size-4 text-ink-muted" aria-hidden="true" />}
        >
          {audits.length > 0 ? (
            <div className="mb-4 space-y-2 border-b border-line pb-4">
              {audits.map((audit) => (
                <div
                  key={audit.auditId}
                  className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm hover:border-accent/50"
                >
                  <Link
                    className="min-w-0 hover:underline"
                    to={`/audits/${encodeURIComponent(audit.auditId)}`}
                  >
                    <span className="font-medium">
                      {copy.auditKindLabels[audit.kind] ?? strings.common.vocabularyFallback}
                    </span>
                    <span className="ml-2 text-ink-muted">{audit.siteUrl}</span>
                  </Link>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-ink-muted">
                      {new Date(audit.startedAt).toLocaleString()}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={outreachBusy !== null}
                      isLoading={outreachBusy === `detach-${audit.auditId}`}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void detachAudit(audit.auditId);
                      }}
                    >
                      {copy.detachAudit}
                    </Button>
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          {previews.length > 0 ? (
            <div className="mb-4 space-y-2 border-b border-line pb-4">
              {previews.map((preview) => (
                <div
                  key={preview.previewId}
                  className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">
                      {copy.previewStatusLabels[preview.status] ??
                        strings.common.vocabularyFallback}
                    </span>
                    <span className="ml-2 text-ink-muted">
                      {new Date(preview.publishedAt).toLocaleString()}
                    </span>
                  </span>
                  <span className="text-xs text-ink-muted">{preview.previewId}</span>
                </div>
              ))}
            </div>
          ) : null}
          {prospect.events.length > 0 ? (
            <ol className="space-y-3">
              {prospect.events.map((event) => (
                <li key={event.eventId} className="border-l-2 border-line pl-3 text-sm">
                  <p className="font-medium">
                    {copy.eventLabels[event.type] ?? strings.common.vocabularyFallback}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {new Date(event.at).toLocaleString()} · {event.actor}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-ink-muted">{copy.noEvents}</p>
          )}
        </Card>
      </div>
    </main>
  );
}
