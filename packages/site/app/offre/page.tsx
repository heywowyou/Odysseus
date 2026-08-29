import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "L'audit complet | Odysseus",
  description: "Ce que couvre l'audit Odysseus, ce qu'il produit, et comment le commander.",
};

/**
 * The offer page a preview links to, milestone 9c plan 009.
 *
 * The preview contract requires an `offer` link on this host, so this page has
 * to exist for a preview to be publishable at all.
 *
 * **The price is published here, by operator decision on 2026-08-29.** The
 * number itself is owned by `ODYSSEUS_FULL_AUDIT_PRICE_EUR_HT` in
 * `packages/core` (trade-off 42), and this page cannot import it: the site
 * deliberately depends on nothing in the workspace. So the figure is repeated
 * as literal text, and `packages/core/src/offer/pricing.test.ts` reads this file
 * and fails if the two ever disagree. The guard lives on the side that owns the
 * number, which is what keeps the site's isolation intact.
 *
 * It also states no legal obligation. Whether any particular rule reaches a
 * given business is exactly the conclusion this project does not draw.
 */
export default function OfferPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mb-8 text-2xl font-bold">L&apos;audit complet</h1>

      <section>
        <p className="mb-4">
          L&apos;aperçu que vous avez peut-être reçu porte sur trois pages au plus et sur ce
          qu&apos;une analyse automatisée peut voir en quelques minutes. L&apos;audit complet est
          autre chose : il parcourt l&apos;ensemble du site.
        </p>

        <h2 className="mb-4 text-xl font-semibold">Ce qu&apos;il couvre</h2>

        <ul className="mb-4 list-disc pl-6">
          <li className="mb-2">
            L&apos;accessibilité, vérifiée contre les critères WCAG 2.2 niveau AA et la norme
            européenne EN 301 549.
          </li>
          <li className="mb-2">
            Le référencement technique, y compris les écarts entre la page brute et la page une fois
            le JavaScript exécuté, qui rendent certains sites en grande partie invisibles aux
            moteurs de recherche.
          </li>
          <li className="mb-2">
            Les performances mesurées de chargement, les données structurées, et les en-têtes de
            sécurité.
          </li>
        </ul>

        <h2 className="mb-4 text-xl font-semibold">Ce que vous recevez</h2>

        <p className="mb-4">
          Un rapport en français et en anglais. Chaque constat renvoie à la page et à l&apos;élément
          concernés, avec une capture d&apos;écran, une explication de ce qui ne va pas et une
          instruction de correction. Rien n&apos;y figure qu&apos;un outil de mesure n&apos;ait
          effectivement détecté : l&apos;analyse explique, hiérarchise et traduit, elle
          n&apos;invente aucun constat.
        </p>

        <p className="mb-4">
          Le rapport reproduit également les critères réglementaires applicables au type
          d&apos;activité et les données publiques du registre des entreprises, sans conclure à leur
          application à votre cas. Cette question relève d&apos;un avocat, et le rapport le dit.
        </p>

        <h2 className="mb-4 text-xl font-semibold">Commander</h2>

        <p className="mb-4">
          Tarif unique et publié : 1&#160;600&#160;€ HT. Il ne dépend ni de la taille du site, ni du
          nombre de constats, et il vous sera confirmé par écrit avant tout engagement. Pour
          commander ou poser une question, écrivez à contact@odysseusaudit.com.
        </p>
      </section>

      <hr className="my-8" />

      <section lang="en">
        <h1 className="mb-8 text-2xl font-bold">The full audit</h1>

        <p className="mb-4">
          The preview you may have received covers at most three pages, and only what an automated
          analysis can see in a few minutes. The full audit is a different thing: it walks the whole
          site.
        </p>

        <h2 className="mb-4 text-xl font-semibold">What it covers</h2>

        <ul className="mb-4 list-disc pl-6">
          <li className="mb-2">
            Accessibility, checked against WCAG 2.2 level AA and the European standard EN 301 549.
          </li>
          <li className="mb-2">
            Technical search visibility, including the gap between the raw page and the page once
            JavaScript has run, which leaves some sites largely invisible to search engines.
          </li>
          <li className="mb-2">
            Measured loading performance, structured data, and security headers.
          </li>
        </ul>

        <h2 className="mb-4 text-xl font-semibold">What you get</h2>

        <p className="mb-4">
          A report in French and English. Every finding points at the page and the element
          concerned, with a screenshot, an explanation of what is wrong, and an instruction for
          fixing it. Nothing appears in it that a measuring tool did not actually detect: the
          analysis explains, prioritises and translates, it invents no findings.
        </p>

        <p className="mb-4">
          The report also reproduces the regulatory criteria that apply to the type of activity, and
          the public business registry data, without concluding that they apply to your case. That
          question is one for a lawyer, and the report says so.
        </p>

        <h2 className="mb-4 text-xl font-semibold">Commissioning it</h2>

        <p className="mb-4">
          One published price: EUR 1,600 excl. VAT. It does not depend on the size of the site or on
          the number of findings, and it is confirmed to you in writing before any commitment. To
          commission an audit or ask a question, write to contact@odysseusaudit.com.
        </p>
      </section>
    </main>
  );
}
