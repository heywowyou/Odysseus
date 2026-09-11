import type { SiteLanguage } from './language';

/**
 * The signature card: the shape of one finding in the report. One component
 * for every page that shows it, because two hand-kept copies had already
 * drifted apart (home said Constat, Preuve, Action; the offer page said
 * Repérage, Preuve, Priorité et action). It carries format text only, never
 * a result: no figure, no real site, no invented finding.
 *
 * Each row carries a coloured rule in reading order, red for the problem,
 * yellow for the evidence, green for the action. The colours mark the three
 * parts of one finding, not a severity scale; the labels carry the meaning.
 */
const COPY = {
  fr: {
    title: 'Ce que contient chaque constat',
    stamp: 'Rapport Odysseus',
    rows: [
      {
        kind: 'finding',
        term: 'Constat',
        detail: 'Le problème relevé, énoncé en une phrase claire, sans jargon.',
      },
      {
        kind: 'evidence',
        term: 'Preuve',
        detail:
          "La page et l'élément concernés, avec la mesure ou la capture d'écran qui l'établit.",
      },
      {
        kind: 'action',
        term: 'Action',
        detail: "La correction recommandée et son rang dans l'ordre des priorités.",
      },
    ],
    caption:
      "Illustration du format du rapport\u00a0: elle ne représente ni un site réel, ni un constat réel, ni le résultat d'un audit.",
  },
  en: {
    title: 'What every finding contains',
    stamp: 'Odysseus report',
    rows: [
      {
        kind: 'finding',
        term: 'Finding',
        detail: 'The problem detected, stated in one clear sentence, without jargon.',
      },
      {
        kind: 'evidence',
        term: 'Evidence',
        detail:
          'The page and the element concerned, with the measurement or screenshot that establishes it.',
      },
      {
        kind: 'action',
        term: 'Action',
        detail: 'The recommended correction and its place in the order of priorities.',
      },
    ],
    caption:
      'An illustration of the report format: it represents neither a real site, nor a real finding, nor an audit result.',
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
