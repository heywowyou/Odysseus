/** Plan 078: the campaign results page. Counts the operator can stand
 *  behind; the page reports and never concludes. French is the source. */
export interface CampaignStrings {
  /** Tokens: {campaign}, {date}. */
  description: string;
  descriptionNoSend: string;
  campaignSwitchAria: string;
  /** The link to this page from To do and from the Results view. */
  viewCampaign: string;
  empty: string;
  emptyDescription: string;
  kpi: {
    delivered: string;
    /** Token: {bounced}. */
    deliveredNote: string;
    matured: string;
    /** Token: {rate}, a percentage or two counts. */
    maturedNote: string;
    replies: string;
    /** Tokens: {positive}, {objections}. */
    repliesNote: string;
    won: string;
    wonNote: string;
  };
  standing: {
    heading: string;
    /** Read by assistive technology in place of the strip. */
    caption: string;
    replied: string;
    silent: string;
    replyWindow: string;
    inSequence: string;
    closedOther: string;
    /** Tokens: {date}, {count}. */
    nextMaturity: string;
    noneWaiting: string;
  };
  checkpoints: {
    heading: string;
    description: string;
    /** Token: {checkpoint}. */
    rowHeading: string;
    /** Tokens: {matured}, {checkpoint}. */
    progressAria: string;
    /** Token: {date}. */
    reachedOn: string;
    /** Tokens: {replies}, {positive}. */
    reachedThatDay: string;
    reachedNoDay: string;
    /** Token: {date}. */
    dated: string;
    datedHint: string;
    /** Tokens: {date}, {pace}. */
    estimated: string;
    noEstimate: string;
    noEstimateHint: string;
    /** Tokens: {replies}, {positive}, {won}. */
    measured: string;
    /** The brief's rule for each checkpoint, as it is written there. */
    rules: Record<'100' | '300' | '500', string>;
  };
  replies: {
    heading: string;
    byTouchHeading: string;
    touchColumn: string;
    countColumn: string;
    touchLabels: Record<'1' | '2' | '3', string>;
    declineHeading: string;
    reasonColumn: string;
    unspecified: string;
    noDecline: string;
  };
  segments: {
    heading: string;
    facetAria: string;
    facets: Record<'stars' | 'groupStatus' | 'accessibilityCard', string>;
    columns: {
      segment: string;
      delivered: string;
      matured: string;
      replies: string;
      positiveReplies: string;
      replyRate: string;
    };
    starLabels: Record<'1' | '2' | '3' | '4' | '5', string>;
    accessibilityLabels: Record<'yes' | 'no', string>;
    unknown: string;
    rateHint: string;
  };
  footnote: {
    delivered: string;
    matured: string;
    /** Token: {count}. */
    merged: string;
    retention: string;
  };
}

export const campaign = {
  fr: {
    description: 'Campagne {campaign} · premier envoi le {date}',
    descriptionNoSend: 'Campagne {campaign} · aucun premier email envoyé',
    campaignSwitchAria: 'Campagne affichée',
    viewCampaign: 'Voir la campagne',
    empty: 'Aucun premier email envoyé',
    emptyDescription: 'Les résultats apparaîtront ici après le premier envoi.',
    kpi: {
      delivered: 'Premiers emails délivrés',
      deliveredNote: 'Rebonds exclus : {bounced}',
      matured: 'Arrivés à maturité',
      maturedNote: 'Part des emails délivrés : {rate}',
      replies: 'Réponses',
      repliesNote: 'Positives : {positive} · Désinscriptions : {objections}',
      won: 'Ventes',
      wonNote: 'Le chiffre d’affaires n’est pas affiché.',
    },
    standing: {
      heading: 'Où en sont les prospects',
      caption: 'Premiers emails délivrés, selon l’état de leur séquence',
      replied: 'Ont répondu',
      silent: 'Séquence close sans réponse',
      replyWindow: 'Délai de réponse en cours après le troisième email',
      inSequence: 'Séquence en cours',
      closedOther: 'Fil clos pour un motif non répertorié',
      nextMaturity:
        'Prochaine arrivée à maturité : le {date} au plus tôt. Dans les 7 prochains jours : {count} fil(s).',
      noneWaiting: 'Aucun fil n’attend d’arriver à maturité.',
    },
    checkpoints: {
      heading: 'Points de contrôle',
      description: 'Comptés en premiers emails arrivés à maturité.',
      rowHeading: '{checkpoint} premiers emails arrivés à maturité',
      progressAria: '{matured} sur {checkpoint} premiers emails arrivés à maturité',
      reachedOn: 'Atteint le {date}',
      reachedThatDay: 'Ce jour-là : {replies} réponse(s), dont {positive} positive(s).',
      reachedNoDay: 'Atteint. Le relevé quotidien n’en donne pas encore la date.',
      dated: 'Au plus tôt le {date}',
      datedHint: 'Date tirée des emails déjà envoyés. Une relance tardive la repousse.',
      estimated: 'Estimation : {date}, au rythme de {pace} premier(s) email(s) par jour',
      noEstimate: 'Pas d’estimation',
      noEstimateHint:
        'Une estimation demande au moins 7 jours d’envois et un envoi dans les 14 derniers jours.',
      measured:
        'Mesuré à ce jour : {replies} réponse(s), dont {positive} positive(s) ; {won} vente(s).',
      rules: {
        '100':
          'Règle du projet : moins de deux ou trois réponses, quelle qu’en soit la nature, ou aucune réponse positive, conduit à changer le ciblage ou le message (segment, constats retenus, objet, premières lignes), et non à envoyer davantage.',
        '300':
          'Règle du projet : des réponses mais aucun audit payé signifie que la perte se produit après la réponse (preuve, aperçu, suivi des réponses, prix). Ce point se travaille avant d’augmenter le volume.',
        '500':
          'Règle du projet : aucun audit payé et des réponses toujours peu qualifiées conduit à arrêter et à repenser l’offre, pas seulement la campagne.',
      },
    },
    replies: {
      heading: 'Réponses',
      byTouchHeading: 'Selon le dernier email envoyé avant la réponse',
      touchColumn: 'Dernier email envoyé',
      countColumn: 'Réponses',
      touchLabels: {
        '1': 'Premier email',
        '2': 'Première relance',
        '3': 'Deuxième relance',
      },
      declineHeading: 'Motifs de refus',
      reasonColumn: 'Motif',
      unspecified: 'Non renseigné',
      noDecline: 'Aucun refus enregistré.',
    },
    segments: {
      heading: 'Par segment',
      facetAria: 'Segment affiché',
      facets: {
        stars: 'Étoiles',
        groupStatus: 'Groupe ou indépendant',
        accessibilityCard: 'Accessibilité dans l’aperçu',
      },
      columns: {
        segment: 'Segment',
        delivered: 'Délivrés',
        matured: 'Arrivés à maturité',
        replies: 'Réponses',
        positiveReplies: 'Réponses positives',
        replyRate: 'Taux de réponse, sur les emails arrivés à maturité',
      },
      starLabels: {
        '1': '1 étoile',
        '2': '2 étoiles',
        '3': '3 étoiles',
        '4': '4 étoiles',
        '5': '5 étoiles',
      },
      accessibilityLabels: {
        yes: 'Accessibilité parmi les trois cartes',
        no: 'Aucune carte sur l’accessibilité',
      },
      unknown: 'Inconnu',
      rateHint:
        'Un pourcentage n’apparaît qu’à partir de 20 emails arrivés à maturité. En dessous, les deux nombres sont indiqués.',
    },
    footnote: {
      delivered:
        'Délivré : un premier email envoyé, hors rebonds et hors envois fusionnés dans le message d’un autre prospect.',
      matured:
        'Arrivé à maturité : le prospect a répondu, ou sa séquence s’est close sans réponse à la fin du délai qui suit le troisième email.',
      merged:
        'Premiers emails fusionnés dans le message d’un autre prospect, comptés une seule fois : {count}.',
      retention:
        'Compteurs seuls. Les fils expirent après 90 jours ; un relevé quotidien des compteurs est conservé (« odysseus outreach-funnel --history »).',
    },
  },
  en: {
    description: 'Campaign {campaign} · first send on {date}',
    descriptionNoSend: 'Campaign {campaign} · no first email sent',
    campaignSwitchAria: 'Campaign shown',
    viewCampaign: 'View campaign',
    empty: 'No first email sent',
    emptyDescription: 'Results will appear here after the first send.',
    kpi: {
      delivered: 'First emails delivered',
      deliveredNote: 'Bounces excluded: {bounced}',
      matured: 'Matured',
      maturedNote: 'Share of delivered emails: {rate}',
      replies: 'Replies',
      repliesNote: 'Positive: {positive} · Opt-outs: {objections}',
      won: 'Sales',
      wonNote: 'Revenue is not shown.',
    },
    standing: {
      heading: 'Where prospects stand',
      caption: 'First emails delivered, by the state of their sequence',
      replied: 'Replied',
      silent: 'Sequence closed without a reply',
      replyWindow: 'Reply window open after the third email',
      inSequence: 'Sequence in progress',
      closedOther: 'Thread closed for an unlisted reason',
      nextMaturity:
        'Next to mature: {date} at the earliest. In the next 7 days: {count} thread(s).',
      noneWaiting: 'No thread is waiting to mature.',
    },
    checkpoints: {
      heading: 'Checkpoints',
      description: 'Counted in matured first emails.',
      rowHeading: '{checkpoint} matured first emails',
      progressAria: '{matured} of {checkpoint} matured first emails',
      reachedOn: 'Reached on {date}',
      reachedThatDay: 'That day: {replies} reply(ies), of which {positive} positive.',
      reachedNoDay: 'Reached. The daily record does not give its date yet.',
      dated: '{date} at the earliest',
      datedHint: 'Date taken from the emails already sent. A late follow-up moves it later.',
      estimated: 'Estimate: {date}, at {pace} first email(s) a day',
      noEstimate: 'No estimate',
      noEstimateHint:
        'An estimate needs at least 7 days of sending and a send in the last 14 days.',
      measured:
        'Measured to date: {replies} reply(ies), of which {positive} positive; {won} sale(s).',
      rules: {
        '100':
          'Project rule: fewer than two or three replies of any kind, or no positive reply, means changing the targeting or the message (segment, evidence chosen, subject, opening lines), not sending more.',
        '300':
          'Project rule: replies but no paid audit means the loss happens after the reply (proof, the preview, follow-up handling, price). That is worked on before adding volume.',
        '500':
          'Project rule: no paid audit and reply quality still weak means stopping and rethinking the offer, not only the campaign.',
      },
    },
    replies: {
      heading: 'Replies',
      byTouchHeading: 'By the last email sent before the reply',
      touchColumn: 'Last email sent',
      countColumn: 'Replies',
      touchLabels: {
        '1': 'First email',
        '2': 'First follow-up',
        '3': 'Second follow-up',
      },
      declineHeading: 'Decline reasons',
      reasonColumn: 'Reason',
      unspecified: 'Not given',
      noDecline: 'No refusal recorded.',
    },
    segments: {
      heading: 'By segment',
      facetAria: 'Segment shown',
      facets: {
        stars: 'Stars',
        groupStatus: 'Group or independent',
        accessibilityCard: 'Accessibility in the preview',
      },
      columns: {
        segment: 'Segment',
        delivered: 'Delivered',
        matured: 'Matured',
        replies: 'Replies',
        positiveReplies: 'Positive replies',
        replyRate: 'Reply rate, over matured emails',
      },
      starLabels: {
        '1': '1 star',
        '2': '2 stars',
        '3': '3 stars',
        '4': '4 stars',
        '5': '5 stars',
      },
      accessibilityLabels: {
        yes: 'Accessibility among the three cards',
        no: 'No accessibility card',
      },
      unknown: 'Unknown',
      rateHint:
        'A percentage appears only from 20 matured emails. Below that, the two counts are shown.',
    },
    footnote: {
      delivered:
        'Delivered: a first email sent, excluding bounces and sends merged into another prospect’s message.',
      matured:
        'Matured: the prospect replied, or its sequence closed without a reply at the end of the window that follows the third email.',
      merged: 'First emails merged into another prospect’s message, counted once: {count}.',
      retention:
        'Counts only. Threads expire after 90 days; a daily record of the counts is kept ("odysseus outreach-funnel --history").',
    },
  },
} satisfies { fr: CampaignStrings; en: CampaignStrings };
