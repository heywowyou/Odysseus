/**
 * The hotel-information form of the client-report stepper's Prepare step
 * (formerly the standalone EnrichmentCard): manual fields with detected
 * provenance hints, the SIREN checksum-and-lookup helper, and the
 * transactional-flow override. The form owns no save button of its own:
 * the stepper's single Enregistrer calls save() through a ref, so the two
 * halves of the step share one save (approved IA, duplicate-controls
 * table).
 */

import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { toast } from 'sonner';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Field } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { useI18n } from '../i18n/provider';
import { sendJson } from '../lib/api';
import { cn } from '../lib/cn';
import {
  buildManualFieldsPatch,
  isValidSiren,
  manualFieldValuesFromResponse,
  normalizeSiren,
} from './audit-detail-model';
import type {
  ManualFieldKey,
  ManualFieldsPatch,
  ManualFieldValues,
  SectorChoice,
  TextManualFieldKey,
} from './audit-detail-model';
import type {
  AuditFailureResponse,
  ManualFieldsResponse,
  SirenPreviewResponse,
} from './audit-detail-types';

interface TextFieldDef {
  key: TextManualFieldKey;
  label: `${TextManualFieldKey}Label`;
}

const TEXT_FIELDS_TOP: readonly TextFieldDef[] = [
  { key: 'sirenSourceUrl', label: 'sirenSourceUrlLabel' },
  { key: 'raisonSociale', label: 'raisonSocialeLabel' },
  { key: 'nomCommercial', label: 'nomCommercialLabel' },
  { key: 'recipientName', label: 'recipientNameLabel' },
];

const TEXT_FIELDS_BOTTOM: readonly TextFieldDef[] = [
  { key: 'revenueBand', label: 'revenueBandLabel' },
  { key: 'declarationContactEmail', label: 'declarationContactEmailLabel' },
];

type SirenCheckState =
  { kind: 'idle' } | { kind: 'resolved'; denomination: string } | { kind: 'unresolved' };

type TransactionalFlowChoice = '' | 'present' | 'absent';

function transactionalFlowChoice(
  override: ManualFieldsResponse['transactionalFlowOverride'],
): TransactionalFlowChoice {
  if (override === undefined) return '';
  return override.value ? 'present' : 'absent';
}

function DetectedHint({ visible, label }: { visible: boolean; label: string }): JSX.Element | null {
  if (!visible) return null;
  return <p className="mt-1.5 text-xs text-accent-bright">{label}</p>;
}

export interface HotelFieldsFormHandle {
  /** PATCHes the changed fields; resolves true when the stored state is
   *  correct afterwards (saved, or nothing had changed). Validation and
   *  request errors are surfaced inside (field error, toast), so the
   *  caller owes only the one success toast for the whole step. */
  save: (options?: { confirmDetected?: boolean }) => Promise<boolean>;
  /** True while the stored detected identity fields still await an
   *  operator confirmation the save can carry. */
  hasDetectedConfirmation: () => boolean;
}

interface HotelFieldsFormProps {
  auditId: string;
  manualFields: ManualFieldsResponse | null;
  detectedTransactionalFlow: boolean | undefined;
  awaitingIdentityFields: AuditFailureResponse['needsInputFields'];
}

export const HotelFieldsForm = forwardRef<HotelFieldsFormHandle, HotelFieldsFormProps>(
  function HotelFieldsForm(
    { auditId, manualFields, detectedTransactionalFlow, awaitingIdentityFields },
    ref,
  ): JSX.Element {
    const { strings } = useI18n();
    const baseline = useMemo(() => manualFieldValuesFromResponse(manualFields), [manualFields]);
    const [values, setValues] = useState<ManualFieldValues>(baseline);
    const [editedKeys, setEditedKeys] = useState<ReadonlySet<ManualFieldKey>>(() => new Set());
    const [isDirty, setIsDirty] = useState(false);
    const [sirenInvalid, setSirenInvalid] = useState(false);
    const [sirenCheck, setSirenCheck] = useState<SirenCheckState>({ kind: 'idle' });
    const [isCheckingSiren, setIsCheckingSiren] = useState(false);
    const [transactionalFlow, setTransactionalFlow] = useState<TransactionalFlowChoice>(() =>
      transactionalFlowChoice(manualFields?.transactionalFlowOverride),
    );
    const [transactionalFlowReason, setTransactionalFlowReason] = useState(
      () => manualFields?.transactionalFlowOverride?.reason ?? '',
    );
    const [transactionalFlowInvalid, setTransactionalFlowInvalid] = useState(false);

    // Re-seed the form whenever a fresh baseline arrives while the form is
    // clean, so a refetch after a save or a regenerate shows server truth
    // (operator provenance, spaces normalized). A dirty form is never
    // clobbered by a refetch.
    useEffect(() => {
      if (!isDirty) {
        setValues(baseline);
        setEditedKeys(new Set());
        setTransactionalFlow(transactionalFlowChoice(manualFields?.transactionalFlowOverride));
        setTransactionalFlowReason(manualFields?.transactionalFlowOverride?.reason ?? '');
        setTransactionalFlowInvalid(false);
      }
    }, [baseline, isDirty, manualFields?.transactionalFlowOverride]);

    const markEdited = (key: ManualFieldKey): void => {
      setIsDirty(true);
      setEditedKeys((current) => new Set(current).add(key));
    };

    const setText = (key: TextManualFieldKey, value: string): void => {
      markEdited(key);
      setValues((current) => {
        const next: ManualFieldValues = { ...current };
        next[key] = value;
        return next;
      });
    };

    const setSector = (value: SectorChoice): void => {
      markEdited('sector');
      setValues((current) => ({ ...current, sector: value }));
    };

    const setTransactionalFlowChoice = (value: TransactionalFlowChoice): void => {
      setIsDirty(true);
      setTransactionalFlowInvalid(false);
      setTransactionalFlow(value);
    };

    const setTransactionalFlowReasonValue = (value: string): void => {
      setIsDirty(true);
      setTransactionalFlowInvalid(false);
      setTransactionalFlowReason(value);
    };

    const handleSirenChange = (value: string): void => {
      setText('siren', value);
      setSirenInvalid(false);
      setSirenCheck({ kind: 'idle' });
    };

    // The 'please confirm' hint only makes sense while the shown value is
    // still exactly what the scanner detected; editing a field hides its
    // hint for good, because the next save stores the value as operator.
    const showDetectedHint = (key: ManualFieldKey): boolean =>
      !editedKeys.has(key) && manualFields?.[key]?.provenance === 'detected';

    const handleCheckSiren = async (): Promise<void> => {
      const cleaned = normalizeSiren(values.siren);
      if (!isValidSiren(cleaned)) {
        setSirenInvalid(true);
        return;
      }
      setSirenInvalid(false);
      setIsCheckingSiren(true);
      try {
        const result = await sendJson<SirenPreviewResponse>(
          `/api/audits/${encodeURIComponent(auditId)}/manual-fields/siren-preview`,
          'POST',
          { siren: cleaned },
        );
        setSirenCheck(
          result.resolved
            ? { kind: 'resolved', denomination: result.denomination ?? '' }
            : { kind: 'unresolved' },
        );
      } catch (error) {
        // The raw error string stays as the secondary detail line; the toast
        // headline is always localized product copy.
        toast.error(strings.auditDetail.actionError, {
          description: error instanceof Error ? error.message : undefined,
        });
      } finally {
        setIsCheckingSiren(false);
      }
    };

    const detectedIdentityPatch = (): ManualFieldsPatch => {
      const patch: ManualFieldsPatch = {};
      for (const awaiting of awaitingIdentityFields ?? []) {
        if (awaiting.field !== 'nomCommercial' && awaiting.field !== 'raisonSociale') continue;
        if (manualFields?.[awaiting.field]?.provenance !== 'detected') continue;
        const value = values[awaiting.field].trim();
        if (value !== '') patch[awaiting.field] = value;
      }
      return patch;
    };

    const save = async (options: { confirmDetected?: boolean } = {}): Promise<boolean> => {
      const patch = buildManualFieldsPatch(values, baseline);
      const siren = patch['siren'];
      if (siren !== undefined && !isValidSiren(siren)) {
        setSirenInvalid(true);
        return false;
      }
      const existingOverride = manualFields?.transactionalFlowOverride;
      const normalizedReason = transactionalFlowReason.trim();
      const flowValue = transactionalFlow === 'present';
      if (transactionalFlow !== '' && normalizedReason === '') {
        setTransactionalFlowInvalid(true);
        return false;
      }
      const transactionalFlowPatch =
        transactionalFlow !== '' &&
        (existingOverride === undefined ||
          existingOverride.value !== flowValue ||
          existingOverride.reason !== normalizedReason)
          ? { transactionalFlowOverride: { value: flowValue, reason: normalizedReason } }
          : {};
      const requestPatch = {
        ...patch,
        ...(options.confirmDetected === true ? detectedIdentityPatch() : {}),
        ...transactionalFlowPatch,
      };
      if (Object.keys(requestPatch).length === 0) {
        // Nothing the server recognizes changed; sending anyway would only
        // earn a 400 for an empty patch. The stored values already match.
        setIsDirty(false);
        return true;
      }
      try {
        await sendJson(
          `/api/audits/${encodeURIComponent(auditId)}/manual-fields`,
          'PATCH',
          requestPatch,
        );
        // The refetch below returns operator provenance for every saved
        // field, so the detected hints drop exactly like the old page's
        // reload did.
        setIsDirty(false);
        return true;
      } catch (error) {
        toast.error(strings.auditDetail.actionError, {
          description: error instanceof Error ? error.message : undefined,
        });
        return false;
      }
    };

    useImperativeHandle(ref, () => ({
      save,
      hasDetectedConfirmation: () => Object.keys(detectedIdentityPatch()).length > 0,
    }));

    const renderTextField = (def: TextFieldDef): JSX.Element => (
      <div key={def.key}>
        <Field label={strings.auditDetail[def.label]} htmlFor={`mf-${def.key}`}>
          <Input
            id={`mf-${def.key}`}
            name={def.key}
            value={values[def.key]}
            onChange={(event) => setText(def.key, event.target.value)}
          />
        </Field>
        <DetectedHint
          visible={showDetectedHint(def.key)}
          label={strings.auditDetail.detectedFieldHint}
        />
      </div>
    );

    const sirenFeedback: { text: string; tone: string } | null = isCheckingSiren
      ? { text: strings.auditDetail.sirenCheckingMessage, tone: 'text-ink-muted' }
      : sirenCheck.kind === 'resolved'
        ? {
            text: `${strings.auditDetail.sirenResolvedPrefix} ${sirenCheck.denomination}`,
            tone: 'text-accent-bright',
          }
        : sirenCheck.kind === 'unresolved'
          ? { text: strings.auditDetail.sirenNotResolvedMessage, tone: 'text-ink-muted' }
          : null;

    return (
      <Card
        title={strings.auditDetail.manualFieldsHeading}
        description={strings.auditDetail.manualFieldsHint}
      >
        <div className="grid max-w-reading grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Field
              label={strings.auditDetail.sirenLabel}
              htmlFor="mf-siren"
              {...(sirenInvalid ? { error: strings.auditDetail.sirenInvalidError } : {})}
            >
              <div className="flex gap-2">
                <Input
                  id="mf-siren"
                  name="siren"
                  value={values.siren}
                  onChange={(event) => handleSirenChange(event.target.value)}
                  className="max-w-48"
                />
                <Button
                  variant="secondary"
                  isLoading={isCheckingSiren}
                  onClick={() => void handleCheckSiren()}
                >
                  {strings.auditDetail.sirenCheckButton}
                </Button>
              </div>
            </Field>
            {sirenFeedback !== null ? (
              <p className={cn('mt-1.5 text-xs', sirenFeedback.tone)}>{sirenFeedback.text}</p>
            ) : null}
            <DetectedHint
              visible={showDetectedHint('siren')}
              label={strings.auditDetail.detectedFieldHint}
            />
          </div>
          {TEXT_FIELDS_TOP.map((def) => renderTextField(def))}
          <div>
            <Field label={strings.auditDetail.sectorLabel} htmlFor="mf-sector">
              <Select
                id="mf-sector"
                name="sector"
                value={values.sector}
                onChange={(event) => {
                  const next = event.target.value;
                  setSector(next === 'general' || next === 'hospitality' ? next : '');
                }}
              >
                <option value="">{strings.auditDetail.sectorAutoOption}</option>
                <option value="general">{strings.auditDetail.sectorGeneralOption}</option>
                <option value="hospitality">{strings.auditDetail.sectorHospitalityOption}</option>
              </Select>
            </Field>
            <DetectedHint
              visible={showDetectedHint('sector')}
              label={strings.auditDetail.detectedFieldHint}
            />
          </div>
          {TEXT_FIELDS_BOTTOM.map((def) => renderTextField(def))}
          <div className="md:col-span-2">
            <Field
              label={strings.auditDetail.transactionalFlowLabel}
              htmlFor="mf-transactional-flow"
            >
              <Select
                id="mf-transactional-flow"
                name="transactionalFlow"
                value={transactionalFlow}
                onChange={(event) => {
                  const value = event.target.value;
                  setTransactionalFlowChoice(
                    value === 'present' || value === 'absent' ? value : '',
                  );
                }}
              >
                {manualFields?.transactionalFlowOverride === undefined ? (
                  <option value="">{strings.auditDetail.transactionalFlowUnspecifiedOption}</option>
                ) : null}
                <option value="present">{strings.auditDetail.transactionalFlowYesOption}</option>
                <option value="absent">{strings.auditDetail.transactionalFlowNoOption}</option>
              </Select>
            </Field>
            {detectedTransactionalFlow !== undefined ? (
              <p className="mt-1.5 text-xs text-accent-bright">
                {strings.auditDetail.transactionalFlowDetectedTemplate.replace(
                  '{value}',
                  detectedTransactionalFlow
                    ? strings.auditDetail.transactionalFlowYesOption
                    : strings.auditDetail.transactionalFlowNoOption,
                )}
              </p>
            ) : null}
            {transactionalFlow !== '' ? (
              <div className="mt-3">
                <Field
                  label={strings.auditDetail.transactionalFlowReasonLabel}
                  htmlFor="mf-transactional-flow-reason"
                  {...(transactionalFlowInvalid
                    ? { error: strings.auditDetail.transactionalFlowReasonRequired }
                    : {})}
                >
                  <Input
                    id="mf-transactional-flow-reason"
                    name="transactionalFlowReason"
                    value={transactionalFlowReason}
                    placeholder={strings.auditDetail.transactionalFlowReasonPlaceholder}
                    onChange={(event) => setTransactionalFlowReasonValue(event.target.value)}
                  />
                </Field>
              </div>
            ) : null}
            <p className="mt-3 text-xs text-ink-muted">
              {strings.auditDetail.transactionalFlowSavedHint}
            </p>
          </div>
        </div>
      </Card>
    );
  },
);
