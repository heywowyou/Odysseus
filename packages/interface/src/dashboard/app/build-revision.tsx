import type { JSX } from 'react';
import { CopyButton } from '../components/ui/copy-button';
import { useI18n } from '../i18n/provider';
import { useApi } from '../lib/use-api';

interface DeployMetadata {
  revision: string;
  builtAt: string | null;
  environment: string;
}

/** Answers "which build handled this?" from the dashboard itself, no
 *  devtools required (issue: expose build/revision metadata). Silent on
 *  error or before the first response: a missing footer line is a better
 *  failure than a broken one on every page load. */
export function BuildRevision(): JSX.Element | null {
  const { strings } = useI18n();
  const { data } = useApi<DeployMetadata>('/api/meta');
  if (!data) return null;

  return (
    <div className="flex items-center justify-between gap-2 px-3 pt-2 text-xs text-ink-muted">
      <span className="truncate" title={data.builtAt ?? undefined}>
        {strings.shell.buildRevisionLabel} {data.revision}
      </span>
      <CopyButton
        text={data.revision}
        label={strings.shell.copyBuildRevision}
        copiedLabel={strings.shell.buildRevisionCopied}
      />
    </div>
  );
}
