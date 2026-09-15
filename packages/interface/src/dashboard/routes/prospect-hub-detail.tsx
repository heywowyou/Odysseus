import { useState } from 'react';
import type { JSX } from 'react';
import { ArrowLeft, ExternalLink, History, Star, Trash2, X } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { PageHeader, PAGE_WIDTH } from '../components/page-header';
import { Badge } from '../components/ui/badge';
import { Button, buttonStyles } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { ConfirmDialog } from '../components/ui/dialog';
import { EmptyState } from '../components/ui/empty-state';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { useI18n } from '../i18n/provider';
import { sendJson } from '../lib/api';
import { useApi } from '../lib/use-api';
import type { ProspectHubRow, ProspectStatus } from './prospect-hub-model';
import {
  contactRemovalConfirm,
  contactRemovalRequest,
  type ContactRemoval,
} from './prospect-contact-model';

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
  finishedAt?: string;
}

interface ProspectPreview {
  previewId: string;
  status: string;
  publishedAt: string;
  publicExpiresAt: string;
  revokedAt?: string;
  revokedReason?: string;
}

type ProspectOutreachAction = 'preview' | 'first-email' | 'follow-up';

interface ProspectActionability {
  actions: Record<string, { state: 'available' | 'blocked'; reason?: string }>;
}

type ProspectRecommendationAction =
  | 'review-audit'
  | 'review-draft'
  | 'record-outcome'
  | 'create-follow-up'
  | 'create-first-email'
  | 'prepare-audit'
  | 'review-prospect';

interface ProspectWorkSummary {
  items: { kind: string; action: string; href: string; since: string }[];
  recommendation?: {
    action: ProspectRecommendationAction;
    href: string;
    reason?: string;
  };
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

const STATUSES: readonly ProspectStatus[] = [
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

const TERMINAL_STATUSES: readonly ProspectStatus[] = ['won', 'lost', 'opted-out'];

function label(value: string, labels: Record<string, string>): string {
  return labels[value] ?? value;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

export function ProspectHubDetailPage(): JSX.Element {
  const { language, strings } = useI18n();
  const copy = strings.prospectHub.detail;
  const { prospectId } = useParams<{ prospectId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const requestedReturnTo = searchParams.get('returnTo');
  const returnTo = requestedReturnTo?.startsWith('/prospects') ? requestedReturnTo : '/prospects';
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
  const [pendingRemoval, setPendingRemoval] = useState<ContactRemoval | null>(null);

  if (response.error)
    return (
      <main className={`${PAGE_WIDTH.reading} px-5 py-8`}>
        <EmptyState
          title={copy.missing}
          description={response.error}
          action={
            <Link to={returnTo}>
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
  const recommendation = work?.recommendation;
  const auditState = work?.auditState ?? 'missing';
  const auditStateLabel = copy.auditStateLabels[auditState] ?? strings.common.vocabularyFallback;
  const recentEvents = prospect.events.slice(0, 3);
  const qualifyingAudit =
    (work?.qualifyingAuditId === undefined
      ? undefined
      : audits.find((audit) => audit.auditId === work.qualifyingAuditId)) ?? audits[0];

  const gateFor = (action: ProspectOutreachAction) => actionability.data?.actions[action];
  const gateReason = (action: ProspectOutreachAction): string => {
    const check = gateFor(action);
    if (check?.reason !== undefined) {
      return copy.refusalLabels[check.reason] ?? strings.common.vocabularyFallback;
    }
    return actionability.error ?? copy.loading;
  };

  const saveWebsite = async (): Promise<void> => {
    const value = website.trim();
    if (!value) return;
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      setOutreachNotice(copy.actionFailed);
      return;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      setOutreachNotice(copy.actionFailed);
      return;
    }
    const normalizedUrl = url.toString();
    if (prospect.websites.some((item) => item.url === normalizedUrl)) return;
    setSaving(true);
    try {
      await sendJson(`/api/prospects/${prospect.prospectId}`, 'PATCH', {
        websites: [
          ...prospect.websites,
          {
            url: normalizedUrl,
            registrableDomain: url.hostname,
            kind: 'unknown',
            primary: prospect.websites.length === 0,
          },
        ],
      });
      setWebsite('');
      response.refresh();
    } finally {
      setSaving(false);
    }
  };

  const contactsCopy = copy.contacts;

  const removeContact = async (removal: ContactRemoval): Promise<void> => {
    const request = contactRemovalRequest(prospect.prospectId, removal);
    try {
      await sendJson(request.path, 'DELETE', request.body);
      response.refresh();
    } catch {
      setOutreachNotice(copy.actionFailed);
    }
  };

  const choosePrimary = async (kind: 'websites' | 'emails', value: string): Promise<void> => {
    setSaving(true);
    try {
      await sendJson(
        `/api/prospects/${encodeURIComponent(prospect.prospectId)}/${kind}/primary`,
        'POST',
        kind === 'websites' ? { url: value } : { address: value },
      );
      response.refresh();
    } catch {
      setOutreachNotice(copy.actionFailed);
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
    type: 'quick-check' | 'prospecting-audit' | 'full-audit',
  ): Promise<void> => {
    if (!primaryWebsite) return;
    setOutreachBusy(`scan-${type}`);
    setOutreachNotice(null);
    try {
      const result = await sendJson<{ started?: boolean; jobId?: string; refusal?: string }>(
        '/api/scans',
        'POST',
        {
          type,
          url: primaryWebsite.url,
          options: { prospectId: prospect.prospectId },
        },
      );
      if (result.jobId) {
        navigate(`/scans/${result.jobId}`);
      } else {
        setOutreachNotice(
          result.refusal === undefined
            ? copy.actionFailed
            : copy.actionRefused.replace(
                '{reason}',
                copy.refusalLabels[result.refusal] ?? strings.common.vocabularyFallback,
              ),
        );
      }
    } catch {
      setOutreachNotice(copy.actionFailed);
    } finally {
      setOutreachBusy(null);
    }
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

  const recordOutcome = async (outcome: string): Promise<void> => {
    setOutreachBusy('outcome');
    setOutreachNotice(null);
    try {
      const result = await sendJson<{ withdrawn?: { drafts: number; previews: number } }>(
        `/api/prospects/${prospect.prospectId}/outcome`,
        'POST',
        { outcome },
      );
      setOutreachNotice(
        result.withdrawn !== undefined
          ? copy.optOutWithdrawn
              .replace('{drafts}', String(result.withdrawn.drafts))
              .replace('{previews}', String(result.withdrawn.previews))
          : copy.outcomeSaved.replace('{outcome}', label(outcome, copy.outcomeLabels)),
      );
    } catch {
      setOutreachNotice(copy.actionFailed);
    } finally {
      setOutreachBusy(null);
      response.refresh();
      actionability.refresh();
    }
  };

  const changeStatus = async (status: string): Promise<void> => {
    setOutreachBusy('status');
    setOutreachNotice(null);
    try {
      await sendJson(`/api/prospects/${prospect.prospectId}/status`, 'PATCH', { status });
      response.refresh();
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

  const renderRecommendationAction = (): JSX.Element | null => {
    if (recommendation === undefined) return null;
    const actionLabel =
      copy.recommendationActions[recommendation.action] ?? strings.common.vocabularyFallback;
    const recommendationGate =
      recommendation.action === 'create-first-email'
        ? gateFor('first-email')
        : recommendation.action === 'create-follow-up'
          ? gateFor('follow-up')
          : undefined;
    const disabled =
      outreachBusy !== null ||
      (recommendation.action === 'prepare-audit' && primaryWebsite === undefined) ||
      (recommendationGate !== undefined && recommendationGate.state !== 'available');
    if (
      recommendation.action === 'prepare-audit' ||
      recommendation.action === 'create-first-email' ||
      recommendation.action === 'create-follow-up'
    ) {
      const onClick =
        recommendation.action === 'prepare-audit'
          ? () => void launchScan('prospecting-audit')
          : recommendation.action === 'create-first-email'
            ? () => void runFirstEmail()
            : () => void runFollowUp();
      return (
        <Button
          onClick={onClick}
          disabled={disabled}
          isLoading={
            outreachBusy ===
            (recommendation.action === 'prepare-audit'
              ? 'scan-prospecting-audit'
              : recommendation.action)
          }
        >
          {actionLabel}
        </Button>
      );
    }
    return (
      <Link className={buttonStyles('primary')} to={recommendation.href}>
        {actionLabel}
      </Link>
    );
  };

  const recommendationReason =
    recommendation?.reason === undefined
      ? undefined
      : (copy.recommendationReasons[recommendation.reason] ?? strings.common.vocabularyFallback);
  const terminal = TERMINAL_STATUSES.includes(prospect.status);

  return (
    <main className={`${PAGE_WIDTH.reading} px-5 py-8`}>
      <PageHeader
        eyebrow={
          <Link className="inline-flex items-center gap-1 hover:underline" to={returnTo}>
            <ArrowLeft className="size-3" aria-hidden="true" />
            {copy.back}
          </Link>
        }
        title={prospect.name}
        subject={prospect.prospectId}
        actions={
          <Badge tone={terminal ? 'neutral' : 'accent'}>
            {label(prospect.status, copy.statusLabels)}
          </Badge>
        }
      />

      <div className="grid gap-5">
        <Card id="recommended" title={copy.recommended}>
          {recommendation !== undefined ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm font-medium text-ink">
                {copy.recommendationActions[recommendation.action] ??
                  strings.common.vocabularyFallback}
              </p>
              {recommendationReason ? (
                <p className="text-sm text-ink-muted">{recommendationReason}</p>
              ) : null}
              {recommendation.action === 'prepare-audit' && primaryWebsite === undefined ? (
                <p className="text-sm text-ink-muted">{copy.noSite}</p>
              ) : null}
              {recommendation.action === 'create-first-email' ? (
                <p className="text-sm text-ink-muted">{gateReason('first-email')}</p>
              ) : null}
              {recommendation.action === 'create-follow-up' ? (
                <p className="text-sm text-ink-muted">{gateReason('follow-up')}</p>
              ) : null}
              {renderRecommendationAction()}
            </div>
          ) : (
            <p className="text-sm text-ink-muted">
              {terminal ? copy.completed : copy.noRecommendation}
            </p>
          )}
        </Card>

        <Card title={copy.summary} description={copy.info}>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <SummaryField label={copy.name} value={prospect.name} />
            <SummaryField label={copy.sector} value={prospect.sector} />
            <SummaryField
              label={copy.email}
              value={prospect.emails[0]?.address ?? copy.notProvided}
            />
            <SummaryField
              label={copy.commune}
              value={
                [prospect.commune, prospect.department].filter(Boolean).join(' · ') ||
                copy.notProvided
              }
            />
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
            <summary className="cursor-pointer text-sm font-medium text-ink">
              {copy.editRecord}
            </summary>
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
                <p className="mb-2 text-xs text-ink-muted">{copy.websites}</p>
                <ul className="grid gap-2">
                  {prospect.websites.length > 0 ? (
                    prospect.websites.map((item) => (
                      <li key={item.url} className="flex flex-wrap items-center gap-2">
                        <a
                          className="text-ink hover:underline"
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {item.url}
                        </a>
                        {item.primary ? <Badge tone="accent">{copy.site}</Badge> : null}
                        <span className="text-xs text-ink-muted">
                          {strings.prospectHub.directory.websiteKindLabels[item.kind] ??
                            strings.common.vocabularyFallback}
                        </span>
                        <span className="ml-auto flex items-center gap-1">
                          {!item.primary ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={saving}
                              onClick={() => void choosePrimary('websites', item.url)}
                            >
                              <Star className="size-4" aria-hidden="true" />
                              {contactsCopy.setPrimaryWebsite}
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={contactsCopy.removeWebsite.replace('{url}', item.url)}
                            onClick={() =>
                              setPendingRemoval({
                                kind: 'website',
                                url: item.url,
                                primary: item.primary,
                              })
                            }
                          >
                            <X className="size-4" aria-hidden="true" />
                          </Button>
                        </span>
                      </li>
                    ))
                  ) : (
                    <li className="text-sm text-ink-muted">{copy.noSite}</li>
                  )}
                </ul>
                <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto]">
                  <Input
                    value={website}
                    onChange={(event) => setWebsite(event.target.value)}
                    placeholder={copy.addWebsitePlaceholder}
                    aria-label={copy.addWebsite}
                  />
                  <Button
                    isLoading={saving}
                    disabled={!website.trim()}
                    onClick={() => void saveWebsite()}
                  >
                    {copy.addWebsite}
                  </Button>
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs text-ink-muted">{copy.emailList}</p>
                <ul className="grid gap-2">
                  {prospect.emails.length > 0 ? (
                    prospect.emails.map((item, index) => (
                      <li key={item.address} className="flex flex-wrap items-center gap-2">
                        <span className="break-all text-ink">{item.address}</span>
                        <span className="text-xs text-ink-muted">
                          {copy.originLabels[item.origin] ?? strings.common.vocabularyFallback}
                        </span>
                        {index === 0 ? (
                          <Badge tone="accent">{contactsCopy.outreachRecipient}</Badge>
                        ) : null}
                        <span className="ml-auto flex flex-wrap items-center gap-1">
                          {index !== 0 ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={saving}
                              onClick={() => void choosePrimary('emails', item.address)}
                            >
                              {contactsCopy.useForOutreach}
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setPendingRemoval({
                                kind: 'email',
                                address: item.address,
                                blacklist: true,
                              })
                            }
                          >
                            {contactsCopy.removeAndBlacklistEmail}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={contactsCopy.removeEmail.replace('{address}', item.address)}
                            onClick={() =>
                              setPendingRemoval({
                                kind: 'email',
                                address: item.address,
                                blacklist: false,
                              })
                            }
                          >
                            <X className="size-4" aria-hidden="true" />
                          </Button>
                        </span>
                      </li>
                    ))
                  ) : (
                    <li className="text-sm text-ink-muted">{copy.notProvided}</li>
                  )}
                </ul>
                {pendingRemoval !== null ? (
                  <ConfirmDialog
                    open
                    onOpenChange={(open) => {
                      if (!open) setPendingRemoval(null);
                    }}
                    {...contactRemovalConfirm(pendingRemoval, contactsCopy)}
                    cancelLabel={strings.common.cancel}
                    onConfirm={() => removeContact(pendingRemoval)}
                  />
                ) : null}
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
          </details>
        </Card>

        <Card id="emails" title={copy.outreach}>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-sm font-medium">
                {copy.auditState.replace('{state}', auditStateLabel)}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-muted">{copy.site}</p>
              {qualifyingAudit ? (
                <Link
                  className="mt-1 block font-medium text-ink hover:underline"
                  to={`/audits/${encodeURIComponent(qualifyingAudit.auditId)}`}
                >
                  {copy.auditKindLabels[qualifyingAudit.kind] ?? strings.common.vocabularyFallback}
                </Link>
              ) : (
                <p className="mt-1 text-ink-muted">{copy.notProvided}</p>
              )}
            </div>
          </div>
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-xs text-ink-muted">{copy.threadState}</p>
            {prospect.thread ? (
              <p className="mt-1 text-sm">
                {strings.labels.thread[
                  prospect.thread.state as keyof typeof strings.labels.thread
                ] ?? strings.common.vocabularyFallback}
                <span className="ml-2 text-xs text-ink-muted">
                  {formatDate(prospect.thread.updatedAt)}
                </span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-ink-muted">{copy.noThread}</p>
            )}
            {drafts.length > 0 ? (
              <ul className="mt-3 grid gap-2">
                {drafts.slice(0, 3).map((draft) => (
                  <li
                    key={draft.draftId}
                    className="rounded-lg border border-line px-3 py-2 text-sm"
                  >
                    <p className="font-medium">
                      {copy.draftLabel.replace('{touch}', String(draft.touch))}
                    </p>
                    <p>{draft.subject}</p>
                    <p className="text-xs text-ink-muted">
                      {copy.draftCreated.replace('{date}', formatDate(draft.createdAt))}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink-muted">{copy.noDraft}</p>
            )}
          </div>
          {outreachNotice ? (
            <p className="mt-3 text-sm text-ink-muted" role="status">
              {outreachNotice}
            </p>
          ) : null}
        </Card>

        <Card id="actions">
          <details
            open={
              recommendation?.action === 'review-prospect' ||
              recommendation?.action === 'record-outcome'
            }
          >
            <summary className="cursor-pointer text-sm font-semibold text-ink">
              {copy.allActions}
            </summary>
            <div className="mt-4 grid gap-5">
              <div>
                <p className="text-sm font-medium text-ink">{copy.actions}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={!primaryWebsite || outreachBusy !== null}
                    isLoading={outreachBusy === 'scan-quick-check'}
                    onClick={() => void launchScan('quick-check')}
                  >
                    {copy.quick}
                  </Button>
                  <Button
                    size="sm"
                    disabled={!primaryWebsite || outreachBusy !== null}
                    isLoading={outreachBusy === 'scan-prospecting-audit'}
                    onClick={() => void launchScan('prospecting-audit')}
                  >
                    {copy.prospecting}
                  </Button>
                  <Button
                    size="sm"
                    disabled={!primaryWebsite || outreachBusy !== null}
                    isLoading={outreachBusy === 'scan-full-audit'}
                    onClick={() => void launchScan('full-audit')}
                  >
                    {copy.fullAudit}
                  </Button>
                </div>
              </div>
              <div className="border-t border-line pt-4">
                <p className="text-sm font-medium text-ink">{copy.outreach}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {(
                    [
                      ['preview', copy.preview],
                      ['first-email', copy.firstEmail],
                      ['follow-up', copy.followUp],
                    ] as const
                  ).map(([key, title]) => {
                    const action = gateFor(key);
                    const available = action?.state === 'available';
                    return (
                      <div key={key} className="rounded-lg border border-line px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span>{title}</span>
                          <Badge tone={available ? 'accent' : 'neutral'}>
                            {available ? copy.ready : copy.blocked}
                          </Badge>
                        </div>
                        {!available ? (
                          <p className="mt-1 text-xs text-ink-muted">{gateReason(key)}</p>
                        ) : null}
                        <Button
                          className="mt-2"
                          size="sm"
                          variant="secondary"
                          disabled={!available || outreachBusy !== null}
                          isLoading={outreachBusy === key}
                          onClick={() =>
                            void (key === 'preview'
                              ? publishPreview()
                              : key === 'first-email'
                                ? runFirstEmail()
                                : runFollowUp())
                          }
                        >
                          {key === 'preview' ? copy.publishPreview : title}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div
                id="outcome"
                className="flex flex-wrap items-center gap-2 border-t border-line pt-4"
              >
                <Select
                  value=""
                  disabled={outreachBusy !== null}
                  onChange={(event) => {
                    if (event.target.value) void recordOutcome(event.target.value);
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
                <Button variant="danger" onClick={() => void deleteRecord()}>
                  <Trash2 className="size-4" aria-hidden="true" />
                  {copy.delete}
                </Button>
              </div>
              <details className="border-t border-line pt-4">
                <summary className="cursor-pointer text-sm font-medium text-ink">
                  {copy.statusCorrection}
                </summary>
                <p className="mt-2 text-xs text-ink-muted">{copy.statusCorrectionHint}</p>
                <div className="mt-2 max-w-xs">
                  <Select
                    value={prospect.status}
                    disabled={outreachBusy !== null}
                    onChange={(event) => void changeStatus(event.target.value)}
                    aria-label={copy.statusAria}
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {label(status, copy.statusLabels)}
                      </option>
                    ))}
                  </Select>
                </div>
              </details>
            </div>
          </details>
        </Card>

        <Card id="recent-activity" title={copy.recentActivity}>
          {recentEvents.length > 0 ? (
            <ol className="space-y-3">
              {recentEvents.map((event) => (
                <li key={event.eventId} className="border-l-2 border-line pl-3 text-sm">
                  <p className="font-medium">
                    {copy.eventLabels[event.type] ?? strings.common.vocabularyFallback}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {formatDate(event.at)} · {event.actor}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-ink-muted">{copy.noEvents}</p>
          )}
        </Card>

        <Card
          id="history"
          title={copy.history}
          actions={<History className="size-4 text-ink-muted" aria-hidden="true" />}
        >
          <details>
            <summary className="cursor-pointer text-sm font-medium text-ink">
              {copy.fullHistory}
            </summary>
            <div className="mt-4 grid gap-4">
              <div>
                <p className="mb-2 text-xs text-ink-muted">{copy.websites}</p>
                {audits.length > 0 ? (
                  <div className="grid gap-2">
                    {audits.map((audit) => (
                      <div
                        key={audit.auditId}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm"
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
                            {formatDate(audit.startedAt)}
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
                ) : (
                  <p className="text-sm text-ink-muted">{copy.notProvided}</p>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs text-ink-muted">{copy.preview}</p>
                {previews.length > 0 ? (
                  <div className="grid gap-2">
                    {previews.map((preview) => (
                      <div
                        key={preview.previewId}
                        className="rounded-lg border border-line px-3 py-2 text-sm"
                      >
                        <span className="font-medium">
                          {copy.previewStatusLabels[preview.status] ??
                            strings.common.vocabularyFallback}
                        </span>
                        <span className="ml-2 text-xs text-ink-muted">
                          {formatDate(preview.publishedAt)}
                        </span>
                        <span className="ml-2 text-xs text-ink-muted">{preview.previewId}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-ink-muted">{copy.notProvided}</p>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs text-ink-muted">{copy.recentActivity}</p>
                {prospect.events.length > 0 ? (
                  <ol className="space-y-3">
                    {prospect.events.map((event) => (
                      <li key={event.eventId} className="border-l-2 border-line pl-3 text-sm">
                        <p className="font-medium">
                          {copy.eventLabels[event.type] ?? strings.common.vocabularyFallback}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {formatDate(event.at)} · {event.actor}
                        </p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-ink-muted">{copy.noEvents}</p>
                )}
              </div>
            </div>
          </details>
        </Card>
      </div>
    </main>
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
