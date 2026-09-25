# Registre d'écriture du rapport en français

Document de référence pour la passe de rédaction française
(`packages/llm/src/writing-prompt.ts`). Son contenu est repris tel quel dans
le prompt système envoyé au modèle : ce fichier est la source, le prompt en
est la copie d'exécution. Créé pour le plan 027
(`plans/027-french-report-prose-quality.md`), qui documente le défaut
observé : dix-huit recommandations consécutives ouvrant sur la même phrase de
sept mots, des impacts commerciaux systématiquement longs de deux phrases (le
plafond exact), et une phrase de clôture copiée mot pour mot depuis l'exemple
du prompt. Aucune phrase ci-dessous ne reprend un exemple déjà présent dans
l'ancien prompt : un exemple d'ici retrouvé mot pour mot dans un rapport
généré est donc une fuite nouvelle, détectable par
`lint-stored-analyses.ts`.

## 1. Le registre attendu

> Comme la section 3, cette section est portée par le prompt lui-même, qui
> énonce le registre et le vouvoiement avant les consignes de champ qu'ils
> gouvernent. Les deux doivent être modifiés ensemble.

Le ton est celui d'un consultant qui rend compte à un dirigeant de petite ou
moyenne entreprise, jamais celui d'un rapport d'outil automatisé qui remplit
des champs. Concrètement :

- Une entreprise à taille humaine, sans service informatique interne, lit ce
  texte. Aucun jargon technique non expliqué, aucune référence à un outil de
  scan, aucune acronyme sans être développé au moins une fois.
- Le ton reste mesuré et factuel, jamais alarmiste ni familier. On ne dramatise
  pas un constat mineur, on ne minimise pas un constat critique.
- Chaque phrase reste dans la conséquence fonctionnelle directement soutenue
  par les constats : ce qu'un visiteur peut ou ne peut pas lire, comprendre,
  atteindre, utiliser ou accomplir dans l'interface. L'audit ne mesure pas
  les réservations, la conversion, le chiffre d'affaires, l'abandon, la
  demande, la confiance ou la réputation : ces résultats ne sont donc jamais
  affirmés, même avec « peut », « pourrait », « semble » ou une autre
  précaution grammaticale. Les conséquences légales restent également hors de
  la passe de rédaction.
- Le vouvoiement est la seule forme d'adresse. Le client n'est jamais
  tutoyé, jamais nommé par son prénom.
- Le texte est écrit en français natif. Un terme technique anglais qui a un
  équivalent français établi prend cet équivalent (« adresse canonique » et
  non « canonical », « appui » et non « tap ») ; le glossaire est la table
  `FRENCH_TERM_GLOSSARY` de `prose-register-guard.ts`, que le prompt affiche
  et que le contrôle applique. Un nom d'attribut que le prestataire cherchera
  tel quel, comme hreflang, reste en l'état.
- Le français natif ne se limite pas au vocabulaire : une phrase peut n'employer
  que des mots français et suivre pourtant la charpente d'une phrase anglaise
  (« les sujets de référencement complètent cette lecture », « un remplissage
  visuel à accélérer », « servez ces images »). Pensez la phrase en français,
  avec un sujet concret et un verbe précis (« Les mesures montrent… », « Le
  navigateur détecte… »), plutôt qu'un enchaînement de noms abstraits. Les
  tournures calquées relevées dans de vrais rapports sont listées dans la
  table `FRENCH_CALQUE_GLOSSARY` du même fichier, que le prompt affiche et
  que le contrôle applique. Les libellés fixes du rapport suivent la même
  règle, vérifiée par `packages/report/src/template/french-calques.test.ts`.
- Aucun jugement subjectif que les constats ne mesurent pas : jamais « le
  site donne une impression de contenu riche mais insuffisamment cadré ».
  Le même contrôle rejette la tournure d'impression (issue #309).

## 2. Titres nominaux, prose en phrases complètes

Le titre d'un thème est l'exception : c'est un groupe nominal court,
généralement de deux à sept mots. Le contrôle automatique impose au maximum
80 caractères et 10 mots séparés par des espaces, sans ponctuation finale,
sans verbe conjugué et sans charpente d'obligation comme « doit »,
« doivent », « devrait », « devraient » ou « il faut »
(« Contrastes et lisibilité », « Navigation au clavier », « Stabilité
visuelle »). Il nomme le travail ; il ne promet pas un résultat.

Les autres champs de prose (impact, action recommandée, synthèse, notes)
s'écrivent avec un sujet explicite, un verbe et un complément, jamais comme
une liste de mots-clés juxtaposés. Les virgules séparent les propositions
plutôt que de les laisser en fragments.

Préférer : « Le formulaire ne signale pas ses erreurs de saisie, si bien
qu'un visiteur qui se trompe ne comprend pas pourquoi sa demande échoue. »

Éviter : « Formulaire sans retour d'erreur, action incomprise. »

## 3. Varier l'ouverture des phrases

> Le prompt de rédaction porte lui-même la substance de cette section
> (structures d'ouverture et illustrations), il ne la cite pas par son
> chemin de fichier : le modèle n'a aucun moyen d'ouvrir ce document. Les
> deux doivent donc être modifiés ensemble.

C'est la règle qui corrige le défaut mesuré par le plan 027. Deux
constructions ne doivent jamais devenir des tics répétés d'un thème à
l'autre dans le même rapport :

- **L'ouverture de l'impact fonctionnel.** Ne commencez pas systématiquement
  par « Ces constats » ou « Les constats ». Un thème peut ouvrir sur le
  visiteur (« Un visiteur qui utilise ce formulaire... »), sur la page
  concernée (« La page concernée... »), sur la conséquence directe (« Le
  contrôle reste inaccessible au clavier... »), ou sur le constat lui-même
  formulé autrement.
- **L'ouverture de chaque action recommandée.** Le nom du prestataire (voir
  section 4) reste le même dans tout le rapport, mais la construction de la
  phrase qui y mène doit varier : une action peut commencer par le problème
  à corriger, une autre par la conséquence si rien n'est fait, une autre par
  l'action elle-même. Ne commencez pas deux actions du même rapport par la
  même formule d'ouverture (« Demandez à... », par exemple, ne doit pas
  ouvrir toutes les actions).
- **La charpente grammaticale de chaque action recommandée.** Ajoutée le
  2026-09-08 (issue #106) : varier les premiers mots ne suffit pas si toutes
  les actions partagent la même construction. Dans les analyses stockées du
  2026-09-07, 20 des 21 actions de Villas Foch et 24 des 26 actions de
  Briketenia s'ouvraient sur un sujet grammatical suivi du verbe devoir, le
  plus souvent au passif (« Les boutons concernés doivent recevoir... »,
  « Le lien interne cassé doit être remplacé... »), tous premiers mots
  différents ; la version anglaise du même rapport terminait pour sa part
  une grande partie de ses actions par la même formule de fin («..., and
  your technical provider can... »). C'est la charpente que le client lit,
  pas les premiers mots. La construction sujet + devoir reste disponible,
  mais elle ne porte qu'une minorité des actions d'un rapport, au plus un
  tiers toutes priorités confondues ; le prompt l'opérationne thème par
  thème (au plus une action par thème sur cette construction, jamais deux
  actions de thèmes consécutifs) parce qu'une consigne globale seule n'a
  pas tenu à la mesure. La fin obéit à la même règle : les mêmes premiers
  mots après la dernière virgule ne doivent pas revenir d'une action à
  l'autre au point de devenir une formule. Cette règle est
  mesurée par `lint-stored-analyses.ts` : un rapport est signalé au-delà de
  deux tiers d'ouvertures sujet + devoir, ou quand une formule de fin est
  partagée par plus d'un quart des actions, seuils calibrés sur les
  analyses stockées (les actions d'exemple de la section 6 culminent à
  60 pour cent d'ouvertures sujet + devoir et doivent rester un passage).
- **Le futur passif.** Ajouté le 2026-09-25 : un rapport d'hôtel régénéré
  a contourné la limite ci-dessus en écrivant toutes ses actions au futur
  passif (« Un texte lisible sera ajouté à chaque lien », « Le contraste
  sera renforcé »). Une action est une consigne à transmettre, pas
  l'annonce de ce qui sera fait : le futur passif ne dit ni qui agit ni que
  c'est au client de le demander. Le prompt l'interdit ; aucun contrôle ne
  le rejette encore.

## 4. Le nom du prestataire

Le client n'a pas d'équipe technique interne : chaque action recommandée
s'adresse donc à un prestataire externe. Depuis le 2026-09-07, vous ne
choisissez plus cette formulation : elle est attribuée au rapport par le code
avant l'appel (`selectProviderPhrase`), et le prompt ne vous en montre qu'une
seule. Employez exactement celle-là, partout, et aucune variante.

Ce choix est fait à partir de l'identifiant de l'audit, si bien que la version
française et la version anglaise d'un même rapport désignent le prestataire de
la même façon, et qu'une régénération ne renomme jamais l'interlocuteur du
client d'un tirage à l'autre. Deux audits différents peuvent en revanche
recevoir des formulations différentes : c'est voulu, c'est ce qui évite que
tous les rapports se ressemblent.

Un contrôle automatique le vérifie après chaque tentative
(`provider-phrase-guard.ts`) et rejette toute autre désignation. Il ne devrait
plus jamais se déclencher, puisque la formulation concurrente n'est plus
proposée : il subsiste au cas où le modèle emploierait spontanément une
formulation approuvée qu'on ne lui a pas montrée.

**Nommez le prestataire au plus une fois par thème, comme agent de la
proposition principale.** Chaque action lui est implicitement adressée ; il
n'est pas nécessaire de le nommer dans chacune. Ne l'accrochez jamais en fin
d'action après une virgule (« …, et votre prestataire technique peut… »,
« …, afin que… », « …, car… »), et n'ouvrez jamais une action sur son nom.
Mesuré : le prompt exigeait auparavant la formulation dans chaque action tout
en interdisant d'ouvrir dessus, et le modèle a satisfait les deux en la
reléguant en fin de phrase dans presque toutes les actions des deux rapports
de production du 2026-09-15/16, avec des liens de cause absurdes (« Chaque
page doit déclarer une adresse canonique cohérente, car l'équipe technique…
évite ainsi… »). `findProviderPlacementViolations` rejette désormais toute
accroche après une virgule et une réponse qui nomme le prestataire dans plus
de la moitié de ses actions (issue #309). Le plafond d'une mention par thème
reste la consigne, pas un motif de rejet : appliqué thème par thème, il a
épuisé les trois tentatives d'un rapport réel de dix thèmes (Atlantic Hôtel,
2026-09-17) sur des secondes mentions correctement placées. La variété d'ouverture décrite en section 3 reste la
règle, y compris dans la réponse écrite après un rejet.

## 5. Longueur des champs

`businessImpact` : entre une et quatre phrases complètes.
`recommendedActions` : entre une et quatre actions concrètes.

Une seule phrase ou une seule action est une réponse complète quand le thème
n'exige rien de plus. Il n'existe aucun minimum de remplissage au-delà de ce
plancher sémantique. Le plafond évite au contraire qu'un thème absorbe de la
prose qui appartient à un autre travail de correction.

## 6. Exemples de forme

Ces exemples montrent uniquement la forme attendue ; ils ne sont jamais des
phrases à recopier.

### Accessibilité

**Titre.** Navigation au clavier

**Impact.** Un visiteur qui utilise uniquement le clavier ne peut pas
atteindre le bouton concerné.

**Action.** Faites corriger l'ordre de tabulation afin que le contrôle soit
atteignable dans la séquence logique de la page.

### Performance

**Titre.** Stabilité visuelle

**Impact.** Des éléments se déplacent pendant le chargement, ce qui rend
l'interface difficile à suivre au moment où le visiteur interagit avec elle.

**Action.** Réservez l'espace nécessaire aux éléments qui apparaissent après
le premier rendu afin d'éviter ces déplacements.

### Référencement

**Titre.** Titres de pages

**Impact.** Plusieurs pages utilisent le même titre, ce qui ne permet pas aux
moteurs de distinguer clairement leur sujet respectif.

**Action.** Donnez à chaque page concernée un titre qui décrit son propre
contenu.

### Confidentialité

**Titre.** Consentement aux cookies

**Impact.** Des cookies non essentiels sont déposés avant que le visiteur ait
exprimé son choix.

**Action.** Retardez le chargement des scripts non essentiels jusqu'au choix
explicite du visiteur.

## 7. La phrase de clôture de la synthèse

C'est la dernière phrase que lit le client. Elle doit être grammaticalement
complète, formelle, et s'appuyer sur les familles de constats réellement
présentes dans le rapport plutôt que sur une abstraction générale. Trois
formulations possibles, à titre d'exemple de registre uniquement (ne pas les
recopier) :

- « Ces travaux, pris dans l'ordre de priorité proposé ici, redonnent au site
  la fiabilité qu'attendent aujourd'hui vos visiteurs. »
- « En traitant d'abord les thèmes classés en tête de ce rapport, vous
  réduisez la part la plus visible des difficultés rencontrées par vos
  visiteurs. »
- « Ce plan de correction, mené dans l'ordre indiqué, rapproche votre site du
  niveau de fiabilité que vos clients sont en droit d'attendre. »

Écrivez une phrase de clôture originale dans ce registre plutôt que de
reprendre l'une de ces trois formulations telle quelle.

> Ces trois exemples restent ici, comme repère de registre pour un relecteur
> humain, mais ils ont été retirés du prompt le 2026-09-07 et ne doivent pas
> y être remis. Mesuré : les montrer au modèle en lui interdisant de les
> recopier ne fonctionne pas. Quatre analyses françaises consécutives ont
> ouvert leur clôture sur les mots du deuxième exemple, l'une en reprenant
> vingt-trois mots d'affilée, y compris après l'ajout d'une interdiction
> explicite de réutiliser leurs premiers mots. Le prompt indique désormais
> qu'aucun modèle de phrase n'est fourni, et le tic a disparu.

## 7 ter. L'applicabilité de l'obligation reste hors de la synthèse

La synthèse reçoit l'applicabilité de l'obligation comme fait de contexte.
Le 2026-09-25, elle l'a recopiée telle quelle (« L'applicabilité de
l'obligation est indiquée comme hors périmètre dans les éléments de
contexte ») : une phrase juridique hors de la formulation approuvée, que la
section « Cadre réglementaire » expose déjà. Le prompt demande désormais de
ne pas la mentionner dans executiveSummary.

## 7 bis. Ancrage et réparation locale

Chaque thème ne voit que ses propres constats et les corrections revues du
registre de remédiation. La synthèse reçoit un paquet déterministe séparé
(décomptes, catégories, performance réconciliée, limitations). Pour la
performance, les données réelles utilisateurs priment sur un signal de
laboratoire contradictoire ; un signal de laboratoire explicitement supprimé
du paquet de recommandation ne doit pas réapparaître dans les priorités.

Si une phrase ou une action contient malgré tout une affirmation commerciale,
légale ou de performance non soutenue, elle est supprimée localement. Les
autres champs valides ne sont ni réécrits ni régénérés. L'interface opérateur
signale cette sanitation par un code et le chemin du champ, jamais en
recopiant la prose client dans la métadonnée de workflow.

## 8. Ne jamais désigner un autre passage du rapport par sa position

Ajouté pour le plan 028, après un défaut relevé dans plusieurs répétitions
d'audit : un rapport réel désignait « la priorité 1 ci-dessus » alors que ce
thème s'affichait plus bas sur la page. La passe de rédaction n'a aucune
visibilité sur la mise en page finale du rapport, donc toute référence à une
position (« ci-dessus », « ci-dessous ») est une supposition qui peut pointer
au mauvais endroit.

Désignez toujours un autre thème par son nom ou son rang de priorité (« le
thème classé en priorité 1 », « le thème sur les contrastes »), jamais par sa
position sur la page. Cela ne concerne pas les expressions numériques comme
« en dessous du seuil requis », qui restent normales et ne sont pas visées
par cette règle.

Vérifié par un contrôle automatique (`positional-reference-guard.ts`), même
posture que la section 4 : la consigne écrite seule ne suffit pas à garantir
qu'elle sera suivie.
