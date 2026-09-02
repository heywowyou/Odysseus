/**
 * The homepage. Persuade mode, French first.
 *
 * Every claim here traces to docs/rules/offer-positioning.md and the surface
 * brief. The limit is stated before any strength, per the positioning rule:
 * the sanctioned sentence from offer-positioning.md section 2 leads. No
 * testimonial, no statistic, no urgency, no imagery: none of it exists.
 */
export default function Home() {
  return (
    <main id="contenu" tabIndex={-1} className="mx-auto max-w-2xl flex-1 px-6 py-12">
      <h1 className="mb-6 text-2xl font-bold">
        Un diagnostic technique de votre site web, vérifiable constat par constat
      </h1>

      <div className="mb-10 border-l-2 border-black/20 pl-4 dark:border-white/20">
        <p className="mb-2 font-semibold">La limite, d&apos;abord.</p>
        <p>
          Ceci est un diagnostic technique, pas un audit RGAA. Il ne produit pas de taux de
          conformité officiel et ne peut pas servir de base à une déclaration d&apos;accessibilité.
        </p>
      </div>

      <h2 className="mb-4 text-xl font-semibold">Ce que fait le diagnostic</h2>
      <ul className="mb-8 list-disc pl-6">
        <li className="mb-2">
          L&apos;accessibilité, vérifiée contre les critères WCAG 2.2 niveau AA et la norme
          européenne EN 301 549.
        </li>
        <li className="mb-2">
          Le référencement technique : l&apos;écart entre ce qu&apos;un moteur de recherche lit et
          ce que voit un visiteur, captures d&apos;écran à l&apos;appui.
        </li>
        <li className="mb-2">
          La visibilité dans les réponses des assistants IA, en complément de la recherche
          classique.
        </li>
        <li className="mb-2">
          Les performances de chargement mesurées, les données structurées et les en-têtes de
          sécurité.
        </li>
      </ul>

      <h2 className="mb-4 text-xl font-semibold">Ce que dit le rapport</h2>
      <p className="mb-4">
        Un rapport PDF en français et en anglais, écrit pour un décideur qui n&apos;est pas
        technique. Chaque constat nomme la page et l&apos;élément concernés : votre développeur peut
        le vérifier en quelques secondes.
      </p>
      <p className="mb-8">
        Le rapport est entièrement automatisé : aucune vérification manuelle n&apos;est vendue, à
        aucun niveau. Et il ne conclut pas à vos obligations légales : cette question relève
        d&apos;un avocat, et le rapport le dit.
      </p>

      <h2 className="mb-4 text-xl font-semibold">Tarif</h2>
      <div className="mb-10 rounded border border-black/20 p-6 dark:border-white/20">
        <p className="mb-2 text-2xl font-bold">1&#160;600&#160;€ HT</p>
        <p>
          Tarif unique et publié. Il ne dépend ni de la taille du site, ni du nombre de constats, et
          il vous sera confirmé par écrit avant tout engagement.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <a className="btn-primary" href="/offre">
          Voir l&apos;offre complète
        </a>
        <a className="btn-secondary" href="/bot">
          Le robot OdysseusBot
        </a>
      </div>
    </main>
  );
}
