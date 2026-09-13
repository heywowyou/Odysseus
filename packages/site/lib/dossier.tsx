import type { SiteLanguage } from './language';

/**
 * The signature card: the shape of one finding in the report. It carries
 * format text only, never a real result, score or metric.
 */
const COPY = {
  fr: {
    title: 'Ce que contient chaque constat',
    stamp: 'Rapport Odysseus',
    rows: [
      {
        kind: 'finding',
        term: 'Constat',
        detail: 'Le problème relevé, formulé en une phrase claire.',
      },
      {
        kind: 'evidence',
        term: 'Preuve',
        detail:
          "La page et l'élément concernés, avec la mesure ou la capture d'écran qui permet de vérifier le constat.",
      },
      {
        kind: 'action',
        term: 'Action',
        detail: 'La correction recommandée et son niveau de priorité.',
      },
    ],
    caption: 'Exemple de présentation uniquement\u00a0: ces données ne proviennent pas d’un diagnostic réel.',
  },
  en: {
    title: 'What every finding contains',
    stamp: 'Odysseus report',
    rows: [
      {
        kind: 'finding',
        term: 'Finding',
        detail: 'The issue detected, stated in one clear sentence.',
      },
      {
        kind: 'evidence',
        term: 'Evidence',
        detail:
          'The affected page and element, with the measurement or screenshot needed to verify the finding.',
      },
      {
        kind: 'action',
        term: 'Action',
        detail: 'The recommended fix and its priority level.',
      },
    ],
    caption: 'Example format only: this content does not come from a real diagnostic.',
  },
} as const;

export function Dossier({ lang }: { lang: SiteLanguage }) {
  const t = COPY[lang];
  return (
    <aside className="split-aside" aria-label={t.title}>
      <div className="dossier">
        <div className="dossier-head">
          <p className="dossier-title">{t.title}</p>
          <p className="dossier-stamp">{t.stamp}</p>
        </div>
        <dl>
          {t.rows.map((row) => (
            <div key={row.kind} className={`dossier-row dossier-row-${row.kind}`}>
              <dt>{row.term}</dt>
              <dd>{row.detail}</dd>
            </div>
          ))}
        </dl>
        <p className="dossier-caption">{t.caption}</p>
      </div>
    </aside>
  );
}
