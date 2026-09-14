/**
 * Issue: operator-reviewed overall grade override. Shows the automatic
 * grade the report always computes, and, when the operator has reviewed
 * it, the saved override with its reason - never replacing the automatic
 * grade, only sitting alongside it (resolveEffectiveGrade in
 * @odysseus/report is the single place that decides which one a client
 * ever sees).
 */

import { useState } from 'react';
import type { JSX } from 'react';
import { toast } from 'sonner';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Select } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { useI18n } from '../i18n/provider';
import { sendDelete, sendJson } from '../lib/api';
import { formatDateTime } from '../lib/format';
import type { AuditDetailResponse, Grade, GradeOverrideResponse } from './audit-detail-types';

const GRADES: readonly Grade[] = ['A', 'B', 'C', 'D'];

export function AuditGradeOverridePanel(props: {
  auditId: string;
  detail: AuditDetailResponse;
  onBusy: (active: boolean) => void;
  refresh: () => void;
}): JSX.Element | null {
  const { auditId, detail, onBusy, refresh } = props;
  const { language, strings } = useI18n();
  const copy = strings.auditDetail.gradeOverride;

  const automaticGrade = detail.automaticGrade;
  const override = detail.gradeOverride ?? null;
  const [isEditing, setIsEditing] = useState(false);
  const [grade, setGrade] = useState<Grade>(override?.grade ?? automaticGrade ?? 'A');
  const [reason, setReason] = useState(override?.reason ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // The server always sends automaticGrade; absent only for a stale cached
  // response from before this field existed, which a refresh replaces.
  if (automaticGrade === undefined) return null;

  const beginEdit = (): void => {
    setGrade(override?.grade ?? automaticGrade);
    setReason(override?.reason ?? '');
    setIsEditing(true);
  };

  const handleSave = async (): Promise<void> => {
    if (reason.trim() === '') {
      toast.error(copy.reasonRequiredError);
      return;
    }
    setIsSaving(true);
    onBusy(true);
    try {
      await sendJson<{ gradeOverride: GradeOverrideResponse }>(
        `/api/audits/${encodeURIComponent(auditId)}/grade-override`,
        'PUT',
        { grade, reason: reason.trim() },
      );
      toast.success(copy.saveSuccess);
      setIsEditing(false);
      refresh();
    } catch (saveError) {
      toast.error(copy.saveError, {
        description: saveError instanceof Error ? saveError.message : undefined,
      });
    } finally {
      setIsSaving(false);
      onBusy(false);
    }
  };

  const handleClear = async (): Promise<void> => {
    setIsClearing(true);
    onBusy(true);
    try {
      await sendDelete(`/api/audits/${encodeURIComponent(auditId)}/grade-override`);
      toast.success(copy.clearSuccess);
      setIsEditing(false);
      refresh();
    } catch (clearError) {
      toast.error(copy.clearError, {
        description: clearError instanceof Error ? clearError.message : undefined,
      });
    } finally {
      setIsClearing(false);
      onBusy(false);
    }
  };

  return (
    <Card title={copy.heading} description={copy.description}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-muted">{copy.automaticGradeLabel}</span>
          <Badge tone="accent" className="numeric">
            {automaticGrade}
          </Badge>
        </div>

        {override !== null && !isEditing ? (
          <div className="flex flex-col gap-1 rounded-lg border border-line bg-raised p-3 text-[13px]">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent" className="numeric">
                {override.grade}
              </Badge>
              <span className="text-ink">
                {copy.overrideActiveLabel.replace('{grade}', override.grade)}
              </span>
            </div>
            <p className="text-ink-muted">
              {copy.overrideReasonLabel} : {override.reason}
            </p>
            <p className="text-ink-muted">
              {copy.overrideReviewedAtLabel} : {formatDateTime(override.reviewedAt, language)}
            </p>
          </div>
        ) : null}

        {isEditing ? (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs text-ink-muted">
              {copy.gradeFieldLabel}
              <Select value={grade} onChange={(event) => setGrade(event.target.value as Grade)}>
                {GRADES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-muted">
              {copy.reasonFieldLabel}
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={copy.reasonPlaceholder}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" isLoading={isSaving} onClick={() => void handleSave()}>
                {copy.saveButton}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={isSaving}
                onClick={() => setIsEditing(false)}
              >
                {copy.cancelButton}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={beginEdit}>
              {copy.editButton}
            </Button>
            {override !== null ? (
              <Button
                variant="danger"
                size="sm"
                isLoading={isClearing}
                onClick={() => void handleClear()}
              >
                {copy.clearButton}
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </Card>
  );
}
