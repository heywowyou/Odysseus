/**
 * Fixture page for a fictional wine estate. Everything here renders
 * client-side only, and the faults below are seeded on purpose so
 * scanner and normalization tests have a stable, known-bad target.
 * Do not "fix" any of these without also updating whatever test
 * asserts on it.
 *
 * Faults seeded on this page:
 *  - color-contrast (axe): the tasting-note paragraph
 *  - label (axe): the newsletter email input
 *  - image-alt (axe): the hero image
 *  - heading-hierarchy-skip (custom): h1 -> h3, no h2
 *  - meta-description-missing (custom): see index.html
 *  - jsonld-missing (custom): see index.html
 *  - transactional-flow (entity layer): a first-party checkout form
 *    below must be detected (hasTransactionalFlow: true), and the
 *    outbound-only Booking.com link must NOT set it on its own.
 */
export default function App() {
  return (
    <div className="page">
      <header className="page__header">
        <h1>Domaine des Trois Chenes</h1>
      </header>

      <main>
        {/* Fault: image-alt. No alt attribute at all, not even alt="". */}
        <img className="hero" src="/vineyard.svg" />

        {/*
          Fault: heading-hierarchy-skip. Jumps from h1 straight to h3,
          skipping h2. This is a best practice check outside the WCAG
          tags, so axe will not flag it. It will come from a custom
          check later.
        */}
        <h3>Nos vins</h3>
        <p>
          Un domaine familial produisant des vins rouges et blancs depuis trois generations, entre
          Bordeaux et la cote atlantique.
        </p>

        {/*
          Fault: color-contrast. Light gray on white, well under the
          4.5:1 ratio WCAG 2.2 AA requires for normal-size text.
        */}
        <p className="tasting-note">
          Notes de degustation: fruits rouges, une pointe de vanille, finale longue et epicee.
        </p>

        <section className="newsletter" aria-label="Inscription">
          <h3>Restez informe de nos vendanges</h3>
          {/*
            Fault: label. No <label>, no aria-label, no aria-labelledby,
            and no placeholder. A placeholder alone still computes to an
            accessible name, so axe would not flag it. This input has no
            accessible name at all.
          */}
          <form>
            <input type="email" />
            <button type="submit">S'inscrire</button>
          </form>
        </section>

        <section className="reservation" aria-label="Reservation">
          <h3>Reservez une degustation</h3>
          {/*
            Fault seed for the transactional-flow scanner check
            (packages/scanner/src/checks/transactional-flow.ts). A form
            whose action contains "panier" matches the checkout-form
            selector, so this page's hasTransactionalFlow must be true.
          */}
          <form action="/panier">
            <button type="submit">Ajouter au panier</button>
          </form>
          {/*
            Outbound-only link to a third-party booking platform. Must
            NOT set hasTransactionalFlow on its own - only the first-party
            form above should.
          */}
          <a href="https://www.booking.com/hotel/fr/domaine-des-trois-chenes.html">
            Reserver sur Booking.com
          </a>
        </section>
      </main>

      <footer className="page__footer">
        <p>Domaine des Trois Chenes, Route des Vignes, 33000 Bordeaux</p>
        <nav>
          <a href="/about.html">A propos</a>
          <a href="/mentions-legales.html">Mentions legales</a>
          {/* Disallowed by robots.txt; must be discovered but never crawled. */}
          <a href="/private.html">Espace prive</a>
          {/* Non-HTML resource; the crawler must drop it before enqueuing. */}
          <a href="/vineyard.svg">Illustration</a>
        </nav>
      </footer>
    </div>
  );
}
