import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Button } from '../components/ui/button';
import { ApiError, fetchJson, sendDelete, sendJson } from '../lib/api';
import { useI18n } from '../i18n/provider';

type ContactOrigin = 'other-public-source' | 'provided-directly';

interface ContactProjection {
  address: string | null;
  origin: 'hotel-website' | ContactOrigin;
  manual: boolean;
  freeMailAttestedAt: string | null;
}

interface ContactResponse {
  linkedToAudit: boolean;
  manual: ContactProjection | null;
  discovered: ContactProjection | null;
  effective: ContactProjection | null;
}

interface Copy {
  title: string;
  overrideBadge: string;
  helper: string;
  address: string;
  origin: string;
  publicSource: string;
  providedDirectly: string;
  save: string;
  remove: string;
  linkedReason: string;
  loading: string;
  discoveredLabel: string;
  effectiveLabel: string;
  freeMailWarning: string;
  freeMailAttestation: string;
  saved: string;
  removed: string;
  genericError: string;
}

const FR: Copy = {
  title: 'Adresse de contact',
  overrideBadge: 'Remplacement manuel',
  helper:
    "Une adresse saisie ici remplace l’adresse découverte pour la rédaction. La supprimer retire uniquement ce remplacement et rétablit la version découverte demandée.",
  address: 'Adresse e-mail',
  origin: 'Origine de cette adresse',
  publicSource: 'Annuaire professionnel ou plateforme de réservation en ligne',
  providedDirectly: 'Coordonnées communiquées directement par l’établissement',
  save: 'Enregistrer le remplacement',
  remove: 'Retirer le remplacement',
  linkedReason: 'Disponible après liaison de cet hôtel à un audit.',
  loading: 'Chargement du contact…',
  discoveredLabel: 'Adresse découverte',
  effectiveLabel: 'Adresse utilisée',
  freeMailWarning:
    'Cette adresse appartient à un service de messagerie grand public (Gmail, Outlook, etc.). Ces adresses sont normalement exclues car assimilées à un usage personnel.',
  freeMailAttestation:
    'Je confirme que cette adresse est utilisée par cet établissement dans le cadre de son activité professionnelle.',
  saved: 'Remplacement manuel enregistré.',
  removed: 'Remplacement manuel retiré. L’adresse découverte demandée redevient effective.',
  genericError: 'Impossible de mettre à jour l’adresse de contact.',
};

const EN: Copy = {
  title: 'Contact address',
  overrideBadge: 'Manual override',
  helper:
    'An address entered here overrides the discovered address for drafting. Removing it removes only this override and restores the requested discovered version.',
  address: 'Email address',
  origin: 'Source of this address',
  publicSource: 'Professional directory or online booking platform',
  providedDirectly: 'Contact details provided directly by the business',
  save: 'Save override',
  remove: 'Remove override',
  linkedReason: 'Available after this hotel is linked to an audit.',
  loading: 'Loading contact…',
  discoveredLabel: 'Discovered address',
  effectiveLabel: 'Address in use',
  freeMailWarning:
    'This address belongs to a consumer email service (Gmail, Outlook, etc.). These addresses are normally excluded as personal.',
  freeMailAttestation:
    'I confirm that this address is used by this business for its professional activity.',
  saved: 'Manual override saved.',
  removed: 'Manual override removed. The requested discovered address is effective again.',
  genericError: 'Could not update the contact address.',
};

export function HubContactEditor(props: { candidateId: string }): JSX.Element {
  const { language } = useI18n();
  const copy = language === 'fr' ? FR : EN;
  const path = `/api/prospects/${encodeURIComponent(props.candidateId)}/contact`;
  const [data, setData] = useState<ContactResponse | null>(null);
  const [address, setAddress] = useState('');
  const [origin, setOrigin] = useState<ContactOrigin>('other-public-source');
  const [attested, setAttested] = useState(false);
  const [requiresAttestation, setRequiresAttestation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const next = await fetchJson<ContactResponse>(path);
    setData(next);
    if (next.manual?.address !== null && next.manual?.address !== undefined) {
      setAddress(next.manual.address);
      if (next.manual.origin === 'other-public-source' || next.manual.origin === 'provided-directly') {
        setOrigin(next.manual.origin);
      }
      const hasAttestation = next.manual.freeMailAttestedAt !== null;
      setAttested(hasAttestation);
      setRequiresAttestation(hasAttestation);
    } else {
      setAddress('');
      setAttested(false);
      setRequiresAttestation(false);
    }
  }, [path]);

  useEffect(() => {
    void load().catch(() => setMessage(copy.genericError));
  }, [copy.genericError, load]);

  const save = async (): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      await sendJson<{ contact: ContactProjection | null }>(path, 'PUT', {
        address,
        origin,
        freeMailProfessionalUseAttested: attested,
      });
      await load();
      setMessage(copy.saved);
    } catch (cause: unknown) {
      if (cause instanceof ApiError && cause.message === 'free-mail-needs-attestation') {
        setRequiresAttestation(true);
        setMessage(copy.freeMailWarning);
      } else {
        setMessage(cause instanceof ApiError ? cause.message : copy.genericError);
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async (): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      await sendDelete<{ contact: ContactProjection | null }>(path);
      await load();
      setMessage(copy.removed);
    } catch (cause: unknown) {
      setMessage(cause instanceof ApiError ? cause.message : copy.genericError);
    } finally {
      setBusy(false);
    }
  };

  if (data === null) {
    return <p className="mt-4 text-sm text-ink-muted">{copy.loading}</p>;
  }

  const disabled = busy || !data.linkedToAudit;

  return (
    <section className="mt-5 border-t border-line pt-4" aria-label={copy.title}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-ink">{copy.title}</h3>
        {data.manual !== null ? (
          <span className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-soft">
            {copy.overrideBadge}
          </span>
        ) : null}
      </div>
      <p className="mt-1 max-w-3xl text-xs text-ink-muted">{copy.helper}</p>

      {data.discovered?.address !== null && data.discovered?.address !== undefined ? (
        <p className="mt-2 text-xs text-ink-soft">
          {copy.discoveredLabel}: <span className="font-mono">{data.discovered.address}</span>
        </p>
      ) : null}
      {data.effective?.address !== null && data.effective?.address !== undefined ? (
        <p className="mt-1 text-xs text-ink-soft">
          {copy.effectiveLabel}: <span className="font-mono">{data.effective.address}</span>
        </p>
      ) : null}

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          {copy.address}
          <input
            type="email"
            value={address}
            disabled={disabled}
            onChange={(event) => {
              setAddress(event.target.value);
              setRequiresAttestation(false);
              setAttested(false);
            }}
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink disabled:opacity-50"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          {copy.origin}
          <select
            value={origin}
            disabled={disabled}
            onChange={(event) => setOrigin(event.target.value as ContactOrigin)}
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink disabled:opacity-50"
          >
            <option value="other-public-source">{copy.publicSource}</option>
            <option value="provided-directly">{copy.providedDirectly}</option>
          </select>
        </label>
      </div>

      {requiresAttestation ? (
        <div className="mt-3 rounded-md border border-line bg-surface-soft p-3">
          <p className="text-xs text-ink-soft">{copy.freeMailWarning}</p>
          <label className="mt-2 flex items-start gap-2 text-xs text-ink">
            <input
              type="checkbox"
              checked={attested}
              disabled={busy}
              onChange={(event) => setAttested(event.target.checked)}
            />
            <span>{copy.freeMailAttestation}</span>
          </label>
        </div>
      ) : null}

      {!data.linkedToAudit ? <p className="mt-3 text-xs text-ink-muted">{copy.linkedReason}</p> : null}
      {message !== null ? <p className="mt-3 text-xs text-ink-soft">{message}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={disabled || address.trim() === ''}
          isLoading={busy}
          onClick={() => void save()}
        >
          {copy.save}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || data.manual === null}
          onClick={() => void remove()}
        >
          {copy.remove}
        </Button>
      </div>
    </section>
  );
}
