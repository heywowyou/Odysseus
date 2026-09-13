import { OUTREACH_PROOF_CARD_COPY, type OutreachProofCardCopyEntry } from './proof-card-copy.js';

/**
 * Plan 046: French prospect-facing rewrites for proof cards whose approved
 * source wording still exposes implementation concepts. Entries not listed
 * here are already plain enough for a non-technical reader and fall through to
 * the reviewed source table unchanged.
 *
 * These sentences remain observations only: one sentence, present tense, no
 * fix, no legal conclusion, no unsupported impact claim, no statistic.
 */
const FR_VISITOR_COPY: Readonly<Record<string, string>> = {
  'area-alt':
    "Certaines zones cliquables d'une image ne sont pas décrites de façon exploitable par un lecteur d'écran.",
  'aria-allowed-attr':
    "Certains éléments transmettent aux technologies d'assistance des informations incompatibles avec leur fonction.",
  'aria-braille-equivalent':
    "Une information destinée aux afficheurs braille n'a pas d'équivalent utilisable en texte.",
  'aria-command-name':
    "Certains boutons ou liens n'ont pas d'intitulé utilisable par un lecteur d'écran.",
  'aria-conditional-attr':
    "Certains éléments transmettent une information d'accessibilité qui ne correspond pas à leur usage.",
  'aria-deprecated-role':
    "Certains éléments utilisent une manière obsolète d'indiquer leur fonction aux technologies d'assistance.",
  'aria-hidden-body': "La page entière est masquée aux visiteurs qui utilisent un lecteur d'écran.",
  'aria-hidden-focus': "Un élément invisible à l'écran reste pourtant atteignable au clavier.",
  'aria-input-field-name':
    "Certains champs n'ont pas de libellé utilisable par un lecteur d'écran.",
  'aria-meter-name':
    "Un indicateur de mesure n'a pas d'intitulé utilisable par un lecteur d'écran.",
  'aria-progressbar-name':
    "Une barre de progression n'a pas d'intitulé utilisable par un lecteur d'écran.",
  'aria-prohibited-attr':
    "Certains éléments transmettent aux technologies d'assistance une information qui ne devrait pas leur être associée.",
  'aria-required-attr':
    "Un composant interactif ne fournit pas toutes les informations nécessaires aux technologies d'assistance.",
  'aria-required-children':
    "Un menu ou une liste n'est pas structuré de façon à être interprété correctement par les technologies d'assistance.",
  'aria-required-parent':
    'Un élément interactif se trouve hors de la structure attendue pour être interprété correctement.',
  'aria-roledescription':
    "Certains éléments décrivent leur fonction aux technologies d'assistance de manière incohérente.",
  'aria-roles':
    "Certains éléments déclarent aux technologies d'assistance une fonction qui n'est pas reconnue.",
  'aria-tab-name': "Certains onglets n'ont pas d'intitulé utilisable par un lecteur d'écran.",
  'aria-toggle-field-name':
    "Certains contrôles à deux états n'ont pas d'intitulé utilisable par un lecteur d'écran.",
  'aria-tooltip-name':
    "Certaines infobulles ne transmettent pas leur contenu aux technologies d'assistance.",
  'aria-valid-attr':
    "Certains éléments transmettent aux technologies d'assistance une information qui n'est pas reconnue.",
  'aria-valid-attr-value':
    "Certains éléments transmettent aux technologies d'assistance une valeur qui n'est pas reconnue.",
  'button-name': "Certains boutons n'ont pas d'intitulé utilisable par un lecteur d'écran.",
  'definition-list':
    "Certaines listes de définitions sont structurées d'une manière qui peut être mal interprétée par les technologies d'assistance.",
  dlitem:
    "Certains termes ou définitions se trouvent hors de la liste qui permet d'en comprendre la relation.",
  'duplicate-id-aria':
    'Certaines étiquettes peuvent pointer vers le mauvais élément parce que plusieurs éléments partagent le même identifiant.',
  'form-field-multiple-labels':
    'Certains champs présentent plusieurs intitulés différents, ce qui peut rendre leur fonction ambiguë.',
  'frame-focusable-content':
    'Un contenu intégré contient des éléments interactifs qui ne suivent pas correctement le parcours au clavier.',
  'frame-title':
    "Certains contenus intégrés, comme une carte ou un module de réservation, n'ont pas d'intitulé permettant de les identifier clairement.",
  'frame-title-unique':
    'Plusieurs contenus intégrés portent le même intitulé et ne peuvent pas être distingués clairement.',
  'image-alt':
    "Certaines images porteuses d'information ne sont pas décrites aux visiteurs qui ne peuvent pas les voir.",
  'input-button-name':
    "Certains boutons de formulaire n'ont pas d'intitulé utilisable par un lecteur d'écran.",
  'input-image-alt':
    'Certains boutons représentés par une image ne sont pas décrits aux visiteurs qui ne peuvent pas les voir.',
  label: "Certains champs de formulaire n'ont pas de libellé utilisable par un lecteur d'écran.",
  'label-content-name-mismatch':
    "Certains contrôles sont annoncés différemment de leur texte visible aux visiteurs qui utilisent un lecteur d'écran.",
  'link-name': "Certains liens n'ont pas d'intitulé utilisable par un lecteur d'écran.",
  list: "Certaines listes sont structurées d'une manière qui peut être mal interprétée par les technologies d'assistance.",
  listitem:
    'Certaines entrées de liste se trouvent hors de la structure qui permet de les interpréter correctement.',
  'nested-interactive':
    'Certains contrôles cliquables sont imbriqués les uns dans les autres, ce qui rend leur utilisation ambiguë.',
  'object-alt':
    'Certains contenus intégrés ne sont pas décrits aux visiteurs qui ne peuvent pas les voir.',
  'p-as-heading':
    "Certains textes qui ressemblent visuellement à des titres ne sont pas structurés comme tels pour les lecteurs d'écran.",
  'role-img-alt':
    'Certains éléments présentés comme des images ne sont pas décrits aux visiteurs qui ne peuvent pas les voir.',
  'scrollable-region-focusable':
    "Certaines zones que l'on peut faire défiler ne sont pas accessibles aux visiteurs qui naviguent uniquement au clavier.",
  'select-name':
    "Certaines listes déroulantes n'ont pas d'intitulé utilisable par un lecteur d'écran.",
  'svg-img-alt':
    'Certaines images vectorielles ne sont pas décrites aux visiteurs qui ne peuvent pas les voir.',
  'table-fake-caption':
    "Certains tableaux n'exposent pas correctement leur titre aux lecteurs d'écran.",
  'td-has-header':
    "Certaines cellules de tableau ne peuvent pas être reliées clairement à leur en-tête par un lecteur d'écran.",
  'td-headers-attr': "Certaines cellules de tableau renvoient vers un en-tête qui n'existe pas.",
  'th-has-data-cells':
    "Certains en-têtes de tableau ne sont reliés à aucune donnée qu'ils sont censés décrire.",
  'structured-data':
    'Certaines informations destinées aux moteurs de recherche ne peuvent pas être validées avec certitude.',
  'entity-data-incomplete':
    'Les informations qui décrivent votre établissement aux moteurs de recherche sont incomplètes.',
  'jsonld-invalid':
    'Certaines informations destinées aux moteurs de recherche contiennent une erreur qui empêche leur lecture correcte.',
  'jsonld-missing':
    'Certaines pages ne fournissent pas aux moteurs de recherche les informations structurées qui décrivent leur contenu.',
  'structured-data-entity-missing':
    "Le site ne fournit pas aux moteurs de recherche d'informations structurées identifiant clairement l'établissement.",
  'structured-data-invalid':
    'Certaines informations structurées destinées aux moteurs de recherche sont incomplètes.',
  'ai-crawler-blocked':
    "Le site bloque l'accès d'au moins un service utilisé par des assistants IA pour explorer le web.",
};

export function outreachProofCardCopy(ruleId: string): OutreachProofCardCopyEntry | undefined {
  const source = OUTREACH_PROOF_CARD_COPY[ruleId];
  if (source === undefined) return undefined;
  const fr = FR_VISITOR_COPY[ruleId];
  return fr === undefined ? source : { ...source, fr };
}

/** Public client-facing table used by interface callers. The raw reviewed table
 * remains available inside this package for coverage/safety tests, while every
 * exported entry resolves the Plan 046 French wording before it reaches a
 * prospect. */
export const OUTREACH_PROOF_CARD_CLIENT_COPY: Readonly<Record<string, OutreachProofCardCopyEntry>> =
  Object.freeze(
    Object.fromEntries(
      Object.keys(OUTREACH_PROOF_CARD_COPY).map((ruleId) => [
        ruleId,
        outreachProofCardCopy(ruleId) as OutreachProofCardCopyEntry,
      ]),
    ),
  );
