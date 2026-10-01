/**
 * The legal half of a cold outreach preview, built in code and never written
 * by a model.
 *
 * This is the same discipline trade-off 11 established for the paid report:
 * where a sentence could be read as a legal position, we withhold the pen
 * rather than instruct a model to be careful. The preview is a colder document
 * than the report and `docs/rules/outreach-rules.md` is correspondingly stricter, so
 * this block is narrower than `legal-exposure.ts` rather than a copy of it.
 *
 * **What it may say.** The criterion, verbatim from `regimes.ts` - the one
 * place the regime's own wording lives, so a correction there reaches the
 * report and the preview together. The business's own published registry data,
 * where a lookup actually produced some. A recommendation to confirm scope with
 * a lawyer.
 *
 * **When it is left out.** When the assessment is `out_of_scope`: our own
 * registry facts place the business below the size thresholds, and a
 * regulatory section in a cold preview would then suggest an exposure the
 * evidence rules out (trade-off 127, revised 2026-10-01).
 *
 * **What it may never say.** That this business is bound. A deadline. A
 * sanction amount - `Regime.sanctionCeiling` exists and is deliberately never
 * read here. A population statistic. Case law, which
 * `docs/rules/outreach-rules.md` excludes from outreach independently of anything
 * this file decides.
 *
 * **Turnover is not rendered, on purpose.** Rule 6 permits stating a company's
 * own registry data, and the paid report does print turnover. In a cold email
 * a euro figure about the recipient's business reads as leverage rather than
 * evidence, and `containsProhibitedPreviewContent` rejects loose currency
 * amounts for exactly that reason. The headcount band carries the same
 * information for the criterion being described, so nothing is lost.
 *
 * The bytes this file produces are a downstream contract: plan 010's prose
 * validator splices against them, which is why its tests are exact-output
 * snapshots rather than shape assertions.
 */

import type { ObligationAssessment, ObligationBasis } from '../types/compliance.js';
import type { ReportLanguage } from '../types/llm-output.js';
import { EAA_REGIME_ID, getRegime } from './regimes.js';

/** What the source material currently supports saying to this kind of prospect.
 *
 *  Argument B is the obligation-criteria argument. `docs/rules/obligation-basis.md`
 *  now carries hotels at `secondary` and states the block may be used with them
 *  on the same terms as any other online shop, which is why this defaults on.
 *  It stays a capability rather than a hardcoded yes so that a sector whose
 *  source material has not been reviewed is one boolean away from a preview
 *  with no legal section at all. */
export interface OutreachSourceCapabilities {
  argumentB: boolean;
}

export type OutreachFactsBlock =
  { state: 'omitted' } | { state: 'rendered'; heading: string; paragraphs: string[] };

interface Copy {
  heading: string;
  /** Names the regime and reproduces its threshold, with no reference to the
   *  reader's own business. */
  criterion: (name: string, threshold: string, citation: string) => string;
  /** Introduces whatever public registry data a lookup actually returned. */
  registry: (denomination: string, band: string) => string;
  registryBandUnavailable: (denomination: string) => string;
  /** Used when no lookup ever produced anything. Says so plainly rather than
   *  leaving the reader to infer it from an absent paragraph, unless the
   *  caller asks for it to be left out (see `omitAbsentRegistry`). */
  registryAbsent: string;
  /** Present in every variant, in every language. The document must not be
   *  able to render its criteria without also saying who decides. */
  counsel: string;
}

const COPY: Record<ReportLanguage, Copy> = {
  fr: {
    heading: 'Cadre réglementaire à vérifier',
    criterion: (name, threshold, citation) => `${name}. ${threshold} Référence : ${citation}.`,
    registry: (denomination, band) =>
      `Les données publiques du registre pour ${denomination} indiquent un effectif de ${band}. ` +
      `Cette information est reprise telle qu'elle figure dans le registre public.`,
    registryBandUnavailable: (denomination) =>
      `Le registre public identifie ${denomination}, mais ne publie pas de tranche d'effectif ` +
      `exploitable pour cette analyse.`,
    registryAbsent:
      "Nous n'avons pas trouvé de donnée de registre publique suffisante pour rapprocher votre " +
      'entreprise de ces critères.',
    counsel:
      "L'applicabilité de ces critères dépend de la situation de l'entreprise. Faites confirmer " +
      'votre situation par votre conseil juridique.',
  },
  en: {
    heading: 'Regulatory framework to verify',
    criterion: (name, threshold, citation) => `${name}. ${threshold} Reference: ${citation}.`,
    registry: (denomination, band) =>
      `Public registry data for ${denomination} records a headcount band of ${band}. ` +
      `This information is reproduced as it appears in the public register.`,
    registryBandUnavailable: (denomination) =>
      `The public register identifies ${denomination}, but does not publish a usable headcount ` +
      `band for this analysis.`,
    registryAbsent:
      'We did not find enough public registry data to compare your organization with these criteria.',
    counsel:
      'Whether these criteria apply depends on the circumstances of the organization. Confirm ' +
      'your position with your legal adviser.',
  },
};

/** The regime the preview describes. `assessObligations` can attach an article
 *  47 basis as well, but that regime's threshold is a turnover in the hundreds
 *  of millions - it cannot describe a prospect this campaign contacts, and
 *  printing it would only invite the reader to dismiss the whole section. */
function primaryBasis(assessment: ObligationAssessment | undefined): ObligationBasis | undefined {
  return (
    assessment?.basis.find((basis) => basis.regimeId === EAA_REGIME_ID) ?? assessment?.basis[0]
  );
}

/**
 * Builds the block, deterministically, from a decision that was already taken
 * elsewhere. This function makes no scope determination of its own: it reads
 * `assessObligations`'s output for the registry facts it may quote, and never
 * for a verdict to state.
 */
export function buildOutreachFactsBlock(options: {
  assessment: ObligationAssessment | undefined;
  language: ReportLanguage;
  capabilities: OutreachSourceCapabilities;
  /** The last outreach email leaves the registry sentence out when there is
   *  no registry data: in a short email, "we found nothing" only weakens the
   *  criterion it follows. The public preview keeps saying so. */
  omitAbsentRegistry?: boolean;
}): OutreachFactsBlock {
  if (!options.capabilities.argumentB) return { state: 'omitted' };
  if (options.assessment?.status === 'out_of_scope') return { state: 'omitted' };

  const copy: Copy = COPY[options.language];
  const basis = primaryBasis(options.assessment);
  const regime = getRegime(basis?.regimeId ?? EAA_REGIME_ID, options.language);
  // Only reachable if the regime table lost an entry another module still
  // names. Omitting beats rendering a heading over nothing.
  if (!regime) return { state: 'omitted' };

  const snapshot = options.assessment?.registrySnapshot;
  const registryParagraphs =
    snapshot === undefined
      ? options.omitAbsentRegistry === true
        ? []
        : [copy.registryAbsent]
      : snapshot.effectifBandLabel === null
        ? [copy.registryBandUnavailable(snapshot.denomination)]
        : [copy.registry(snapshot.denomination, snapshot.effectifBandLabel)];

  return {
    state: 'rendered',
    heading: copy.heading,
    paragraphs: [
      copy.criterion(regime.name, regime.thresholdDescription, regime.legalCitation),
      ...registryParagraphs,
      copy.counsel,
    ],
  };
}
