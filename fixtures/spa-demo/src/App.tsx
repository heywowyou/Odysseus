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
          skipping h2. A common pattern when a page is built by nesting
          components without checking the resulting outline.
        */}
        <h3>Nos vins</h3>
        <p>
          Un domaine familial produisant des vins rouges et blancs depuis
          trois generations, entre Bordeaux et la cote atlantique.
        </p>

        {/*
          Fault: color-contrast. Light gray on white, well under the
          4.5:1 ratio WCAG 2.2 AA requires for normal-size text.
        */}
        <p className="tasting-note">
          Notes de degustation: fruits rouges, une pointe de vanille,
          finale longue et epicee.
        </p>

        <section className="newsletter" aria-label="Inscription">
          <h3>Restez informe de nos vendanges</h3>
          {/*
            Fault: label. No <label>, no aria-label, no aria-labelledby.
            A placeholder is not an accessible name.
          */}
          <form>
            <input type="email" placeholder="Votre email" />
            <button type="submit">S'inscrire</button>
          </form>
        </section>
      </main>

      <footer className="page__footer">
        <p>Domaine des Trois Chenes, Route des Vignes, 33000 Bordeaux</p>
        <nav>
          <a href="/about.html">A propos</a>
          {/* Disallowed by robots.txt; must be discovered but never crawled. */}
          <a href="/private.html">Espace prive</a>
        </nav>
      </footer>
    </div>
  );
}
