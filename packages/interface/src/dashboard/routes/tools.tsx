import type { JSX } from 'react';
import { ExternalLink } from 'lucide-react';
import { PAGE_WIDTH, PageHeader } from '../components/page-header';
import { Card } from '../components/ui/card';
import { useI18n } from '../i18n/provider';
import { StorageStatusCard } from './storage-status-card';

/** Operator-maintained links to standalone claude.ai artifacts kept outside
 *  the dashboard (plan 040 slice 8). Each covers a job that is either
 *  one-off infrastructure, project bookkeeping, or dev/QA tooling, so none
 *  of them earned a dashboard feature of their own; they still need one
 *  click of access from the tool the operator lives in day to day. Content
 *  and labels are operator-approved copy, not fetched: the artifacts sit
 *  behind a private claude.ai share link the dashboard has no way to read. */
const TOOL_LINKS: ReadonlyArray<{
  url: string;
  label: { fr: string; en: string };
  description: { fr: string; en: string };
}> = [
  {
    url: 'https://claude.ai/code/artifact/75aaf0ad-0e1a-4178-85f9-ca0fa70b51c0',
    label: { fr: 'Déploiement des 100 premiers', en: 'First-100 rollout' },
    description: {
      fr: 'Suivi des vagues et des portes de lancement de la campagne pilote.',
      en: 'Wave and launch-gate tracker for the pilot campaign.',
    },
  },
  {
    url: 'https://claude.ai/code/artifact/f647f63c-c4cf-4a4c-8d0a-651c09bc0473',
    label: { fr: 'Chronologie de chauffe du domaine', en: 'Domain warm-up timeline' },
    description: {
      fr: "Étapes SPF/DKIM/DMARC et montée en volume de la boîte d'envoi.",
      en: 'SPF/DKIM/DMARC steps and the sending-volume ramp.',
    },
  },
  {
    url: 'https://claude.ai/code/artifact/6e911287-69be-4a6b-bd4b-56d1be1f4dc8',
    label: { fr: "Kit d'e-mails de chauffe", en: 'Warm-up email kit' },
    description: {
      fr: 'Les trois e-mails approuvés, remplis avec un hôtel fictif, à coller dans Gmail.',
      en: 'The three approved emails, filled with a fictional hotel, to paste into Gmail.',
    },
  },
  {
    url: 'https://claude.ai/code/artifact/6fb93cee-c929-4c1f-9830-67764ffea852',
    label: { fr: 'Feuille de route Odysseus', en: 'Odysseus roadmap' },
    description: {
      fr: 'Avancement des plans, jalons et problèmes ouverts du projet.',
      en: 'Plan, milestone, and open-issue progress for the project.',
    },
  },
  {
    url: 'https://claude.ai/code/artifact/336eb25d-7067-4403-87bb-d75ec2a42e2f',
    label: { fr: 'Livraison des audits payants', en: 'Paid audit delivery' },
    description: {
      fr: 'Suivi des étapes de livraison hôtel par hôtel.',
      en: 'Per-hotel delivery-phase tracker.',
    },
  },
  {
    url: 'https://claude.ai/code/artifact/b823775b-40f3-4d2b-8ec5-fba2c974aa0e',
    label: { fr: 'Répétitions de rapport', en: 'Report rehearsals' },
    description: {
      fr: 'Défauts relevés lors des relectures de rapports réels, avec dépôt vers GitHub.',
      en: 'Defects found rehearsing real reports, with GitHub issue filing.',
    },
  },
];

export function ToolsPage(): JSX.Element {
  const { strings, language } = useI18n();

  return (
    <article className={PAGE_WIDTH.reading}>
      <PageHeader title={strings.tools.title} description={strings.tools.description} />

      <Card>
        <ul className="flex flex-col divide-y divide-line">
          {TOOL_LINKS.map((tool) => (
            <li key={tool.url} className="py-3 first:pt-0 last:pb-0">
              <a
                href={tool.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 rounded-lg px-2 py-1 -mx-2 text-ink transition-colors hover:bg-raised"
              >
                <ExternalLink
                  className="mt-0.5 size-4 shrink-0 text-ink-muted"
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{tool.label[language]}</span>
                  <span className="block text-xs text-ink-muted">{tool.description[language]}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </Card>

      <div className="mt-6">
        <StorageStatusCard />
      </div>
    </article>
  );
}
