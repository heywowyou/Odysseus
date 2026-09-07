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
- Chaque phrase relie une observation à une conséquence concrète pour
  l'activité du client (clients perdus, réservations manquées, confiance
  entamée), jamais à une conséquence légale (voir la règle non négociable 6
  du plan de projet : on décrit le critère, jamais le verdict).
- Le vouvoiement est la seule forme d'adresse. Le client n'est jamais
  tutoyé, jamais nommé par son prénom.

## 2. La règle de phrase complète

Toute phrase de prose (titre, impact commercial, action recommandée, synthèse,
notes) s'écrit avec un sujet explicite, un verbe et un complément, jamais
comme une liste de mots-clés juxtaposés. Les virgules séparent les
propositions plutôt que de les laisser en fragments.

Préférer : « Le formulaire de réservation ne signale pas ses erreurs de
saisie, si bien qu'un client qui se trompe de date ne comprend pas pourquoi
sa demande échoue. »

Éviter : « Formulaire sans retour d'erreur, client perdu. »

## 3. Varier l'ouverture des phrases

> Le prompt de rédaction porte lui-même la substance de cette section
> (structures d'ouverture et illustrations), il ne la cite pas par son
> chemin de fichier : le modèle n'a aucun moyen d'ouvrir ce document. Les
> deux doivent donc être modifiés ensemble.

C'est la règle qui corrige le défaut mesuré par le plan 027. Deux
constructions ne doivent jamais devenir des tics répétés d'un thème à
l'autre dans le même rapport :

- **L'ouverture de l'impact commercial.** Ne commencez pas systématiquement
  par « Ces constats » ou « Les constats ». Un thème peut ouvrir sur le
  client (« Un visiteur qui... »), sur la page concernée (« La page de
  réservation... »), sur la conséquence directe (« Une partie des visiteurs
  abandonne... »), ou sur le constat lui-même formulé autrement.
- **L'ouverture de chaque action recommandée.** Le nom du prestataire (voir
  section 4) reste le même dans tout le rapport, mais la construction de la
  phrase qui y mène doit varier : une action peut commencer par le problème
  à corriger, une autre par la conséquence si rien n'est fait, une autre par
  l'action elle-même. Ne commencez pas deux actions du même rapport par la
  même formule d'ouverture (« Demandez à... », par exemple, ne doit pas
  ouvrir toutes les actions).

## 4. Le nom du prestataire

Le client n'a pas d'équipe technique interne : chaque action recommandée
s'adresse donc à un prestataire externe. Choisissez une seule formulation en
début de réponse parmi celles listées dans le prompt (elles désignent toutes
la même partie) et gardez cette même formulation jusqu'à la fin du rapport.
Ne mélangez jamais deux formulations dans un même rapport : un rapport où une
priorité s'adresse au « prestataire technique » et une autre à l'« agence »
se lit comme deux interlocuteurs différents, pas un seul.

Ce point est vérifié par un contrôle automatique après chaque tentative
(`provider-phrase-guard.ts`), pas seulement demandé dans le prompt : la
consigne écrite seule ne tenait pas, chaque analyse française régénérée
mélangeant deux formulations approuvées dans un même rapport. Le contrôle ne
rejette que le mélange. Il n'impose pas la formulation choisie, qui peut
légitimement différer d'un rapport à l'autre, et il n'exige pas que le
prestataire soit nommé dans chaque action : la variété d'ouverture décrite en
section 3 reste la règle, y compris dans la réponse écrite après un rejet.

## 5. Longueur des champs

`businessImpact` : entre trois et cinq phrases complètes. `recommendedActions`
: entre deux et cinq actions concrètes. Ce ne sont pas des objectifs à
atteindre systématiquement au plafond : un thème simple peut légitimement
tenir en trois phrases et deux actions, un thème qui touche plusieurs pages
et plusieurs mécanismes peut avoir besoin de cinq. La longueur suit ce que le
thème a réellement à dire, jamais un compte à remplir.

## 6. Quatre thèmes rédigés, quatre structures différentes

Ces exemples illustrent le registre attendu. Aucun ne doit être recopié tel
quel : chaque rapport réel décrit des constats différents et doit trouver sa
propre formulation.

### Exemple accessibilité — ouverture sur le client

**Titre.** Rendre le formulaire de contact utilisable au clavier

**Impact commercial.** Un visiteur qui navigue au clavier, parce qu'il utilise
un lecteur d'écran ou ne peut pas manipuler une souris, ne parvient pas à
atteindre le bouton d'envoi du formulaire de contact. Il abandonne alors sa
demande sans qu'aucun message n'explique pourquoi. Cette catégorie de
visiteurs représente une part significative des usages recensés en France, et
chaque demande perdue de cette façon est une opportunité commerciale qui ne
laisse aucune trace dans les statistiques habituelles.

**Actions recommandées.**

1. Le focus clavier doit suivre l'ordre visuel du formulaire jusqu'au bouton
   d'envoi : demandez à votre prestataire technique de corriger l'ordre de
   tabulation.
2. Un visiteur qui active le bouton doit recevoir une confirmation visible
   sans avoir à quitter le clavier : faites ajouter un message de
   confirmation accessible au clavier.

### Exemple performance — ouverture sur la page

**Titre.** Accélérer le chargement de la page d'accueil

**Impact commercial.** La page d'accueil met plusieurs secondes à afficher
son contenu principal sur une connexion mobile ordinaire. Une majorité de
visiteurs quitte un site avant que la page ne devienne utilisable dans ces
conditions, avant même d'avoir vu l'offre. Le référencement naturel tient
également compte de ce délai, si bien que la lenteur mesurée ici joue contre
la visibilité du site autant que contre l'expérience du visiteur qui arrive
déjà sur la page.

**Actions recommandées.**

1. Les images de la page d'accueil pèsent plus que nécessaire pour leur
   taille d'affichage : votre prestataire technique peut les recompresser
   sans perte visible de qualité.
2. Un script tiers bloque l'affichage pendant son chargement : demandez à ce
   qu'il soit chargé après le contenu principal plutôt qu'avant.
3. Aucune consigne de mise en cache n'est actuellement transmise au
   navigateur : faites ajouter les en-têtes correspondants pour que les
   visiteurs récurrents chargent la page plus vite.

### Exemple référencement — ouverture sur la conséquence

**Titre.** Corriger les balises de titre pour être mieux référencé

**Impact commercial.** Une partie des pages du site partage la même balise de
titre, si bien que les moteurs de recherche ne peuvent pas distinguer laquelle
mettre en avant pour une recherche donnée. Le site perd alors de la
visibilité sur des recherches où une page bien identifiée aurait pu apparaître
en meilleure position. Ce constat touche aussi bien les visiteurs qui
cherchent le site par son nom que ceux qui découvrent l'activité par une
recherche plus générale.

**Actions recommandées.**

1. Chaque page doit recevoir une balise de titre qui la décrit
   spécifiquement : demandez à votre prestataire technique d'écrire un titre
   distinct pour chacune.
2. La structure des titres et sous-titres de contenu ne suit pas un ordre
   logique sur plusieurs pages : faites réorganiser cette hiérarchie pour
   qu'un lecteur, humain ou moteur de recherche, comprenne l'organisation du
   contenu.

### Exemple confidentialité — ouverture sur le constat reformulé

**Titre.** Informer les visiteurs avant le dépôt de cookies

**Impact commercial.** Des cookies de mesure d'audience se déposent sur
l'appareil du visiteur dès l'arrivée sur le site, avant tout consentement
recueilli. Un visiteur attentif à sa vie privée qui remarque ce
fonctionnement peut perdre confiance dans le site avant même d'avoir consulté
son contenu. La réglementation sur la protection des données encadre
précisément ce moment du dépôt, ce qui expose le site à un contrôle sur un
point facilement vérifiable par un visiteur ou une autorité.

**Actions recommandées.**

1. Le bandeau de consentement doit apparaître avant tout dépôt de cookie non
   essentiel : demandez à votre prestataire technique de retarder le
   chargement de la mesure d'audience jusqu'au consentement.
2. Le refus doit être aussi simple que l'acceptation : faites ajouter un
   bouton de refus aussi visible que le bouton d'acceptation.
3. Le choix du visiteur doit être mémorisé pour ne pas lui reposer la
   question à chaque page : demandez que ce choix soit conservé sur
   l'ensemble du site.

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
