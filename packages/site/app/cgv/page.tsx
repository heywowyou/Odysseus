import type { Metadata } from 'next';
import { LanguageSection, PageHeading } from '../../lib/language';

const description =
  'Les conditions générales de vente du diagnostic Odysseus et de la nouvelle vérification, réservés aux clients professionnels.';

export const metadata: Metadata = {
  title: 'Conditions générales de vente',
  description,
  alternates: { canonical: '/cgv' },
  openGraph: {
    type: 'website',
    siteName: 'Odysseus',
    locale: 'fr_FR',
    url: '/cgv',
    title: 'Conditions générales de vente',
    description,
  },
};

/**
 * Conditions générales de vente, required by article L. 441-1 of the code de
 * commerce for any service provider selling to professionals. French is the
 * authoritative text; the English section is a translation of it.
 *
 * Deliberate choices, researched 2026-09-28 (the pre-sale checklist in
 * docs/rules/operator-obligations.md section 8 records them):
 * - No jurisdiction clause. Article 48 of the code de procédure civile voids
 *   one unless every party contracted as a commerçant, and the operator is a
 *   non-commercial sole trader.
 * - No VAT article number. The franchise en base reference moves from
 *   article 293 B du CGI to the CIBS on 1 January 2027; the quote and invoice
 *   carry the mention in force.
 * - The withdrawal right of article L. 221-3 du code de la consommation is
 *   acknowledged, not excluded: it binds off-premises contracts with a
 *   professional of five employees or fewer, which a small hotel can be.
 * - The legal-perimeter and diagnostic-not-audit wording repeats the approved
 *   sentences of docs/rules/offer-positioning.md section 2.
 * - The prices are literal text, pinned by packages/core/src/offer/pricing.test.ts.
 */

const SECTIONS_FR = [
  ['objet-cgv', "Objet et champ d'application"],
  ['prestataire-cgv', 'Prestataire'],
  ['prestations-cgv', 'Prestations'],
  ['exclusions-cgv', 'Ce que la prestation ne comprend pas'],
  ['commande-cgv', 'Commande'],
  ['prix-cgv', 'Prix'],
  ['paiement-cgv', 'Paiement'],
  ['execution-cgv', "Réalisation de l'analyse"],
  ['remise-cgv', 'Remise du rapport et délais'],
  ['correction-cgv', 'Vérification et correction du rapport'],
  ['annulation-cgv', 'Annulation et rétractation'],
  ['responsabilite-cgv', 'Responsabilité'],
  ['propriete-cgv', 'Propriété intellectuelle et usage du rapport'],
  ['confidentialite-cgv', 'Confidentialité et références'],
  ['donnees-cgv', 'Données personnelles'],
  ['force-majeure-cgv', 'Force majeure'],
  ['droit-cgv', 'Droit applicable et litiges'],
  ['divers-cgv', 'Dispositions diverses'],
] as const;

const SECTIONS_EN = [
  ['objet-cgv-en', 'Purpose and scope'],
  ['prestataire-cgv-en', 'Provider'],
  ['prestations-cgv-en', 'Services'],
  ['exclusions-cgv-en', 'What the service does not include'],
  ['commande-cgv-en', 'Orders'],
  ['prix-cgv-en', 'Prices'],
  ['paiement-cgv-en', 'Payment'],
  ['execution-cgv-en', 'Carrying out the analysis'],
  ['remise-cgv-en', 'Report delivery and lead times'],
  ['correction-cgv-en', 'Checking and correcting the report'],
  ['annulation-cgv-en', 'Cancellation and withdrawal'],
  ['responsabilite-cgv-en', 'Liability'],
  ['propriete-cgv-en', 'Intellectual property and use of the report'],
  ['confidentialite-cgv-en', 'Confidentiality and references'],
  ['donnees-cgv-en', 'Personal data'],
  ['force-majeure-cgv-en', 'Force majeure'],
  ['droit-cgv-en', 'Governing law and disputes'],
  ['divers-cgv-en', 'Miscellaneous'],
] as const;

function Contents({
  label,
  sections,
}: {
  label: string;
  sections: readonly (readonly [string, string])[];
}) {
  return (
    <nav aria-label={label} className="measure mb-10">
      <p className="label">{label}</p>
      <ol className="toc mt-4">
        {sections.map(([id, title]) => (
          <li key={id}>
            <a className="evidence-link" href={`#${id}`}>
              {title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export default function TermsOfSalePage() {
  return (
    <main id="contenu" tabIndex={-1} className="flex-1">
      <section className="shell hero pb-0">
        <PageHeading
          className="title measure"
          fr="Conditions générales de vente"
          en="General terms of sale"
        />
      </section>

      <LanguageSection lang="fr">
        <section className="shell hero pt-0">
          <p className="lede measure mt-5">
            Les conditions applicables au diagnostic Odysseus et à la nouvelle vérification, lorsque
            vous les commandez pour votre activité professionnelle.
          </p>
          <p className="small muted measure mt-3">Version en vigueur au 28 septembre 2026.</p>
        </section>

        <div className="shell section-tight">
          <Contents label="Sommaire" sections={SECTIONS_FR} />

          <section className="prose measure">
            <h2 id="objet-cgv">1. Objet et champ d&apos;application</h2>

            <p>
              Les présentes conditions générales de vente (CGV) s&apos;appliquent à toute prestation
              commandée à Odysseus. Conformément à l&apos;article L.&#160;441-1 du code de commerce,
              elles constituent le socle de la relation commerciale et sont communiquées avec chaque
              devis.
            </p>

            <p>
              Les prestations d&apos;Odysseus sont réservées aux professionnels. En passant
              commande, le client déclare agir pour les besoins de son activité professionnelle. Les
              conditions générales d&apos;achat du client ne s&apos;appliquent que si Odysseus les a
              acceptées par écrit.
            </p>

            <h2 id="prestataire-cgv">2. Prestataire</h2>

            <p>
              Les prestations Odysseus sont fournies par Jules Fontaine, entrepreneur individuel
              (EI), sous le régime de la micro-entreprise. SIREN&#160;: 980&#160;766&#160;463.
              SIRET&#160;: 980&#160;766&#160;463&#160;00023. Contact&#160;:
              contact@odysseusaudit.fr. Adresse&#160;: 71 ter, allée du Haurat, 33470 Gujan-Mestras,
              France.
            </p>

            <p>Dans les présentes CGV, «&#160;Odysseus&#160;» désigne ce prestataire.</p>

            <h2 id="prestations-cgv">3. Prestations</h2>

            <h3>3.1 Le diagnostic</h3>

            <p>
              Le diagnostic est une analyse automatisée du site désigné dans le devis, restituée
              dans un rapport au format PDF, en français ou en anglais selon le choix du client. Il
              comprend&#160;:
            </p>

            <ul>
              <li>
                les contrôles automatisables liés aux WCAG 2.2 niveau AA et à la norme européenne EN
                301 549, exécutés sur chaque page accessible à l&apos;outil&#160;;
              </li>
              <li>
                la comparaison du HTML envoyé par le serveur avec la page obtenue après exécution du
                JavaScript&#160;;
              </li>
              <li>
                le contrôle de signaux techniques liés aux assistants IA et des en-têtes de sécurité
                du serveur&#160;;
              </li>
              <li>
                des mesures de performance réalisées sur une sélection de pages identifiée dans le
                rapport&#160;;
              </li>
              <li>
                des priorités et des préconisations, chaque constat indiquant la page et
                l&apos;élément concernés.
              </li>
            </ul>

            <p>
              Le contenu détaillé est décrit sur la page{' '}
              <a className="underline" href="/offre">
                Le diagnostic
              </a>{' '}
              et illustré par l&apos;
              <a className="underline" href="/exemple-audit">
                exemple de rapport
              </a>{' '}
              publié sur ce site.
            </p>

            <h3>3.2 La nouvelle vérification</h3>

            <p>
              Après correction de son site, le client ayant reçu un diagnostic peut commander une
              nouvelle vérification. Le même site est analysé à nouveau selon la même méthode et un
              rapport mis à jour est remis.
            </p>

            <h3>3.3 Nature de la prestation</h3>

            <p>
              Ceci est un diagnostic technique, pas un audit RGAA. Il ne produit pas de taux de
              conformité officiel et ne peut pas servir de base à une déclaration
              d&apos;accessibilité.
            </p>

            <h2 id="exclusions-cgv">4. Ce que la prestation ne comprend pas</h2>

            <ul>
              <li>
                Aucune vérification manuelle&#160;: les contrôles automatisés ne détectent
                qu&apos;une partie des obstacles à l&apos;accessibilité et le rapport ne prétend pas
                à l&apos;exhaustivité.
              </li>
              <li>
                Aucun conseil juridique&#160;: le rapport ne se prononce pas sur vos obligations
                juridiques. Il présente les textes et critères susceptibles de concerner votre
                activité, ainsi que les données publiques disponibles sur votre entreprise. La
                détermination de vos obligations juridiques reste du ressort d&apos;un professionnel
                du droit.
              </li>
              <li>
                Aucune intervention sur le site&#160;: Odysseus ne modifie pas le site et
                n&apos;accède pas à son administration. La mise en œuvre des corrections incombe au
                client ou à ses prestataires.
              </li>
              <li>
                Aucune analyse des parties du site qui exigent une connexion, la création d&apos;un
                compte, l&apos;envoi d&apos;un formulaire ou une réservation, ni des services
                hébergés par des tiers en dehors du périmètre indiqué dans le devis.
              </li>
              <li>
                Aucune garantie de résultat quant au positionnement dans les moteurs de recherche, à
                la fréquentation du site ou à sa reprise par un assistant IA.
              </li>
            </ul>

            <h2 id="commande-cgv">5. Commande</h2>

            <p>
              Toute prestation fait l&apos;objet d&apos;un devis écrit qui précise le site analysé,
              la prestation, la langue du rapport, le prix, le délai de remise et la durée de
              validité de l&apos;offre. Le contrat est formé lorsque le client accepte le devis par
              écrit, par signature portant la mention «&#160;Bon pour accord&#160;» ou par un
              message électronique d&apos;acceptation expresse. Cette acceptation emporte celle des
              présentes CGV.
            </p>

            <p>
              Le contrat est constitué du devis accepté et des présentes CGV. En cas de
              contradiction, le devis prévaut.
            </p>

            <h2 id="prix-cgv">6. Prix</h2>

            <p>Les prix sont fixes, exprimés en euros et hors taxes&#160;:</p>

            <ul>
              <li>diagnostic&#160;: 990&#160;€ HT&#160;;</li>
              <li>nouvelle vérification&#160;: 450&#160;€ HT.</li>
            </ul>

            <p>
              Le prix du diagnostic ne dépend ni de la taille du site ni du nombre de constats. Le
              prix applicable est celui du devis accepté. Aucune remise ni réduction de prix
              n&apos;est pratiquée et aucun escompte n&apos;est accordé en cas de paiement anticipé.
            </p>

            <p>
              Odysseus relève de la franchise en base de TVA&#160;: la TVA n&apos;est pas appliquée
              et les devis et factures portent la mention légale correspondante. Si Odysseus devient
              redevable de la TVA, celle-ci s&apos;ajoute au prix hors taxes au taux en vigueur et
              le client en est informé avant toute nouvelle commande.
            </p>

            <h2 id="paiement-cgv">7. Paiement</h2>

            <p>
              Sauf stipulation contraire du devis, le prix est payable en totalité à la commande,
              par virement bancaire ou par carte bancaire au moyen d&apos;un lien de paiement
              sécurisé. Le rapport est remis après réception du paiement.
            </p>

            <p>
              Lorsque le devis prévoit un paiement différé, la somme est due à la date
              d&apos;échéance indiquée sur la facture. Tout retard de paiement entraîne de plein
              droit, dès le lendemain de cette date et sans rappel préalable&#160;:
            </p>

            <ul>
              <li>
                des pénalités de retard calculées au taux d&apos;intérêt appliqué par la Banque
                centrale européenne à son opération de refinancement la plus récente, majoré de 10
                points&#160;;
              </li>
              <li>
                une indemnité forfaitaire pour frais de recouvrement de 40&#160;€ par facture
                (articles L.&#160;441-10 et D.&#160;441-5 du code de commerce), complétée sur
                justificatif lorsque les frais réellement exposés sont supérieurs.
              </li>
            </ul>

            <p>
              En cas de retard de paiement, Odysseus peut suspendre toute prestation en cours
              jusqu&apos;au règlement complet.
            </p>

            <h2 id="execution-cgv">8. Réalisation de l&apos;analyse</h2>

            <p>
              Le client autorise Odysseus à analyser le site désigné dans le devis et garantit
              qu&apos;il en est l&apos;exploitant ou qu&apos;il est habilité à commander cette
              analyse.
            </p>

            <p>
              L&apos;analyse est réalisée par OdysseusBot, qui s&apos;identifie comme tel, respecte
              le fichier robots.txt et limite le rythme de ses requêtes. Il consulte uniquement les
              pages accessibles publiquement, sans créer de compte, remplir de formulaire ni
              effectuer de réservation. Son fonctionnement est décrit sur la page{' '}
              <a className="underline" href="/bot">
                OdysseusBot
              </a>
              .
            </p>

            <p>
              Les pages exclues par le fichier robots.txt, bloquées par un dispositif de protection,
              indisponibles ou en erreur ne peuvent pas être analysées. Le rapport indique le nombre
              de pages recensées, contrôlées et mesurées. Le client peut, s&apos;il le souhaite,
              autoriser OdysseusBot sur son site pour la durée de l&apos;analyse.
            </p>

            <p>
              Le rapport décrit l&apos;état du site à la date de l&apos;analyse, qu&apos;il
              mentionne. Les modifications ultérieures du site ne sont pas couvertes.
            </p>

            <p>
              Les explications, le regroupement et la hiérarchisation des constats sont rédigés avec
              l&apos;aide d&apos;un modèle de langage, à partir des seuls résultats des outils de
              mesure. Le modèle ne peut ajouter aucun constat&#160;: chaque constat du rapport
              repose sur une mesure et renvoie à la page et à l&apos;élément concernés.
            </p>

            <h2 id="remise-cgv">9. Remise du rapport et délais</h2>

            <p>
              Le rapport est transmis par voie électronique. Le délai de remise du diagnostic est
              indiqué dans le devis. La nouvelle vérification est remise sous cinq jours ouvrés. Ces
              délais courent à compter de la réception du paiement.
            </p>

            <p>
              Si le délai est dépassé de plus de quinze jours pour une raison qui ne tient ni au
              client ni à un cas de force majeure, le client peut annuler la commande par écrit et
              obtenir le remboursement intégral des sommes versées.
            </p>

            <h2 id="correction-cgv">10. Vérification et correction du rapport</h2>

            <p>
              Chaque constat indique la page et l&apos;élément concernés afin que le client ou son
              prestataire puisse le vérifier. Pendant trente jours à compter de la remise, le client
              peut signaler par écrit tout constat qu&apos;il estime erroné, en précisant le constat
              concerné. Odysseus l&apos;examine et, si l&apos;erreur provient de l&apos;analyse ou
              du rapport, remet sans frais un rapport corrigé.
            </p>

            <p>
              Un constat devenu inexact parce que le site a été modifié après l&apos;analyse
              n&apos;est pas une erreur du rapport.
            </p>

            <h2 id="annulation-cgv">11. Annulation et rétractation</h2>

            <p>
              Le client peut annuler sa commande par écrit tant que le rapport n&apos;a pas été
              remis. Les sommes versées lui sont alors intégralement remboursées. Une fois le
              rapport remis, la prestation est exécutée et ne peut plus être annulée, sans préjudice
              de l&apos;article 10.
            </p>

            <p>
              Si le site ne peut pas être analysé, notamment parce qu&apos;il est indisponible ou
              bloque l&apos;outil, Odysseus en informe le client et, à défaut de solution, annule la
              commande et rembourse intégralement les sommes versées.
            </p>

            <p>
              Lorsque le contrat est conclu hors établissement avec un professionnel employant cinq
              salariés au plus et que son objet n&apos;entre pas dans le champ de l&apos;activité
              principale de ce dernier, le client bénéficie des dispositions du code de la
              consommation auxquelles renvoie son article L.&#160;221-3, dont le droit de
              rétractation de quatorze jours. Les modalités d&apos;exercice de ce droit lui sont
              alors communiquées avec le devis.
            </p>

            <h2 id="responsabilite-cgv">12. Responsabilité</h2>

            <p>
              Odysseus est tenu d&apos;une obligation de moyens&#160;: réaliser l&apos;analyse et
              rédiger le rapport avec soin, selon la méthode décrite dans les présentes CGV et sur
              ce site.
            </p>

            <p>
              Le client reste seul responsable des décisions qu&apos;il prend à partir du rapport,
              ainsi que des corrections et de leur mise en œuvre par lui-même ou ses prestataires.
              Il lui est recommandé de sauvegarder son site et de tester toute correction avant sa
              mise en ligne.
            </p>

            <p>
              Odysseus n&apos;est pas responsable des obstacles ou défauts que les outils
              automatisés ne permettent pas de détecter, ni des décisions prises par des moteurs de
              recherche, des assistants IA, des autorités ou des juridictions. Odysseus ne répond
              pas des dommages indirects, tels qu&apos;une perte de chiffre d&apos;affaires, de
              clientèle ou d&apos;image.
            </p>

            <p>
              Sauf dol, faute lourde ou disposition légale contraire, la responsabilité totale
              d&apos;Odysseus au titre d&apos;une prestation est limitée au prix payé par le client
              pour cette prestation.
            </p>

            <h2 id="propriete-cgv">13. Propriété intellectuelle et usage du rapport</h2>

            <p>
              Odysseus conserve l&apos;ensemble des droits sur ses outils, sa méthode, ses modèles
              de rapport et ses textes de portée générale.
            </p>

            <p>
              Après paiement complet, le client peut utiliser, reproduire et communiquer le rapport
              pour ses besoins propres, notamment à ses équipes, à ses prestataires et à ses
              conseils, sans limitation de durée. Toute diffusion publique du rapport, en tout ou en
              partie, requiert l&apos;accord écrit préalable d&apos;Odysseus. Le rapport contient
              des informations techniques sur le site, notamment sur sa sécurité, que le client a
              intérêt à ne communiquer qu&apos;aux personnes qui en ont besoin.
            </p>

            <h2 id="confidentialite-cgv">14. Confidentialité et références</h2>

            <p>
              Odysseus garde confidentiels les résultats de l&apos;analyse du site du client et les
              informations que celui-ci lui communique. Odysseus peut utiliser des statistiques
              agrégées issues de ses analyses, à condition qu&apos;elles ne permettent
              d&apos;identifier ni le client ni son site.
            </p>

            <p>
              Odysseus ne cite le nom du client comme référence qu&apos;avec son accord écrit
              préalable.
            </p>

            <h2 id="donnees-cgv">15. Données personnelles</h2>

            <p>
              Odysseus traite, en qualité de responsable de traitement, les coordonnées des
              interlocuteurs du client afin de gérer la commande, la facturation et la relation
              commerciale. Ce traitement repose sur l&apos;exécution du contrat et sur les
              obligations légales d&apos;Odysseus. Ces données sont conservées pendant la relation
              commerciale, et les pièces comptables pendant dix ans conformément à l&apos;article
              L.&#160;123-22 du code de commerce.
            </p>

            <p>
              L&apos;analyse porte sur les pages publiques du site et n&apos;a pas pour objet de
              collecter des données personnelles. Les captures d&apos;écran et extraits de code du
              rapport peuvent toutefois reproduire des informations publiées sur le site. Odysseus
              n&apos;agit pas pour le compte du client à l&apos;égard de ces données.
            </p>

            <p>
              Interviennent comme prestataires techniques&#160;: Hostinger, qui héberge le serveur
              d&apos;analyse&#160;; MongoDB Atlas, qui héberge la base de données en France (AWS
              Paris, eu-west-3)&#160;; Scaleway, qui assure le stockage de fichiers et les
              sauvegardes en France&#160;; et OpenAI, qui fournit le modèle de langage. OpenAI
              reçoit les résultats des outils de mesure, dont les adresses des pages, les éléments
              concernés et de courts extraits de code, ainsi que des images des pages du rapport
              pour en contrôler la mise en page. Il ne reçoit jamais le code HTML complet ni le
              contenu intégral des pages. OpenAI étant établi aux États-Unis, ce transfert est
              encadré par les garanties prévues par le règlement général sur la protection des
              données (RGPD).
            </p>

            <p>
              Chaque personne concernée dispose d&apos;un droit d&apos;accès, de rectification,
              d&apos;effacement, de limitation, d&apos;opposition et de portabilité, qu&apos;elle
              exerce en écrivant à contact@odysseusaudit.fr. Elle peut également introduire une
              réclamation auprès de la CNIL. Les données utilisées pour la prospection sont décrites
              sur la page{' '}
              <a className="underline" href="/confidentialite-prospection">
                Prospection et données personnelles
              </a>
              .
            </p>

            <h2 id="force-majeure-cgv">16. Force majeure</h2>

            <p>
              Aucune partie n&apos;est responsable d&apos;un manquement causé par un cas de force
              majeure au sens de l&apos;article 1218 du code civil. L&apos;exécution est suspendue
              pendant sa durée. Si l&apos;empêchement dure plus de trente jours, chaque partie peut
              résilier le contrat par écrit&#160;; les sommes versées pour une prestation non remise
              sont alors remboursées.
            </p>

            <h2 id="droit-cgv">17. Droit applicable et litiges</h2>

            <p>
              Le contrat est soumis au droit français. Seule la version française des présentes CGV
              fait foi&#160;; toute traduction est fournie à titre d&apos;information.
            </p>

            <p>
              En cas de différend, les parties recherchent d&apos;abord une solution amiable, à
              l&apos;initiative de la partie la plus diligente, par écrit. À défaut d&apos;accord
              dans les trente jours, le litige est porté devant la juridiction française compétente.
            </p>

            <h2 id="divers-cgv">18. Dispositions diverses</h2>

            <p>
              Les CGV applicables sont celles en vigueur à la date d&apos;acceptation du devis.
              Odysseus peut les modifier pour l&apos;avenir&#160;; une modification ne
              s&apos;applique pas à une commande déjà acceptée. La nullité d&apos;une clause
              n&apos;affecte pas les autres. Le fait de ne pas se prévaloir d&apos;une clause ne
              vaut pas renonciation à s&apos;en prévaloir ultérieurement.
            </p>
          </section>
        </div>
      </LanguageSection>

      <LanguageSection lang="en">
        <section className="shell hero pt-0">
          <p className="lede measure mt-5">
            The terms that apply to the Odysseus diagnostic and to the follow-up verification when
            you order them for your business.
          </p>
          <p className="small muted measure mt-3">
            Version in force on 28 September 2026. This is a translation provided for information;
            only the French version is legally binding.
          </p>
        </section>

        <div className="shell section-tight">
          <Contents label="Table of contents" sections={SECTIONS_EN} />

          <section className="prose measure">
            <h2 id="objet-cgv-en">1. Purpose and scope</h2>

            <p>
              These general terms of sale apply to every service ordered from Odysseus. In
              accordance with article L. 441-1 of the French commercial code, they form the basis of
              the commercial relationship and are provided with every quote.
            </p>

            <p>
              Odysseus sells its services to businesses only. By placing an order, the client
              declares that it is acting for the purposes of its business. The client&apos;s own
              general terms of purchase apply only if Odysseus has accepted them in writing.
            </p>

            <h2 id="prestataire-cgv-en">2. Provider</h2>

            <p>
              Odysseus services are provided by Jules Fontaine, sole trader (entrepreneur
              individuel, EI) under the French micro-enterprise scheme. SIREN: 980 766 463. SIRET:
              980 766 463 00023. Contact: contact@odysseusaudit.fr. Address: 71 ter, allée du
              Haurat, 33470 Gujan-Mestras, France.
            </p>

            <p>In these terms, &quot;Odysseus&quot; means this provider.</p>

            <h2 id="prestations-cgv-en">3. Services</h2>

            <h3>3.1 The diagnostic</h3>

            <p>
              The diagnostic is an automated analysis of the website named in the quote, delivered
              as a PDF report in French or English, as the client chooses. It includes:
            </p>

            <ul>
              <li>
                the automatable checks mapped to WCAG 2.2 Level AA and to the European standard EN
                301 549, run on every page the tool can access;
              </li>
              <li>
                a comparison of the HTML sent by the server with the page obtained after JavaScript
                has run;
              </li>
              <li>checks of technical signals for AI assistants and of server security headers;</li>
              <li>performance measurements on a selection of pages identified in the report;</li>
              <li>
                priorities and recommendations, each finding naming the page and element concerned.
              </li>
            </ul>

            <p>
              The full contents are described on{' '}
              <a className="underline" href="/offre">
                The diagnostic
              </a>{' '}
              page and illustrated by the{' '}
              <a className="underline" href="/exemple-audit">
                example report
              </a>{' '}
              published on this site.
            </p>

            <h3>3.2 The follow-up verification</h3>

            <p>
              Once the site has been fixed, a client who has received a diagnostic may order a
              follow-up verification. The same site is analysed again with the same method and an
              updated report is delivered.
            </p>

            <h3>3.3 Nature of the service</h3>

            <p>
              This is a technical diagnostic, not an RGAA audit. It does not produce an official
              conformity rate and cannot serve as the basis for an accessibility statement.
            </p>

            <h2 id="exclusions-cgv-en">4. What the service does not include</h2>

            <ul>
              <li>
                No manual verification: automated checks detect only some accessibility barriers,
                and the report does not claim to be exhaustive.
              </li>
              <li>
                No legal advice: the report does not determine your legal obligations. It sets out
                the texts and criteria that may concern your business, together with the public data
                available about your company. Determining your legal obligations remains a matter
                for a legal professional.
              </li>
              <li>
                No work on the site: Odysseus does not modify the site and does not access its
                administration. Implementing fixes is the responsibility of the client or its
                providers.
              </li>
              <li>
                No analysis of the parts of the site that require logging in, creating an account,
                submitting a form or making a booking, nor of third-party services outside the scope
                stated in the quote.
              </li>
              <li>
                No guaranteed outcome regarding search engine rankings, site traffic or being used
                by an AI assistant.
              </li>
            </ul>

            <h2 id="commande-cgv-en">5. Orders</h2>

            <p>
              Every service is covered by a written quote stating the site analysed, the service,
              the report language, the price, the delivery time and how long the offer remains
              valid. The contract is formed when the client accepts the quote in writing, either by
              signing it with the words &quot;Bon pour accord&quot; or by an email expressly
              accepting it. That acceptance includes acceptance of these terms.
            </p>

            <p>
              The contract consists of the accepted quote and these terms. Where they conflict, the
              quote prevails.
            </p>

            <h2 id="prix-cgv-en">6. Prices</h2>

            <p>Prices are fixed and stated in euros, excluding VAT:</p>

            <ul>
              <li>diagnostic: EUR 990 excl. VAT;</li>
              <li>follow-up verification: EUR 450 excl. VAT.</li>
            </ul>

            <p>
              The price of the diagnostic does not depend on the size of the site or on the number
              of findings. The applicable price is the one in the accepted quote. No discounts or
              price reductions are offered, and no discount is granted for early payment.
            </p>

            <p>
              Odysseus is covered by the French VAT exemption for small businesses (franchise en
              base): VAT is not charged, and quotes and invoices carry the corresponding legal
              statement. If Odysseus becomes liable for VAT, it is added to the price excluding VAT
              at the applicable rate, and the client is informed before any new order.
            </p>

            <h2 id="paiement-cgv-en">7. Payment</h2>

            <p>
              Unless the quote states otherwise, the full price is payable on ordering, by bank
              transfer or by card through a secure payment link. The report is delivered once
              payment has been received.
            </p>

            <p>
              Where the quote provides for deferred payment, the amount is due on the due date shown
              on the invoice. Any late payment automatically incurs, from the day after that date
              and without prior reminder:
            </p>

            <ul>
              <li>
                late payment interest at the rate applied by the European Central Bank to its most
                recent refinancing operation, plus 10 percentage points;
              </li>
              <li>
                a fixed recovery fee of EUR 40 per invoice (articles L. 441-10 and D. 441-5 of the
                French commercial code), supplemented on proof where the recovery costs actually
                incurred are higher.
              </li>
            </ul>

            <p>
              In the event of late payment, Odysseus may suspend any service in progress until
              payment is made in full.
            </p>

            <h2 id="execution-cgv-en">8. Carrying out the analysis</h2>

            <p>
              The client authorises Odysseus to analyse the website named in the quote and warrants
              that it operates that site or is entitled to order this analysis.
            </p>

            <p>
              The analysis is carried out by OdysseusBot, which identifies itself as such, respects
              the robots.txt file and limits the pace of its requests. It visits only publicly
              accessible pages, without creating an account, filling in a form or making a booking.
              How it works is described on the{' '}
              <a className="underline" href="/bot">
                OdysseusBot
              </a>{' '}
              page.
            </p>

            <p>
              Pages excluded by the robots.txt file, blocked by a protection system, unavailable or
              returning an error cannot be analysed. The report states how many pages were
              inventoried, checked and measured. The client may choose to allow OdysseusBot on its
              site for the duration of the analysis.
            </p>

            <p>
              The report describes the site as it was on the date of the analysis, which the report
              states. Later changes to the site are not covered.
            </p>

            <p>
              The explanations, grouping and prioritisation of findings are written with the help of
              a language model, working solely from the results of the measurement tools. The model
              cannot add a finding: every finding in the report rests on a measurement and points to
              the page and element concerned.
            </p>

            <h2 id="remise-cgv-en">9. Report delivery and lead times</h2>

            <p>
              The report is delivered electronically. The delivery time for the diagnostic is stated
              in the quote. The follow-up verification is delivered within five business days. These
              lead times run from receipt of payment.
            </p>

            <p>
              If the lead time is exceeded by more than fifteen days for a reason attributable
              neither to the client nor to force majeure, the client may cancel the order in writing
              and obtain a full refund of the amounts paid.
            </p>

            <h2 id="correction-cgv-en">10. Checking and correcting the report</h2>

            <p>
              Each finding names the page and element concerned so that the client or its provider
              can check it. For thirty days from delivery, the client may report in writing any
              finding it considers incorrect, identifying the finding concerned. Odysseus reviews it
              and, if the error comes from the analysis or the report, delivers a corrected report
              free of charge.
            </p>

            <p>
              A finding that has become inaccurate because the site was changed after the analysis
              is not an error in the report.
            </p>

            <h2 id="annulation-cgv-en">11. Cancellation and withdrawal</h2>

            <p>
              The client may cancel its order in writing until the report has been delivered. The
              amounts paid are then refunded in full. Once the report has been delivered, the
              service has been performed and can no longer be cancelled, without prejudice to
              section 10.
            </p>

            <p>
              If the site cannot be analysed, in particular because it is unavailable or blocks the
              tool, Odysseus informs the client and, if no solution is found, cancels the order and
              refunds the amounts paid in full.
            </p>

            <p>
              Where the contract is concluded off-premises with a business employing five people or
              fewer and its subject falls outside that business&apos;s main activity, the client
              benefits from the provisions of the French consumer code referred to in its article L.
              221-3, including the fourteen-day withdrawal right. How to exercise that right is then
              set out with the quote.
            </p>

            <h2 id="responsabilite-cgv-en">12. Liability</h2>

            <p>
              Odysseus is bound by an obligation of means: to carry out the analysis and write the
              report with care, following the method described in these terms and on this site.
            </p>

            <p>
              The client remains solely responsible for the decisions it takes on the basis of the
              report, and for the fixes and their implementation by itself or its providers. It is
              advised to back up its site and to test any fix before putting it live.
            </p>

            <p>
              Odysseus is not liable for barriers or defects that automated tools cannot detect, nor
              for decisions taken by search engines, AI assistants, authorities or courts. Odysseus
              is not liable for indirect loss, such as loss of revenue, customers or reputation.
            </p>

            <p>
              Except in the case of fraud, gross negligence or where the law provides otherwise,
              Odysseus&apos;s total liability for a service is limited to the price paid by the
              client for that service.
            </p>

            <h2 id="propriete-cgv-en">13. Intellectual property and use of the report</h2>

            <p>
              Odysseus retains all rights in its tools, method, report templates and general-purpose
              texts.
            </p>

            <p>
              Once payment has been made in full, the client may use, reproduce and share the report
              for its own purposes, in particular with its staff, providers and advisers, without
              time limit. Publishing the report, in whole or in part, requires Odysseus&apos;s prior
              written consent. The report contains technical information about the site, including
              its security, which the client should share only with those who need it.
            </p>

            <h2 id="confidentialite-cgv-en">14. Confidentiality and references</h2>

            <p>
              Odysseus keeps confidential the results of the analysis of the client&apos;s site and
              the information the client provides. Odysseus may use aggregate statistics drawn from
              its analyses, provided they identify neither the client nor its site.
            </p>

            <p>
              Odysseus names the client as a reference only with the client&apos;s prior written
              consent.
            </p>

            <h2 id="donnees-cgv-en">15. Personal data</h2>

            <p>
              Odysseus processes, as data controller, the contact details of the client&apos;s
              representatives in order to manage the order, invoicing and the commercial
              relationship. This processing is based on the performance of the contract and on
              Odysseus&apos;s legal obligations. This data is kept for the duration of the
              commercial relationship, and accounting records for ten years in accordance with
              article L. 123-22 of the French commercial code.
            </p>

            <p>
              The analysis covers the public pages of the site and is not intended to collect
              personal data. The screenshots and code excerpts in the report may nevertheless
              reproduce information published on the site. Odysseus does not act on the
              client&apos;s behalf with regard to that data.
            </p>

            <p>
              The following technical providers are involved: Hostinger, which hosts the analysis
              server; MongoDB Atlas, which hosts the database in France (AWS Paris, eu-west-3);
              Scaleway, which provides file storage and backups in France; and OpenAI, which
              provides the language model. OpenAI receives the results of the measurement tools,
              including page addresses, the elements concerned and short code excerpts, as well as
              images of the report pages so that their layout can be checked. It never receives the
              complete HTML or the full content of the pages. As OpenAI is established in the United
              States, this transfer is covered by the safeguards provided for by the General Data
              Protection Regulation (GDPR).
            </p>

            <p>
              Every data subject has the right of access, rectification, erasure, restriction,
              objection and portability, exercised by writing to contact@odysseusaudit.fr, and may
              also lodge a complaint with the CNIL, the French data protection authority. The data
              used for outreach is described on the{' '}
              <a className="underline" href="/confidentialite-prospection">
                Outreach and personal data
              </a>{' '}
              page.
            </p>

            <h2 id="force-majeure-cgv-en">16. Force majeure</h2>

            <p>
              Neither party is liable for a failure caused by force majeure within the meaning of
              article 1218 of the French civil code. Performance is suspended while it lasts. If the
              impediment lasts more than thirty days, either party may terminate the contract in
              writing; amounts paid for a service not delivered are then refunded.
            </p>

            <h2 id="droit-cgv-en">17. Governing law and disputes</h2>

            <p>
              The contract is governed by French law. Only the French version of these terms is
              legally binding; any translation is provided for information.
            </p>

            <p>
              In the event of a dispute, the parties first seek an amicable solution, initiated in
              writing by either party. Failing agreement within thirty days, the dispute is brought
              before the competent French court.
            </p>

            <h2 id="divers-cgv-en">18. Miscellaneous</h2>

            <p>
              The applicable terms are those in force on the date the quote is accepted. Odysseus
              may amend them for the future; an amendment does not apply to an order already
              accepted. If a clause is held invalid, the other clauses remain in effect. Not relying
              on a clause does not waive the right to rely on it later.
            </p>
          </section>
        </div>
      </LanguageSection>
    </main>
  );
}
