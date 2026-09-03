import { useState } from 'react';
import type { JSX, FormEvent } from 'react';
import { ShieldCheck } from 'lucide-react';
import { PAGE_WIDTH, PageHeader } from '../components/page-header';
import { Badge } from '../components/ui/badge';
import { Button, buttonStyles } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { useI18n } from '../i18n/provider';
import { sendJson } from '../lib/api';
import type { SuppressionCheckResult } from './outreach-model';

/** The lookup keeps only what the banner needs: whether the entered value
 *  matched. The address itself is cleared with the form, and no hash ever
 *  comes back (the API answers a boolean and nothing else). */
export function SuppressionsPage(): JSX.Element {
  const { strings } = useI18n();
  const [address, setAddress] = useState('');
  const [result, setResult] = useState<SuppressionCheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);

  const check = async (): Promise<void> => {
    const trimmed = address.trim();
    if (trimmed === '') return;
    setIsChecking(true);
    setCheckFailed(false);
    try {
      setResult(
        await sendJson<SuppressionCheckResult>('/api/outreach/suppression-check', 'POST', {
          address: trimmed,
        }),
      );
    } catch {
      setResult(null);
      setCheckFailed(true);
    } finally {
      setIsChecking(false);
    }
  };

  const clear = (): void => {
    setAddress('');
    setResult(null);
    setCheckFailed(false);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void check();
  };

  return (
    <article className={PAGE_WIDTH.reading}>
      <PageHeader
        title={strings.suppressions.title}
        description={strings.suppressions.description}
      />

      <Card className="mb-4">
        <form onSubmit={onSubmit}>
          <label htmlFor="suppression-address" className="block text-sm font-medium text-ink">
            {strings.suppressions.addressLabel}
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Input
              id="suppression-address"
              type="email"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder={strings.suppressions.addressPlaceholder}
              autoComplete="off"
              className="min-w-64 flex-1"
            />
            <button type="submit" className={buttonStyles('primary')} disabled={isChecking}>
              {strings.suppressions.checkButton}
            </button>
            <Button variant="ghost" onClick={clear} disabled={isChecking}>
              {strings.suppressions.clearButton}
            </Button>
          </div>
          <p className="mt-3 text-xs text-ink-muted">{strings.suppressions.hashNote}</p>
        </form>
      </Card>

      {checkFailed ? (
        <p className="mb-3 text-sm text-danger" role="alert">
          {strings.operator.actionError}
        </p>
      ) : null}
      {result !== null ? (
        <div
          className="flex items-center gap-3 rounded-xl border border-line-strong bg-panel px-5 py-4"
          role="status"
        >
          <ShieldCheck
            className={result.suppressed ? 'size-5 text-danger' : 'size-5 text-ink-muted'}
            aria-hidden="true"
          />
          <Badge tone={result.suppressed ? 'critical' : 'neutral'}>
            {result.suppressed
              ? strings.suppressions.resultSuppressed
              : strings.suppressions.resultNotSuppressed}
          </Badge>
        </div>
      ) : null}
    </article>
  );
}
