import { useI18n } from '../i18n/provider';
import type { DashboardLanguage } from '../i18n/types';
import { cn } from '../lib/cn';

const LANGUAGES: { value: DashboardLanguage; label: string }[] = [
  { value: 'fr', label: 'FR' },
  { value: 'en', label: 'EN' },
];

export function LanguageSwitcher() {
  const { language, setLanguage, strings } = useI18n();
  return (
    <div
      role="group"
      aria-label={strings.shell.language}
      className="inline-flex items-center gap-1 rounded-lg bg-raised p-1"
    >
      {LANGUAGES.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => setLanguage(value)}
          aria-pressed={language === value}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-semibold transition-colors',
            language === value ? 'bg-accent-tint text-ink' : 'text-ink-muted hover:text-ink-soft',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
