import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { useI18n } from '../i18n/provider';
import { sendJson } from '../lib/api';

/** Plan 043 slice 2: one wave-roster mutation dialog shared by the hub and
 *  the prospects list, so both surfaces ask for the wave the same way and
 *  render the store's typed refusals from one copy table. The server
 *  records the actor as the console itself (the same rule as review
 *  decisions); the operator names the wave, defaulting to wave-1. */
export function WaveDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'add' | 'remove';
  /** The candidate the mutation targets. */
  candidateId: string | null;
  /** The hotel's display name, for the confirm text. */
  hotelName: string | null;
  /** Called with the wave name; the caller performs the request, shows
   *  the toast, and refreshes. The dialog closes when the promise lands. */
  onSubmit: (candidateId: string, wave: string) => Promise<void>;
}): JSX.Element {
  const { open, onOpenChange, mode, candidateId, hotelName, onSubmit } = props;
  const { strings } = useI18n();
  const copy = strings.hub.wave;

  const [wave, setWave] = useState('wave-1');
  const [isBusy, setIsBusy] = useState(false);

  // Reopening starts from the default wave: the field is a confirmation of
  // intent, not a persisted preference.
  useEffect(() => {
    if (open) setWave('wave-1');
  }, [open]);

  const submit = async (): Promise<void> => {
    const trimmed = wave.trim();
    if (trimmed === '' || candidateId === null || isBusy) return;
    setIsBusy(true);
    try {
      await onSubmit(candidateId, trimmed);
      onOpenChange(false);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{mode === 'add' ? copy.dialogTitleAdd : copy.dialogTitleRemove}</DialogTitle>
        <DialogDescription>
          {hotelName === null ? null : (
            <span className="block font-medium text-ink">{hotelName}</span>
          )}
          {mode === 'add' ? copy.dialogBodyAdd : copy.dialogBodyRemove}
        </DialogDescription>
        <label className="mt-4 flex flex-col gap-1 text-sm text-ink-soft">
          {copy.waveLabel}
          <Input
            value={wave}
            onChange={(event) => {
              setWave(event.target.value);
            }}
            maxLength={60}
            className="max-w-48"
          />
        </label>
        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            {strings.common.cancel}
          </Button>
          <Button
            variant={mode === 'add' ? 'primary' : 'danger'}
            size="sm"
            isLoading={isBusy}
            disabled={isBusy || wave.trim() === ''}
            onClick={() => {
              void submit();
            }}
          >
            {mode === 'add' ? copy.confirmAdd : copy.confirmRemove}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The typed refusals both roster mutations can answer, as one operator
 *  sentence per code. Codes are stable API strings; unknown codes fall
 *  back to the caller's generic action-error sentence. */
export function waveRefusalSentence(
  refusal: string,
  strings: ReturnType<typeof useI18n>['strings'],
): string | undefined {
  return strings.hub.wave.refusals[refusal as keyof typeof strings.hub.wave.refusals];
}

/** One POST to the wave roster, shared by every caller. Returns the typed
 *  refusal when the store refused, so the caller picks its own fallback. */
export async function mutateWaveRoster(
  candidateId: string,
  wave: string,
  mode: 'add' | 'remove',
): Promise<string | undefined> {
  const path = `/api/prospects/${encodeURIComponent(candidateId)}/wave${mode === 'remove' ? '/remove' : ''}`;
  const body = { wave };
  const result =
    mode === 'add'
      ? await sendJson<{ added: boolean; refusal?: string }>(path, 'POST', body)
      : await sendJson<{ revoked: boolean; refusal?: string }>(path, 'POST', body);
  const refused =
    mode === 'add'
      ? (result as { added: boolean; refusal?: string }).added === false
      : (result as { revoked: boolean; refusal?: string }).revoked === false;
  if (refused) return (result as { refusal?: string }).refusal ?? 'unknown';
  return undefined;
}
