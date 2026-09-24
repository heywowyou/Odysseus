import { describe, expect, it } from 'vitest';
import {
  MOBILE_SURFACE_IDENTITY_REFUSED,
  MOBILE_UA_NEGOTIATION_LIMITATION,
} from '@odysseus/scanner';
import { currentLimitationWording } from './limitation-wording.js';

/** Stored verbatim in audits scanned before the wording change. */
const LEGACY_FR = {
  mobileUa:
    "L'analyse mobile conserve l'identité de notre robot d'analyse : seules la fenêtre d'affichage et les capacités tactiles changent. Les variantes du site servies uniquement à un navigateur mobile identifié par son user-agent ne sont pas testées.",
  identityRefused:
    "La surface mobile a été refusée pour cette page : elle exige l'identité publiée de notre robot et une autre identité était configurée.",
  robots:
    "3 pages du site n'ont pas été analysées, car son fichier robots.txt en interdit l'accès à notre robot d'analyse.",
  hydration:
    "Le contenu d'une page continuait de s'afficher pendant le défilement de notre robot : la page n'a été analysée que jusqu'à la limite de ce balayage.",
};

const LEGACY_EN = {
  mobileUa:
    'The mobile analysis keeps our published crawler identity: only the viewport and touch capabilities change. Variants of the site served only to a mobile browser identified by its user agent are not tested.',
  identityRefused:
    "One page's mobile surface was refused: it requires our published crawler identity and a different identity was configured.",
};

describe('currentLimitationWording', () => {
  it('turns legacy stored sentences into the wording the scanner writes today', () => {
    expect(currentLimitationWording(LEGACY_FR.mobileUa)).toBe(MOBILE_UA_NEGOTIATION_LIMITATION.fr);
    expect(currentLimitationWording(LEGACY_FR.identityRefused)).toBe(
      MOBILE_SURFACE_IDENTITY_REFUSED.fr,
    );
    expect(currentLimitationWording(LEGACY_EN.mobileUa)).toBe(MOBILE_UA_NEGOTIATION_LIMITATION.en);
    expect(currentLimitationWording(LEGACY_EN.identityRefused)).toBe(
      MOBILE_SURFACE_IDENTITY_REFUSED.en,
    );
    expect(currentLimitationWording(LEGACY_FR.robots)).toBe(
      "3 pages du site n'ont pas été analysées, car son fichier robots.txt en interdit l'accès à notre outil d'analyse.",
    );
    expect(currentLimitationWording(LEGACY_FR.hydration)).toBe(
      "Le contenu d'une page continuait de s'afficher pendant le défilement effectué par notre outil d'analyse : la page n'a été analysée que jusqu'à la limite de ce balayage.",
    );
  });

  it('leaves no legacy crawler vocabulary in French', () => {
    for (const sentence of Object.values(LEGACY_FR)) {
      expect(currentLimitationWording(sentence)).not.toMatch(/notre robot/iu);
    }
  });

  it('leaves current wording unchanged', () => {
    expect(currentLimitationWording(MOBILE_UA_NEGOTIATION_LIMITATION.fr)).toBe(
      MOBILE_UA_NEGOTIATION_LIMITATION.fr,
    );
  });
});
