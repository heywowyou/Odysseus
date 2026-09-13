import type { CSSProperties, ReactNode } from 'react';
import { ReplayButton } from './exhibit';
import type { SiteLanguage } from './language';

/**
 * The three check schematics on the home page. Each is a schematic of what
 * the check measures, never a real result. Motion reveals the finished state
 * but never carries meaning on its own.
 */
function delay(seconds: number): CSSProperties {
  return { '--d': `${seconds}s` } as CSSProperties;
}

const CAPTION = {
  fr: 'Illustration du fonctionnement\u00a0: données fictives.',
  en: 'Illustration only: fictional data.',
} as const;

const REPLAY = {
  fr: "Rejouer l'animation",
  en: 'Replay the animation',
} as const;

function SchematicFigure({
  lang,
  className,
  children,
}: {
  lang: SiteLanguage;
  className: string;
  children: ReactNode;
}) {
  return (
    <figure className={`exhibit-figure ${className}`}>
      {children}
      <figcaption className="schematic-foot">
        <span>{CAPTION[lang]}</span>
        <ReplayButton label={REPLAY[lang]} />
      </figcaption>
    </figure>
  );
}

/* ---- Search and rendering --------------------------------------------- */

const RAW_LINES = {
  fr: [
    '<!doctype html>',
    '<html lang="fr">',
    '  <body>',
    '    <div id="root"></div>',
    '    <script src="/app.js"></script>',
    '  </body>',
    '</html>',
  ],
  en: [
    '<!doctype html>',
    '<html lang="en">',
    '  <body>',
    '    <div id="root"></div>',
    '    <script src="/app.js"></script>',
    '  </body>',
    '</html>',
  ],
} as const;

const RENDER_COPY = {
  fr: {
    crawler: 'HTML initial envoyé par le serveur',
    crawlerTag: 'Avant JavaScript',
    crawlerVerdict: 'Ni titre, ni texte, ni lien dans cet extrait.',
    visitor: 'Page après exécution du JavaScript',
    visitorTag: 'Navigateur',
    running: 'Exécution du JavaScript',
    title: 'Titre de la page',
    text: 'Texte de présentation',
    button: 'Bouton de contact',
    visitorVerdict:
      "Ce contenu est absent du HTML initial et n'apparaît qu'après l'exécution du JavaScript.",
  },
  en: {
    crawler: 'Initial HTML sent by the server',
    crawlerTag: 'Before JavaScript',
    crawlerVerdict: 'No title, text or link in this excerpt.',
    visitor: 'Page after JavaScript runs',
    visitorTag: 'Browser',
    running: 'Running JavaScript',
    title: 'Page title',
    text: 'Introductory text',
    button: 'Contact button',
    visitorVerdict:
      'This content is absent from the initial HTML and only appears after JavaScript has run.',
  },
} as const;

export function RenderSchematic({ lang }: { lang: SiteLanguage }) {
  const t = RENDER_COPY[lang];
  const lines = RAW_LINES[lang];
  return (
    <SchematicFigure lang={lang} className="schematic-render">
      <div className="bands">
        <div className="band band-machine">
          <div className="band-head">
            <p className="figure-label">{t.crawler}</p>
            <p className="band-tag">{t.crawlerTag}</p>
          </div>
          <div className="band-body">
            <pre className="band-code" aria-hidden="true">
              <code>
                {lines.map((line, index) => (
                  <span
                    key={index}
                    className="code-line fx-clip"
                    style={delay(0.15 + index * 0.07)}
                  >
                    {line}
                  </span>
                ))}
              </code>
            </pre>
            <p className="band-verdict band-verdict-empty fx-clip" style={delay(0.75)}>
              {t.crawlerVerdict}
            </p>
          </div>
        </div>

        <div className="band band-visitor">
          <div className="band-head">
            <p className="figure-label">{t.visitor}</p>
            <p className="band-tag">{t.visitorTag}</p>
          </div>
          <div className="band-body">
            <div className="visitor-doc" aria-hidden="true">
              <div className="js-run">
                <span className="js-run-label">{t.running}</span>
                <span className="js-run-track">
                  <span className="js-run-fill fx-grow-x" style={delay(0.95)} />
                </span>
              </div>
              <div className="visitor-el">
                <p className="label">{t.title}</p>
                <div
                  className="visitor-bar visitor-bar-strong fx-rise"
                  style={{ ...delay(1.85), width: '78%' }}
                />
              </div>
              <div className="visitor-el">
                <p className="label">{t.text}</p>
                <div className="visitor-lines fx-rise" style={delay(2.05)}>
                  <div className="visitor-bar" />
                  <div className="visitor-bar" style={{ width: '94%' }} />
                  <div className="visitor-bar" style={{ width: '61%' }} />
                </div>
              </div>
              <div className="visitor-el">
                <p className="label">{t.button}</p>
                <div className="visitor-bar-button fx-rise" style={delay(2.25)} />
              </div>
            </div>
            <p className="band-verdict band-verdict-found fx-clip" style={delay(2.6)}>
              {t.visitorVerdict}
            </p>
          </div>
        </div>
      </div>
    </SchematicFigure>
  );
}

/* ---- Accessibility ------------------------------------------------------ */

const A11Y_COPY = {
  fr: {
    readout: 'Écarts relevés, élément par élément',
    gaps: [
      { title: 'Image sans texte alternatif', element: '<img>', criterion: 'WCAG 1.1.1' },
      { title: 'Texte trop peu contrasté', element: '<p>', criterion: 'WCAG 1.4.3' },
      { title: 'Champ de formulaire sans étiquette', element: '<input>', criterion: 'WCAG 4.1.2' },
    ],
  },
  en: {
    readout: 'Issues found, element by element',
    gaps: [
      { title: 'Image with no text alternative', element: '<img>', criterion: 'WCAG 1.1.1' },
      { title: 'Text with insufficient contrast', element: '<p>', criterion: 'WCAG 1.4.3' },
      { title: 'Form field with no label', element: '<input>', criterion: 'WCAG 4.1.2' },
    ],
  },
} as const;

const A11Y_HITS = [0.6, 1.35, 1.85] as const;

function Pin({ n, at }: { n: number; at: number }) {
  return (
    <span className="pin fx-pop" style={delay(at)}>
      {n}
    </span>
  );
}

export function AccessibilitySchematic({ lang }: { lang: SiteLanguage }) {
  const t = A11Y_COPY[lang];
  return (
    <SchematicFigure lang={lang} className="schematic-a11y">
      <div className="pairing">
        <div className="mock-page" aria-hidden="true">
          <span className="scan-line" />
          <div className="mock-nav">
            <span className="mock-logo" />
            <span className="mock-links" />
          </div>
          <div className="mock-el mock-image fx-flag" style={delay(A11Y_HITS[0])}>
            <svg
              viewBox="0 0 40 28"
              width="40"
              height="28"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            >
              <path d="M3 24l10-10 7 7 5-5 12 8" />
              <circle cx="29" cy="7" r="3" />
            </svg>
            <Pin n={1} at={A11Y_HITS[0]} />
          </div>
          <div className="mock-el mock-heading" />
          <div className="mock-el mock-text">
            <span />
            <span style={{ width: '88%' }} />
          </div>
          <div className="mock-el mock-text mock-faint fx-flag" style={delay(A11Y_HITS[1])}>
            <span />
            <span style={{ width: '70%' }} />
            <Pin n={2} at={A11Y_HITS[1]} />
          </div>
          <div className="mock-el mock-form fx-flag" style={delay(A11Y_HITS[2])}>
            <span className="mock-field" />
            <span className="mock-submit" />
            <Pin n={3} at={A11Y_HITS[2]} />
          </div>
        </div>

        <div className="readout">
          <p className="figure-label">{t.readout}</p>
          <ol className="readout-list">
            {t.gaps.map((gap, index) => (
              <li
                key={gap.criterion}
                className="readout-row fx-clip"
                style={delay(A11Y_HITS[index] + 0.1)}
              >
                <span className="pin pin-static" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="readout-text">
                  <span className="readout-title">{gap.title}</span>
                  <span className="readout-ref">
                    <span className="mono">{gap.element}</span>
                    <span aria-hidden="true"> · </span>
                    <span className="numeric">{gap.criterion}</span>
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </SchematicFigure>
  );
}

/* ---- AI visibility signals --------------------------------------------- */

type SignalState = 'present' | 'blocked' | 'absent';

const AI_COPY = {
  fr: {
    readout: 'Signaux vérifiés',
    missingFile: 'Fichier introuvable (404)',
    signals: [
      { title: 'Accès des robots IA', source: 'robots.txt', status: 'Refusé à GPTBot' },
      { title: 'Fichier llms.txt', source: '/llms.txt', status: 'Absent' },
      { title: 'Données structurées', source: 'JSON-LD', status: 'Déclarées' },
      { title: 'Balisage FAQ', source: 'FAQPage', status: 'Absent' },
    ],
  },
  en: {
    readout: 'Signals checked',
    missingFile: 'File not found (404)',
    signals: [
      { title: 'AI crawler access', source: 'robots.txt', status: 'Blocked for GPTBot' },
      { title: 'llms.txt file', source: '/llms.txt', status: 'Missing' },
      { title: 'Structured data', source: 'JSON-LD', status: 'Declared' },
      { title: 'FAQ markup', source: 'FAQPage', status: 'Missing' },
    ],
  },
} as const;

const SIGNAL_STATES: readonly SignalState[] = ['blocked', 'absent', 'present', 'absent'];
const AI_READS = [0.3, 1.0, 1.7] as const;
const AI_RESOLVES = [0.7, 1.4, 2.1, 2.45] as const;

function StatusIcon({ state }: { state: SignalState }) {
  const common = {
    'aria-hidden': true,
    viewBox: '0 0 16 16',
    width: 14,
    height: 14,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const;
  if (state === 'present') {
    return (
      <svg {...common}>
        <path d="M3.25 8.5l3 3 6.5-7" />
      </svg>
    );
  }
  if (state === 'blocked') {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="5.5" />
        <path d="M4.2 11.8l7.6-7.6" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="5.5" strokeDasharray="2.2 2" />
    </svg>
  );
}

export function AiSignalsSchematic({ lang }: { lang: SiteLanguage }) {
  const t = AI_COPY[lang];
  return (
    <SchematicFigure lang={lang} className="schematic-ai">
      <div className="pairing">
        <div className="files" aria-hidden="true">
          <div className="file">
            <p className="file-name">robots.txt</p>
            <code className="file-code">
              <span className="file-line">User-agent: GPTBot</span>
              <span className="file-line file-hit fx-mark" style={delay(AI_READS[0])}>
                Disallow: /
              </span>
            </code>
          </div>
          <div className="file">
            <p className="file-name">llms.txt</p>
            <code className="file-code">
              <span className="file-line file-missing fx-mark" style={delay(AI_READS[1])}>
                {t.missingFile}
              </span>
            </code>
          </div>
          <div className="file">
            <p className="file-name">&lt;head&gt;</p>
            <code className="file-code">
              <span className="file-line">{'<script type="application/ld+json">'}</span>
              <span className="file-line file-hit fx-mark" style={delay(AI_READS[2])}>
                {'  {"@type": "Organization"}'}
              </span>
              <span className="file-line">{'</script>'}</span>
            </code>
          </div>
        </div>

        <div className="readout">
          <p className="figure-label">{t.readout}</p>
          <ul className="readout-list">
            {t.signals.map((signal, index) => {
              const state = SIGNAL_STATES[index] ?? 'absent';
              return (
                <li key={signal.source} className="readout-row signal-row">
                  <span className="readout-text">
                    <span className="readout-title">{signal.title}</span>
                    <span className="readout-ref mono">{signal.source}</span>
                  </span>
                  <span
                    className={`status status-${state} fx-pop`}
                    style={delay(AI_RESOLVES[index] ?? 0)}
                  >
                    <StatusIcon state={state} />
                    {signal.status}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </SchematicFigure>
  );
}
