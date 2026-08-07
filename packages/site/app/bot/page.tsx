export default function BotInfoPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mb-8 text-2xl font-bold">OdysseusBot</h1>

      <section>
        <h2 className="mb-4 text-xl font-semibold">À propos de ce robot</h2>

        <p className="mb-4">
          Odysseus est un outil d&apos;audit technique de sites web.
          S&apos;il visite votre site, c&apos;est dans l&apos;un des deux
          cas suivants : un audit a été commandé pour ce site, ou le site
          a été analysé dans le cadre d&apos;une démarche de prospection
          commerciale (pour identifier des problèmes techniques avant une
          prise de contact).
        </p>

        <p className="mb-4">
          Ce que le robot fait concrètement : il charge vos pages avec et
          sans exécution JavaScript pour détecter les écarts de rendu (un
          problème fréquent sur les sites en React ou Next.js, qui les
          rend invisibles aux moteurs de recherche), et il exécute des
          vérifications automatisées d&apos;accessibilité (axe-core) et de
          performance (Lighthouse).
        </p>

        <p className="mb-4">
          Identification : le user-agent envoyé contient le jeton
          OdysseusBot/1.0. Pour le bloquer, ajoutez ceci à votre
          robots.txt :
        </p>

        <pre className="mb-4 overflow-x-auto rounded bg-black/5 p-4 dark:bg-white/10">
          <code>{"User-agent: OdysseusBot\nDisallow: /"}</code>
        </pre>

        <p className="mb-4">
          Fréquence de requêtes : une requête toutes les 1000 ms au
          minimum. Si votre robots.txt spécifie un Crawl-delay supérieur,
          celui-ci est respecté à la place. Le fichier robots.txt est lu
          avant toute visite, et les pages interdites ne sont jamais
          chargées.
        </p>

        <p className="mb-4">
          Données conservées : le HTML rendu, le texte des pages, et des
          captures d&apos;écran, à des fins d&apos;audit uniquement,
          supprimées automatiquement après 90 jours. Ces données ne sont
          ni vendues ni partagées avec des tiers.
        </p>

        <p>
          Contact : pro@julesfontaine.com — pour toute question, ou pour
          demander le retrait de votre site de toute analyse en cours ou
          future.
        </p>

        <p>
          Mentions légales : entreprise individuelle en cours
          d&apos;immatriculation (auto-entrepreneur, France). Numéro SIREN
          à venir.
        </p>
      </section>

      <hr className="my-8" />

      <section lang="en">
        <h2 className="mb-4 text-xl font-semibold">About this bot</h2>

        <p className="mb-4">
          Odysseus is a website auditing tool. If it visited your site,
          one of two things is happening: an audit was commissioned for
          this site, or the site was scanned as part of prospecting
          research (to identify technical issues before reaching out).
        </p>

        <p className="mb-4">
          What the bot actually does: it loads your pages with and without
          JavaScript execution to detect rendering gaps (a common issue on
          React and Next.js sites, which can make them invisible to
          search engines), and runs automated accessibility checks
          (axe-core) and performance checks (Lighthouse).
        </p>

        <p className="mb-4">
          Identification: the user agent string includes the token
          OdysseusBot/1.0. To block it, add this to your robots.txt:
        </p>

        <pre className="mb-4 overflow-x-auto rounded bg-black/5 p-4 dark:bg-white/10">
          <code>{"User-agent: OdysseusBot\nDisallow: /"}</code>
        </pre>

        <p className="mb-4">
          Request rate: one request every 1000ms at minimum. If your
          robots.txt specifies a stricter Crawl-delay, that value is used
          instead. robots.txt is read before any page is visited, and
          disallowed pages are never loaded.
        </p>

        <p className="mb-4">
          Data retained: rendered HTML, page text, and screenshots, for
          audit purposes only, automatically deleted after 90 days. This
          data is never sold or shared with third parties.
        </p>

        <p>
          Contact: pro@julesfontaine.com, for any question, or to opt your
          site out of any current or future scan.
        </p>

        <p>
          Legal: sole proprietorship in the process of registration
          (auto-entrepreneur, France). SIREN number pending.
        </p>
      </section>
    </main>
  );
}
