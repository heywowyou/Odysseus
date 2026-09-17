import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ExternalLink,
  History,
  Pencil,
  Star,
  Trash2,
  X,
} from 'lucide-react';
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
import { fetchJson, sendJson } from '../lib/api';
import { useApi } from '../lib/use-api';
import {
  archiveImpactSummary,
  deletionImpactSummary,
  type ProspectDeletionImpact,
  type ProspectHubRow,
  type ProspectStatus,
} from './prospect-hub-model';
import {
  contactRemovalConfirm,
  contactRemovalRequest,
  stakeholderFromInput,
  stakeholdersAfterChange,
  type ContactRemoval,
  type ProspectStakeholder,
} from './prospect-contact-model';
import {
  identityOriginNotes,
  sirenDraftError,
  type ProspectIdentityValues,
} from './prospect-identity-model';
import {
  archiveConfirmDescription,
  archiveFailureNotice,
  deleteFailureNotice,
  detailsPatch,
  emailAddition,
  firstEmailBody,
  outcomeFailureNotice,
  outcomeNotice,
  outreachResultNotice,
  scanRefusalNotice,
  websiteAddition,
} from './prospect-hub-detail-model';
import { formatCommune, formatDateTime, formatSector } from '../lib/format';

interface ProspectEvent {
  eventId: string;
  type: string;
  actor: string;
  at: string;
  payload: Record<string, unknown>;
}

/** A creation from the directory reads as its origin, not as a plain
 *  creation (issue #398). */
function eventLabelKey(event: ProspectEvent): string {
  return event.type === 'prospect-created' && event.payload['origin'] === 'directory'
    ? 'prospect-created-directory'
    : event.type;
}

interface ProspectAudit {
  auditId: string;
  siteUrl: string;
  kind: string;
  scanIntent?: string;
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
  url?: string;
}

type ProspectOutreachAction = 'preview' | 'first-email' | 'follow-up';

interface ProspectActionability {
  actions: Record<string, { state: 'available' | 'blocked'; reason?: string }>;
}

type ProspectRecommendationAction =
  | 'review-audit'
  | 'regenerate-report'
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
  /** Advisory provenance of the qualifying audit; never a blocker. */
  dataVersionState?: 'current' | 'older' | 'unknown';
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
  body?: string;
  recipient?: string;
  mailboxUrl?: string;
  language?: 'fr' | 'en';
  previewUrl?: string;
  createdAt: string;
}

interface ProspectHubDetail extends ProspectHubRow {
  address?: string;
  postcode?: string;
  phone?: string;
  siren?: string;
  siret?: string;
  /** Issue #289: prospect-level identity, editable before any scan. */
  tradingName?: string;
  legalName?: string;
  notes?: string;
  outreachLanguage?: 'fr' | 'en';
  stakeholders?: ProspectStakeholder[];
  fieldOrigins: Record<string, string>;
  audits?: ProspectAudit[];
  previews?: ProspectPreview[];
  /** A role address a scan read on the site, with the page it came from. */
  contactSuggestion?: { address: string; sourceUrl: string } | null;
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

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days since a scan started. Informational only: no age makes a
 *  scan unusable, the operator decides when the site may have changed. */
function daysSince(value: string, now = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(value).getTime()) / DAY_MS));
}

function permanentDeleteDescription(
  impact: readonly string[],
  copy: {
    deletePermanentlyIntro: string;
    deletePermanentlyWith: string;
    deletePermanentlyKeeps: string;
  },
): string {
  const scope =
    impact.length === 0
      ? copy.deletePermanentlyIntro
      : `${copy.deletePermanentlyIntro} ${copy.deletePermanentlyWith} ${impact.join(', ')}`;
  return `${scope}. ${copy.deletePermanentlyKeeps}`;
}

export function ProspectHubDetailPage(): JSX.Element {
  const { strings, language } = useI18n();
  const copy = strings.prospectHub.detail;
  const formatDate = (value: string): string => formatDateTime(value, language);
  const actorLabel = (actor: string): string =>
    copy.actorLabels[actor] ?? strings.common.vocabularyFallback;
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
        | 'name'
        | 'sector'
        | 'address'
        | 'postcode'
        | 'commune'
        | 'department'
        | 'phone'
        | 'siren'
        | 'tradingName'
        | 'legalName'
        | 'notes',
        string
      >
    >
  >({});
  const [saving, setSaving] = useState(false);
  const [outreachBusy, setOutreachBusy] = useState<string | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [deletionImpact, setDeletionImpact] = useState<ProspectDeletionImpact | null>(null);
  const [archiveImpact, setArchiveImpact] = useState<ProspectDeletionImpact | null>(null);
  const [lifecycleNotice, setLifecycleNotice] = useState<string | null>(null);
  const [outreachNotice, setOutreachNotice] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<ContactRemoval | null>(null);
  const [newStakeholder, setNewStakeholder] = useState({ name: '', position: '' });
  const [stakeholderEdit, setStakeholderEdit] = useState<{
    index: number;
    name: string;
    position: string;
  } | null>(null);
  const [pendingStakeholderRemoval, setPendingStakeholderRemoval] = useState<number | null>(null);

  // Issue #277: deep links like #emails arrive before the record renders.
  const loaded = response.data !== undefined;
  useEffect(() => {
    if (!loaded || window.location.hash === '') return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
  }, [loaded]);

  if (response.error)
    return (
      <div className={`${PAGE_WIDTH.reading} px-5 py-8`}>
        <EmptyState
          title={copy.missing}
          description={copy.missingDescription}
          action={
            <Link to={returnTo} className={buttonStyles()}>
              {copy.return}
            </Link>
          }
        />
      </div>
    );
  if (!prospect)
    return (
      <div className={`${PAGE_WIDTH.reading} px-5 py-8`}>
        <p className="text-sm text-ink-muted">{copy.loading}</p>
      </div>
    );

  const primaryWebsite = prospect.websites.find((item) => item.primary) ?? prospect.websites[0];
  const audits = prospect.audits ?? [];
  const previews = prospect.previews ?? [];
  // Issue #288: the live preview's link stays on the record, so it is shown,
  // copied, and revoked next to the publish action for as long as it is live.
  const livePreview = previews.find((preview) => preview.status === 'live');
  const livePreviewUrl = livePreview?.url ?? null;
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

  // Issue #279: every mutation can change what outreach is allowed, so the
  // record and its gates always refresh together.
  const refreshAll = (): void => {
    response.refresh();
    actionability.refresh();
  };

  const gateFor = (action: ProspectOutreachAction) => actionability.data?.actions[action];
  const gateReason = (action: ProspectOutreachAction): string => {
    const check = gateFor(action);
    if (check?.reason !== undefined) {
      return copy.refusalLabels[check.reason] ?? strings.common.vocabularyFallback;
    }
    return actionability.error ?? copy.loading;
  };

  const saveWebsite = async (): Promise<void> => {
    const addition = websiteAddition(prospect.websites, website);
    if (addition.kind === 'invalid') {
      setOutreachNotice(copy.actionFailed);
      return;
    }
    if (addition.kind === 'unchanged') return;
    setSaving(true);
    try {
      await sendJson(`/api/prospects/${prospect.prospectId}`, 'PATCH', {
        websites: addition.websites,
      });
      setWebsite('');
      refreshAll();
    } finally {
      setSaving(false);
    }
  };

  const contactsCopy = copy.contacts;

  const removeContact = async (removal: ContactRemoval): Promise<void> => {
    const request = contactRemovalRequest(prospect.prospectId, removal);
    try {
      await sendJson(request.path, 'DELETE', request.body);
      refreshAll();
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
      refreshAll();
    } catch {
      setOutreachNotice(copy.actionFailed);
    } finally {
      setSaving(false);
    }
  };

  const saveEmail = async (
    suggestion?: NonNullable<ProspectHubDetail['contactSuggestion']>,
  ): Promise<void> => {
    const emails = emailAddition(prospect.emails, email, suggestion);
    if (emails === null) return;
    setSaving(true);
    try {
      await sendJson(`/api/prospects/${prospect.prospectId}`, 'PATCH', { emails });
      if (suggestion === undefined) setEmail('');
      refreshAll();
    } finally {
      setSaving(false);
    }
  };

  const stakeholders = prospect.stakeholders ?? [];

  /** `index` undefined appends; `entry` null removes. Resolves true once saved. */
  const saveStakeholders = async (
    index: number | undefined,
    entry: ProspectStakeholder | null,
  ): Promise<boolean> => {
    setSaving(true);
    try {
      await sendJson(`/api/prospects/${prospect.prospectId}`, 'PATCH', {
        stakeholders: stakeholdersAfterChange(stakeholders, index, entry),
      });
      refreshAll();
      return true;
    } catch {
      setOutreachNotice(copy.actionFailed);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const addStakeholder = async (): Promise<void> => {
    const entry = stakeholderFromInput(newStakeholder.name, newStakeholder.position);
    if (entry === null) return;
    if (await saveStakeholders(undefined, entry)) setNewStakeholder({ name: '', position: '' });
  };

  const saveStakeholderEdit = async (): Promise<void> => {
    if (stakeholderEdit === null) return;
    const entry = stakeholderFromInput(stakeholderEdit.name, stakeholderEdit.position);
    if (entry === null) return;
    if (await saveStakeholders(stakeholderEdit.index, entry)) setStakeholderEdit(null);
  };

  const fieldValue = (key: keyof typeof editedFields): string =>
    editedFields[key] ?? String(prospect[key] ?? '');

  // Issue #289: the stored identity the summary and edit form reflect,
  // whatever its origin (operator, directory, or a scan's fill).
  const identityValues: ProspectIdentityValues = {
    siren: prospect.siren,
    tradingName: prospect.tradingName,
    legalName: prospect.legalName,
  };
  // A draft SIREN blocks the save until it passes the checksum, exactly
  // like the new-scan page's field; the server re-validates on PATCH.
  const sirenError =
    editedFields.siren !== undefined
      ? sirenDraftError(editedFields.siren, copy.sirenInvalidError)
      : null;
  const identityNotes = identityOriginNotes(
    identityValues,
    prospect.fieldOrigins,
    copy,
    strings.common.vocabularyFallback,
  );

  const saveDetails = async (): Promise<void> => {
    if (sirenError !== null) return;
    const patch = detailsPatch(editedFields);
    if (patch === null) return;
    setSaving(true);
    try {
      await sendJson(`/api/prospects/${prospect.prospectId}`, 'PATCH', patch);
      setEditedFields({});
      refreshAll();
    } finally {
      setSaving(false);
    }
  };

  const launchScan = async (type: 'quick-check' | 'full-audit'): Promise<void> => {
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
          scanRefusalNotice(copy, strings.common.vocabularyFallback, result.refusal),
        );
      }
    } catch {
      setOutreachNotice(copy.actionFailed);
    } finally {
      setOutreachBusy(null);
    }
  };

  // Plan 050: archive is the ordinary removal from active work. Issue #381:
  // it keeps the CRM record and correspondence but permanently deletes the
  // prospect's scans, so it asks first with the counts it will remove.
  // Restore returns the record only.
  const restore = async (): Promise<void> => {
    setLifecycleBusy(true);
    setLifecycleNotice(null);
    try {
      await sendJson(
        `/api/prospects/${encodeURIComponent(prospect.prospectId)}/restore`,
        'POST',
        {},
      );
      refreshAll();
    } catch {
      setLifecycleNotice(copy.actionFailed);
    } finally {
      setLifecycleBusy(false);
    }
  };

  const requestArchive = async (): Promise<void> => {
    setLifecycleBusy(true);
    setLifecycleNotice(null);
    try {
      setArchiveImpact(
        await fetchJson<ProspectDeletionImpact>(
          `/api/prospects/${encodeURIComponent(prospect.prospectId)}/deletion-impact`,
        ),
      );
    } catch {
      setLifecycleNotice(copy.actionFailed);
    } finally {
      setLifecycleBusy(false);
    }
  };

  // Also the retry when an earlier archive left scans behind: the archive
  // endpoint is idempotent and resumes the purge.
  const archive = async (): Promise<void> => {
    setLifecycleBusy(true);
    try {
      await sendJson(
        `/api/prospects/${encodeURIComponent(prospect.prospectId)}/archive`,
        'POST',
        {},
      );
    } catch (error) {
      setLifecycleNotice(archiveFailureNotice(copy, error));
    } finally {
      setLifecycleBusy(false);
      refreshAll();
    }
  };

  const requestPermanentDelete = async (): Promise<void> => {
    setLifecycleBusy(true);
    setOutreachNotice(null);
    try {
      setDeletionImpact(
        await fetchJson<ProspectDeletionImpact>(
          `/api/prospects/${encodeURIComponent(prospect.prospectId)}/deletion-impact`,
        ),
      );
    } catch {
      setOutreachNotice(copy.actionFailed);
    } finally {
      setLifecycleBusy(false);
    }
  };

  const deletePermanently = async (): Promise<void> => {
    try {
      await sendJson(`/api/prospects/${encodeURIComponent(prospect.prospectId)}`, 'DELETE', {});
      navigate('/prospects');
    } catch (error) {
      setOutreachNotice(deleteFailureNotice(copy, error));
    }
  };

  const publishPreview = async (): Promise<void> => {
    setOutreachBusy('preview');
    setOutreachNotice(null);
    try {
      const result = await sendJson<{ published: boolean; refusal?: string; url?: string }>(
        `/api/prospects/${prospect.prospectId}/preview/publish`,
        'POST',
        {},
      );
      setOutreachNotice(
        outreachResultNotice(
          copy,
          strings.common.vocabularyFallback,
          { done: result.published, refusal: result.refusal },
          copy.previewPublished,
        ),
      );
      refreshAll();
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
        firstEmailBody(livePreviewUrl),
      );
      setOutreachNotice(
        outreachResultNotice(
          copy,
          strings.common.vocabularyFallback,
          { done: result.created, refusal: result.refusal },
          copy.firstEmailCreated,
        ),
      );
      refreshAll();
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
        outreachResultNotice(
          copy,
          strings.common.vocabularyFallback,
          { done: result.created, refusal: result.refusal },
          copy.followUpCreated,
        ),
      );
      refreshAll();
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
      setOutreachNotice(outcomeNotice(copy, outcome, result));
    } catch (error) {
      setOutreachNotice(outcomeFailureNotice(copy, error));
    } finally {
      setOutreachBusy(null);
      refreshAll();
    }
  };

  const discardDraft = async (draftId: string): Promise<void> => {
    if (!window.confirm(copy.confirmDiscardDraft)) return;
    setOutreachBusy(`discard-${draftId}`);
    setOutreachNotice(null);
    try {
      await sendJson(
        `/api/prospects/${prospect.prospectId}/drafts/${encodeURIComponent(draftId)}/discard`,
        'POST',
        {},
      );
      setOutreachNotice(copy.draftDiscarded);
    } catch {
      setOutreachNotice(copy.actionFailed);
    } finally {
      setOutreachBusy(null);
      refreshAll();
    }
  };

  const revokePreview = async (previewId: string): Promise<void> => {
    if (!window.confirm(copy.confirmRevokePreview)) return;
    setOutreachBusy(`revoke-${previewId}`);
    setOutreachNotice(null);
    try {
      await sendJson(
        `/api/prospects/${prospect.prospectId}/previews/${encodeURIComponent(previewId)}/revoke`,
        'POST',
        {},
      );
      setOutreachNotice(copy.previewRevoked);
    } catch {
      setOutreachNotice(copy.actionFailed);
    } finally {
      setOutreachBusy(null);
      refreshAll();
    }
  };

  const copyPreviewLink = async (url: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url);
      setOutreachNotice(copy.previewLinkCopied);
    } catch {
      setOutreachNotice(copy.actionFailed);
    }
  };

  const outreachLanguage = prospect.outreachLanguage ?? 'fr';
  const changeOutreachLanguage = async (next: string): Promise<void> => {
    setSaving(true);
    try {
      await sendJson(`/api/prospects/${prospect.prospectId}`, 'PATCH', { outreachLanguage: next });
      refreshAll();
    } catch {
      setOutreachNotice(copy.actionFailed);
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (status: string): Promise<void> => {
    setOutreachBusy('status');
    setOutreachNotice(null);
    try {
      await sendJson(`/api/prospects/${prospect.prospectId}/status`, 'PATCH', { status });
      refreshAll();
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
      refreshAll();
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
          ? () => void launchScan('full-audit')
          : recommendation.action === 'create-first-email'
            ? () => void runFirstEmail()
            : () => void runFollowUp();
      return (
        <Button
          onClick={onClick}
          disabled={disabled}
          isLoading={
            outreachBusy ===
            (recommendation.action === 'prepare-audit' ? 'scan-full-audit' : recommendation.action)
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
  const archived = prospect.archivedAt !== undefined;

  return (
    <div className={`${PAGE_WIDTH.reading} px-5 py-8`}>
      <PageHeader
        eyebrow={
          <Link className="inline-flex items-center gap-1 hover:underline" to={returnTo}>
            <ArrowLeft className="size-3" aria-hidden="true" />
            {copy.back}
          </Link>
        }
        title={prospect.name}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {archived ? <Badge tone="neutral">{copy.archivedBadge}</Badge> : null}
            <Badge tone={terminal ? 'neutral' : 'accent'}>
              {label(prospect.status, copy.statusLabels)}
            </Badge>
            {archived ? (
              <Button size="sm" isLoading={lifecycleBusy} onClick={() => void restore()}>
                <ArchiveRestore className="size-4" aria-hidden="true" />
                {copy.restore}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                isLoading={lifecycleBusy}
                onClick={() => void requestArchive()}
              >
                <Archive className="size-4" aria-hidden="true" />
                {copy.archive}
              </Button>
            )}
          </div>
        }
      />
      {archived ? (
        <p className="mb-5 rounded-lg border border-line bg-raised px-4 py-3 text-sm text-ink-soft">
          {copy.archivedNotice.replace('{date}', formatDate(prospect.archivedAt!))}
        </p>
      ) : null}
      {lifecycleNotice ? (
        <p
          role="status"
          className="mb-5 rounded-lg border border-line bg-raised px-4 py-3 text-sm text-ink"
        >
          {lifecycleNotice}
        </p>
      ) : null}
      {archived && audits.length > 0 ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-raised px-4 py-3 text-sm text-ink-soft">
          <p>{copy.archiveCleanupPending}</p>
          <Button
            size="sm"
            variant="secondary"
            isLoading={lifecycleBusy}
            onClick={() => void archive()}
          >
            {copy.finishArchiveCleanup}
          </Button>
        </div>
      ) : null}
      {archiveImpact !== null ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setArchiveImpact(null);
          }}
          title={copy.archiveTitle}
          description={archiveConfirmDescription(
            archiveImpactSummary(archiveImpact, copy.deletionImpactLabels),
            copy,
          )}
          confirmLabel={copy.archive}
          cancelLabel={strings.common.cancel}
          onConfirm={archive}
        />
      ) : null}
      {deletionImpact !== null ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setDeletionImpact(null);
          }}
          title={copy.deletePermanentlyTitle}
          description={permanentDeleteDescription(
            deletionImpactSummary(deletionImpact, copy.deletionImpactLabels),
            copy,
          )}
          confirmLabel={copy.deletePermanently}
          cancelLabel={strings.common.cancel}
          onConfirm={deletePermanently}
        />
      ) : null}

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
              {recommendation.action === 'create-first-email' &&
              gateFor('first-email')?.state !== 'available' ? (
                <p className="text-sm text-ink-muted">{gateReason('first-email')}</p>
              ) : null}
              {recommendation.action === 'create-follow-up' &&
              gateFor('follow-up')?.state !== 'available' ? (
                <p className="text-sm text-ink-muted">{gateReason('follow-up')}</p>
              ) : null}
              {renderRecommendationAction()}
            </div>
          ) : (
            <p className="text-sm text-ink-muted">
              {archived
                ? copy.archivedNoRecommendation
                : terminal
                  ? copy.completed
                  : copy.noRecommendation}
            </p>
          )}
        </Card>

        <Card title={copy.summary} description={copy.info}>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <SummaryField label={copy.name} value={prospect.name} />
            <SummaryField
              label={copy.sector}
              value={formatSector(prospect.sector, strings.common.sectorLabels)}
            />
            <SummaryField
              label={copy.email}
              value={prospect.emails[0]?.address ?? copy.notProvided}
            />
            <SummaryField
              label={copy.commune}
              value={
                [prospect.commune && formatCommune(prospect.commune), prospect.department]
                  .filter(Boolean)
                  .join(' · ') || copy.notProvided
              }
            />
            <SummaryField label={copy.siren} value={prospect.siren || copy.notProvided} />
            <SummaryField
              label={copy.tradingName}
              value={prospect.tradingName || copy.notProvided}
            />
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
                {prospect.contactSuggestion ? (
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-line p-3 text-sm">
                    <p>
                      {copy.contactSuggestion.replace(
                        '{address}',
                        prospect.contactSuggestion.address,
                      )}{' '}
                      <a
                        href={prospect.contactSuggestion.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-ink-muted underline"
                      >
                        {copy.contactSuggestionSource}
                      </a>
                    </p>
                    <Button
                      variant="secondary"
                      isLoading={saving}
                      onClick={() => void saveEmail(prospect.contactSuggestion ?? undefined)}
                    >
                      {copy.contactSuggestionAccept}
                    </Button>
                  </div>
                ) : null}
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
                    placeholder={copy.emailPlaceholder}
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
              <div>
                <p className="mb-2 text-xs text-ink-muted">{contactsCopy.stakeholders}</p>
                <ul className="grid gap-2">
                  {stakeholders.length > 0 ? (
                    stakeholders.map((item, index) =>
                      stakeholderEdit?.index === index ? (
                        <li
                          key={`${index}-edit`}
                          className="grid gap-2 md:grid-cols-[1fr_1fr_auto]"
                        >
                          <Input
                            value={stakeholderEdit.name}
                            onChange={(event) =>
                              setStakeholderEdit({ ...stakeholderEdit, name: event.target.value })
                            }
                            aria-label={contactsCopy.stakeholderName}
                          />
                          <Input
                            value={stakeholderEdit.position}
                            onChange={(event) =>
                              setStakeholderEdit({
                                ...stakeholderEdit,
                                position: event.target.value,
                              })
                            }
                            aria-label={contactsCopy.stakeholderPosition}
                          />
                          <span className="flex items-center gap-1">
                            <Button
                              variant="secondary"
                              isLoading={saving}
                              disabled={!stakeholderEdit.name.trim()}
                              onClick={() => void saveStakeholderEdit()}
                            >
                              {contactsCopy.saveStakeholder}
                            </Button>
                            <Button variant="ghost" onClick={() => setStakeholderEdit(null)}>
                              {strings.common.cancel}
                            </Button>
                          </span>
                        </li>
                      ) : (
                        <li
                          key={`${index}-${item.name}`}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <span className="text-ink">{item.name}</span>
                          {item.position !== undefined ? (
                            <span className="text-xs text-ink-muted">{item.position}</span>
                          ) : null}
                          <span className="ml-auto flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={saving}
                              aria-label={contactsCopy.editStakeholder.replace('{name}', item.name)}
                              onClick={() =>
                                setStakeholderEdit({
                                  index,
                                  name: item.name,
                                  position: item.position ?? '',
                                })
                              }
                            >
                              <Pencil className="size-4" aria-hidden="true" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={saving}
                              aria-label={contactsCopy.removeStakeholder.replace(
                                '{name}',
                                item.name,
                              )}
                              onClick={() => setPendingStakeholderRemoval(index)}
                            >
                              <X className="size-4" aria-hidden="true" />
                            </Button>
                          </span>
                        </li>
                      ),
                    )
                  ) : (
                    <li className="text-sm text-ink-muted">{copy.notProvided}</li>
                  )}
                </ul>
                {pendingStakeholderRemoval !== null &&
                stakeholders[pendingStakeholderRemoval] !== undefined ? (
                  <ConfirmDialog
                    open
                    onOpenChange={(open) => {
                      if (!open) setPendingStakeholderRemoval(null);
                    }}
                    title={contactsCopy.removeStakeholderTitle}
                    description={contactsCopy.removeStakeholderDescription.replace(
                      '{name}',
                      stakeholders[pendingStakeholderRemoval].name,
                    )}
                    confirmLabel={contactsCopy.confirmRemove}
                    cancelLabel={strings.common.cancel}
                    onConfirm={async () => {
                      await saveStakeholders(pendingStakeholderRemoval, null);
                      setStakeholderEdit(null);
                    }}
                  />
                ) : null}
                <div className="mt-2 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                  <Input
                    value={newStakeholder.name}
                    onChange={(event) =>
                      setNewStakeholder({ ...newStakeholder, name: event.target.value })
                    }
                    placeholder={contactsCopy.stakeholderName}
                    aria-label={contactsCopy.stakeholderName}
                  />
                  <Input
                    value={newStakeholder.position}
                    onChange={(event) =>
                      setNewStakeholder({ ...newStakeholder, position: event.target.value })
                    }
                    placeholder={contactsCopy.stakeholderPosition}
                    aria-label={contactsCopy.stakeholderPosition}
                  />
                  <Button
                    isLoading={saving}
                    disabled={!newStakeholder.name.trim()}
                    onClick={() => void addStakeholder()}
                  >
                    {contactsCopy.addStakeholder}
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
                <>
                  <Link
                    className="mt-1 block font-medium text-ink hover:underline"
                    to={`/audits/${encodeURIComponent(qualifyingAudit.auditId)}`}
                  >
                    {copy.auditKindLabels[qualifyingAudit.scanIntent ?? qualifyingAudit.kind] ??
                      strings.common.vocabularyFallback}
                  </Link>
                  <p className="mt-1 text-xs text-ink-muted">
                    {copy.scanDate
                      .replace('{date}', formatDate(qualifyingAudit.startedAt))
                      .replace('{days}', String(daysSince(qualifyingAudit.startedAt)))}
                  </p>
                  {qualifyingAudit.auditId === work?.qualifyingAuditId &&
                  work.dataVersionState === 'older' ? (
                    <p className="mt-1 text-xs text-ink-muted">{copy.olderDataVersion}</p>
                  ) : null}
                </>
              ) : (
                <p className="mt-1 text-ink-muted">{copy.notProvided}</p>
              )}
            </div>
          </div>
          <label className="mt-4 grid max-w-xs gap-1 border-t border-line pt-4 text-sm">
            <span className="text-xs text-ink-muted">{copy.outreachLanguage}</span>
            <Select
              value={outreachLanguage}
              disabled={saving || drafts.some((draft) => draft.status === 'created')}
              onChange={(event) => void changeOutreachLanguage(event.target.value)}
            >
              <option value="fr">{copy.languageLabels.fr}</option>
              <option value="en">{copy.languageLabels.en}</option>
            </Select>
            <span className="text-xs text-ink-muted">{copy.outreachLanguageHint}</span>
          </label>
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
                    <dl className="mt-2 grid gap-1 text-xs">
                      <div className="flex gap-2">
                        <dt className="text-ink-muted">{copy.draftRecipient}</dt>
                        <dd className="break-all">{draft.recipient ?? copy.notProvided}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-ink-muted">{copy.outreachLanguage}</dt>
                        <dd>
                          {draft.language === undefined
                            ? copy.notProvided
                            : copy.languageLabels[draft.language]}
                        </dd>
                      </div>
                    </dl>
                    {draft.body ? (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-medium">
                          {copy.draftBody}
                        </summary>
                        <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-sm">
                          {draft.body}
                        </pre>
                      </details>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {draft.previewUrl ? (
                        <a
                          className={buttonStyles('secondary', 'sm')}
                          href={draft.previewUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {copy.openPreview}
                          <ExternalLink className="size-3" aria-hidden="true" />
                        </a>
                      ) : null}
                      {draft.mailboxUrl && draft.status === 'created' ? (
                        <a
                          className={buttonStyles('secondary', 'sm')}
                          href={draft.mailboxUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {copy.openInMailbox}
                          <ExternalLink className="size-3" aria-hidden="true" />
                        </a>
                      ) : null}
                      {draft.status === 'created' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={outreachBusy !== null}
                          isLoading={outreachBusy === `discard-${draft.draftId}`}
                          onClick={() => void discardDraft(draft.draftId)}
                        >
                          {copy.discardDraft}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink-muted">{copy.noDraft}</p>
            )}
          </div>
          {livePreview !== undefined ? (
            <div className="mt-3 rounded-lg border border-line px-3 py-2 text-sm">
              <p className="text-xs text-ink-muted">
                {copy.previewLink}{' '}
                {copy.previewExpires.replace('{date}', formatDate(livePreview.publicExpiresAt))}
              </p>
              {livePreviewUrl !== null ? (
                <a
                  className="break-all text-ink hover:underline"
                  href={livePreviewUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {livePreviewUrl}
                </a>
              ) : (
                <p className="text-xs text-ink-muted">{copy.previewLinkUnavailable}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {livePreviewUrl !== null ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void copyPreviewLink(livePreviewUrl)}
                  >
                    {copy.copyPreviewLink}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={outreachBusy !== null}
                  isLoading={outreachBusy === `revoke-${livePreview.previewId}`}
                  onClick={() => void revokePreview(livePreview.previewId)}
                >
                  {copy.revokePreview}
                </Button>
              </div>
            </div>
          ) : null}
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
                        {key === 'preview' && livePreview !== undefined ? (
                          <Button
                            className="mt-2 mr-2"
                            size="sm"
                            variant="ghost"
                            disabled={outreachBusy !== null}
                            isLoading={outreachBusy === `revoke-${livePreview.previewId}`}
                            onClick={() => void revokePreview(livePreview.previewId)}
                          >
                            {copy.revokePreview}
                          </Button>
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
              <details className="border-t border-line pt-4">
                <summary className="cursor-pointer text-sm font-medium text-danger">
                  {copy.dangerZone}
                </summary>
                <p className="mt-2 text-xs text-ink-muted">{copy.deletePermanentlyHint}</p>
                <Button
                  className="mt-2"
                  variant="danger"
                  isLoading={lifecycleBusy}
                  onClick={() => void requestPermanentDelete()}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  {copy.deletePermanently}
                </Button>
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
                    {copy.eventLabels[eventLabelKey(event)] ?? strings.common.vocabularyFallback}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {formatDate(event.at)} · {actorLabel(event.actor)}
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
                        {preview.status === 'live' ? (
                          <span className="ml-2 text-xs text-ink-muted">
                            {copy.previewExpires.replace(
                              '{date}',
                              formatDate(preview.publicExpiresAt),
                            )}
                          </span>
                        ) : null}
                        <span className="mt-1 flex flex-wrap items-center gap-2">
                          {preview.url !== undefined && preview.status === 'live' ? (
                            <a
                              className="inline-flex items-center gap-1 text-xs text-ink hover:underline"
                              href={preview.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {copy.openPreview}
                              <ExternalLink className="size-3" aria-hidden="true" />
                            </a>
                          ) : null}
                          {preview.status === 'live' ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={outreachBusy !== null}
                              isLoading={outreachBusy === `revoke-${preview.previewId}`}
                              onClick={() => void revokePreview(preview.previewId)}
                            >
                              {copy.revokePreview}
                            </Button>
                          ) : null}
                        </span>
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
                          {copy.eventLabels[eventLabelKey(event)] ??
                            strings.common.vocabularyFallback}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {formatDate(event.at)} · {actorLabel(event.actor)}
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
    </div>
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
