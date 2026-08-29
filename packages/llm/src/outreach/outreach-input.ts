import type {
  HotelPrescanPageRole,
  ReportLanguage,
  SelectedOutreachEvidence,
} from '@odysseus/core';

/** Exactly what the model is shown about one selected evidence item, and
 *  nothing else. No factRef, no severity, no wcagCriteria, no sha256, no
 *  image bytes, no domain, no URL - deliberately: severity would invite the
 *  paid report's severity vocabulary into a cold email, and a WCAG criterion
 *  is a number the number guard would then have to allowlist. */
export interface OutreachEvidenceForModel {
  alias: 'e1' | 'e2';
  /** The fixed sentence from HOTEL_EVIDENCE_OBSERVATIONS, target language
   *  only - the model never sees both languages of an observation. */
  observation: string;
  pageRole: HotelPrescanPageRole;
}

/** What the model sees for one outreach touch. Touch 3 carries no evidence
 *  at all: its content is the deterministic facts block, spliced in by the
 *  assembler after generation, never described to the model. */
export interface OutreachProseInput {
  language: ReportLanguage;
  touch: 1 | 2 | 3;
  businessName: string;
  evidence?: OutreachEvidenceForModel;
  ageFramingPermitted: boolean;
}

function observationText(selected: SelectedOutreachEvidence, language: ReportLanguage): string {
  return selected.observation[language];
}

export function buildOutreachProseInput(options: {
  language: ReportLanguage;
  touch: 1 | 2 | 3;
  businessName: string;
  selected: SelectedOutreachEvidence | undefined;
  ageFramingPermitted: boolean;
}): OutreachProseInput {
  const evidence: OutreachEvidenceForModel | undefined =
    options.touch === 3 || options.selected === undefined
      ? undefined
      : {
          alias: options.selected.alias,
          observation: observationText(options.selected, options.language),
          pageRole: options.selected.pageRole,
        };

  return {
    language: options.language,
    touch: options.touch,
    businessName: options.businessName,
    ...(evidence !== undefined ? { evidence } : {}),
    ageFramingPermitted: options.ageFramingPermitted,
  };
}
