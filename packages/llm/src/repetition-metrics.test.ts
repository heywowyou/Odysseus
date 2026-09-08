import { describe, expect, it } from 'vitest';
import {
  computeRepetitionMetrics,
  proseFieldsOf,
  type StoredAnalysisShape,
} from './repetition-metrics.js';

function analysisWithActions(actions: string[]): StoredAnalysisShape {
  return {
    executiveSummary: 'Une synthèse de ce rapport.',
    themes: [
      {
        title: 'Un premier thème',
        businessImpact: 'Un impact commercial réel.',
        recommendedActions: actions,
      },
    ],
  };
}

function metricsForActions(actions: string[], language: 'fr' | 'en' = 'fr') {
  return computeRepetitionMetrics(proseFieldsOf(analysisWithActions(actions)), language);
}

// issue #106: the word-level opening metric (first five words) was green on
// reports where every action shared one grammatical frame. These fixtures
// reproduce that exact blindness: distinct first words, identical frame.
describe('issue #106: the construction-level repetition metric', () => {
  it('flags a French report whose actions all open on subject + devoir while the word-level metric stays green', () => {
    const subjects = [
      'Les boutons sans texte discernable',
      'Les zones tactiles trop petites',
      'Les attributs ARIA inadaptés',
      "Le temps d'affichage des pages",
      'Les liens dont le texte est vague',
      "Les icônes porteuses d'information",
      'Les cadres intégrés au contenu',
      'Le lien interne cassé',
      'Les pages publiques du site',
      'Les images purement décoratives',
      "Les scripts qui bloquent l'affichage",
      'Les éléments de mise en page instables',
      "La page d'accueil du site",
      'Chaque page concernée',
      'Les versions traduites du site',
      'Les titres de même importance',
      'Les formulaires de contact',
      'Les menus de navigation',
    ];
    const actions = subjects.map(
      (subject, i) => `${subject} doivent être corrigés, variante numéro ${i} à traiter.`,
    );
    const metrics = metricsForActions(actions);

    // The blindness the issue describes: with every opening distinct the
    // word-level metric sits at its noise floor of 1 (one most-common
    // opening out of 18, the same "1/23" figure plan 029 measured on the
    // real templated reports), while the frame is uniform.
    expect(metrics.recommendedActionsSharingFirstFiveWords).toBe(1);
    // The construction-level count sees the frame.
    expect(metrics.recommendedActionsTotal).toBe(18);
    expect(metrics.recommendedActionsOpeningWithDevoirModal).toBe(18);
    expect(metrics.constructionRepetitionFlags).toHaveLength(1);
    expect(metrics.constructionRepetitionFlags[0]).toMatch(/subject \+ devoir/);
  });

  it('counts long subject phrases with relative clauses as part of the frame', () => {
    // Real stored subject: the devoir form only arrives at word 16.
    const metrics = metricsForActions([
      'Les titres qui ont été mis en avant visuellement sans respecter la structure du document doivent être reclassés au bon niveau, afin que la page reste compréhensible.',
      'Demandez la même reclassification pour les pages restantes.',
      'Faites corriger le gabarit commun.',
      'Traitez ce point en priorité dès la prochaine itération.',
    ]);
    expect(metrics.recommendedActionsOpeningWithDevoirModal).toBe(1);
    expect(metrics.constructionRepetitionFlags).toHaveLength(0);
  });

  it('does not count devoir appearing later than the opening of the first sentence', () => {
    const metrics = metricsForActions([
      "Faites ajouter un texte de confirmation. Le formulaire doit ensuite le conserver à l'écran, afin que le visiteur relise sa demande.",
      'Demandez la même confirmation pour le formulaire de contact.',
      'Traitez ce point avant la refonte visuelle.',
      'Faites documenter la correction dans le gabarit.',
    ]);
    expect(metrics.recommendedActionsOpeningWithDevoirModal).toBe(0);
    expect(metrics.constructionRepetitionFlags).toHaveLength(0);
  });

  it("passes a varied French report, including the register document's own exemplar rate", () => {
    // 6 devoir openings out of 10: exactly the distribution of the worked
    // examples in docs/rules/report-writing-style.md section 6, which is
    // natural remediation register and must stay a pass.
    const actions = [
      "Le focus clavier doit suivre l'ordre visuel du formulaire jusqu'au bouton d'envoi : demandez que l'ordre de tabulation soit corrigé.",
      'Un visiteur qui active le bouton doit recevoir une confirmation visible, sans avoir à quitter le clavier : faites ajouter un message de confirmation accessible.',
      "Les images de la page d'accueil pèsent plus que nécessaire pour leur taille d'affichage : votre prestataire peut les recompresser sans perte visible de qualité.",
      "Un script tiers bloque l'affichage pendant son chargement : demandez qu'il soit chargé après le contenu principal plutôt qu'avant.",
      "Aucune consigne de mise en cache n'est actuellement transmise au navigateur : faites ajouter les en-têtes correspondants.",
      "Chaque page doit recevoir une balise de titre qui la décrit spécifiquement : demandez qu'un titre distinct soit écrit pour chacune.",
      'La structure des titres et sous-titres ne suit pas un ordre logique sur plusieurs pages : faites réorganiser cette hiérarchie.',
      "Le choix du visiteur doit être mémorisé pour ne pas lui reposer la question à chaque page : demandez que ce choix soit conservé sur l'ensemble du site.",
      "Le bandeau de consentement doit apparaître avant tout dépôt de cookie non essentiel : demandez que la mesure d'audience attende le consentement.",
      "Le refus doit être aussi simple que l'acceptation : faites ajouter un bouton de refus aussi visible que le bouton d'acceptation.",
    ];
    const metrics = metricsForActions(actions);
    expect(metrics.recommendedActionsOpeningWithDevoirModal).toBe(6);
    expect(metrics.constructionRepetitionFlags).toHaveLength(0);
  });

  it('flags an English report whose actions close on one shared final clause', () => {
    const actions = [
      'The broken menu link needs a working address, and your technical provider can verify the destination returns a valid page.',
      'The sitemap entry is stale, and your technical provider can resubmit it after the fix.',
      'The colour contrast fails on the menu, and your technical provider can adjust the palette.',
      'The heading order skips a level, and your technical provider can correct the template.',
      'The form lacks an error summary, and your technical provider can add one.',
      'The privacy policy link is dead, and your technical provider can repoint it.',
      'Have the image weights reduced, because the homepage loads slowly on mobile connections.',
      'Ask that the third-party script be deferred, so the main content renders first.',
      'Without this correction, some visitors give up before the booking form appears.',
      'Have a caching policy added, so returning visitors load the page faster.',
      'Ask that a visible label be added to every button, so screen reader users hear its purpose.',
      'Without a correct canonical address, search engines may index duplicate pages.',
    ];
    const metrics = metricsForActions(actions, 'en');
    expect(metrics.recommendedActionsSharingSentenceFinalTail).toBe(6);
    expect(metrics.recommendedActionsMostSharedSentenceFinalTail).toBe(
      'and your technical provider',
    );
    expect(metrics.constructionRepetitionFlags).toHaveLength(1);
    expect(metrics.constructionRepetitionFlags[0]).toMatch(
      /final clause "and your technical provider"/,
    );
  });

  it('passes an English report whose endings vary', () => {
    const actions = [
      'The broken menu link needs a working address, so visitors reach the intended page.',
      'The sitemap entry is stale: resubmit it after the fix.',
      'Have the colour contrast adjusted, because text on the menu is hard to read.',
      'Without this correction, some visitors give up before the booking form appears.',
      'Ask that a visible label be added to every button.',
      'The heading order skips a level, which confuses screen reader navigation.',
    ];
    const metrics = metricsForActions(actions, 'en');
    expect(metrics.constructionRepetitionFlags).toHaveLength(0);
  });

  it('groups tails regardless of straight or typographic apostrophes', () => {
    const actions = [
      "Sans correction rapide du lien concerné, une partie des visiteurs abandonne, et l'équipe technique en charge de votre site peut intervenir cette semaine.",
      'Demandez la simplification du menu sans attendre, et l’équipe technique en charge de votre site peut intervenir cette semaine.',
      "Faites revoir la page concernée, et l'équipe technique en charge de votre site peut intervenir cette semaine.",
      'Traitez ce point en premier, car le parcours de réservation reste bloqué.',
    ];
    const metrics = metricsForActions(actions);
    expect(metrics.recommendedActionsOpeningWithDevoirModal).toBe(0);
    expect(metrics.recommendedActionsSharingSentenceFinalTail).toBe(3);
    expect(metrics.recommendedActionsMostSharedSentenceFinalTail).toBe("et l'équipe technique en");
    expect(metrics.constructionRepetitionFlags).toHaveLength(1);
  });

  it('treats an empty tail as no tail: entries without a final clause do not group', () => {
    const actions = Array.from({ length: 6 }, (_, i) => `Demandez la correction numéro ${i}.`);
    const metrics = metricsForActions(actions);
    expect(metrics.recommendedActionsSharingSentenceFinalTail).toBe(0);
    expect(metrics.recommendedActionsMostSharedSentenceFinalTail).toBe('');
    expect(metrics.constructionRepetitionFlags).toHaveLength(0);
  });

  it('sits strictly above its limits: exactly 2/3 devoir openings pass, one more fails', () => {
    const subjects = [
      'Les boutons du formulaire',
      'Les liens de pied de page',
      'Les images du bandeau',
      'Les titres de section',
      'Les champs obligatoires',
      'Les erreurs de saisie',
      'Les contrastes de texte',
      'Les libellés de boutons',
      'Les cadres publicitaires',
      'Les scripts externes',
      'Les polices personnalisées',
      'Les icônes sociales',
      'Les filtres de recherche',
      'Les notices légales',
    ];
    const devoirActions = (count: number) =>
      Array.from({ length: count }, (_, i) => {
        const subject = i < subjects.length ? (subjects[i] as string) : 'Le formulaire complet';
        return `${subject} doivent être revus avec soin, variante numéro ${i} à traiter.`;
      });
    const otherActions = (count: number) =>
      Array.from({ length: count }, (_, i) => `Demandez la correction numéro ${i} sans attendre.`);

    // 14/21 devoir openings = exactly 2/3: at the limit, not over it.
    const atLimit = metricsForActions([...devoirActions(14), ...otherActions(7)]);
    expect(atLimit.recommendedActionsOpeningWithDevoirModal).toBe(14);
    expect(atLimit.recommendedActionsTotal).toBe(21);
    expect(atLimit.constructionRepetitionFlags).toHaveLength(0);

    const overLimit = metricsForActions([...devoirActions(15), ...otherActions(6)]);
    expect(overLimit.recommendedActionsOpeningWithDevoirModal).toBe(15);
    expect(overLimit.constructionRepetitionFlags).toHaveLength(1);
  });

  it('suppresses the flags on reports too small for a share to mean anything', () => {
    // A single action trivially shares 100% of its tail and 100% of its
    // openings; the counts stay reported, the flags stay silent.
    const metrics = metricsForActions([
      'Le formulaire de réservation doit être corrigé rapidement, afin que le visiteur relise sa demande.',
    ]);
    expect(metrics.recommendedActionsOpeningWithDevoirModal).toBe(1);
    expect(metrics.recommendedActionsSharingSentenceFinalTail).toBe(1);
    expect(metrics.constructionRepetitionFlags).toHaveLength(0);
  });

  it('reports zeros and no flags on a report without actions', () => {
    const metrics = computeRepetitionMetrics(proseFieldsOf({ themes: [] }), 'fr');
    expect(metrics.recommendedActionsTotal).toBe(0);
    expect(metrics.recommendedActionsOpeningWithDevoirModal).toBe(0);
    expect(metrics.recommendedActionsSharingSentenceFinalTail).toBe(0);
    expect(metrics.constructionRepetitionFlags).toHaveLength(0);
  });
});
