/**
 * Issue #213 item 4: the self-audit found no structured data anywhere on
 * the site. This describes Odysseus itself (the company/product), never
 * the hotel vertical Odysseus's own report happens to target when auditing
 * a client - the report's `LodgingBusiness` remediation example is
 * evidence of a report/template context leak and is not valid guidance for
 * this site (see the issue). Every field below matches text already
 * visible on the page (app/layout.tsx's title/description, the footer's
 * contact address in lib/site-chrome.tsx) rather than inventing new facts;
 * legal-identity fields (SIREN/SIRET, registered address) are deliberately
 * left out until issue #213 item 1's canonical business data is available.
 */

const SITE_URL = 'https://www.odysseusaudit.com';
const SITE_NAME = 'Odysseus';
const SITE_DESCRIPTION =
  'Diagnostic technique de site web : accessibilité, référencement, rendu JavaScript, performance et signaux pour assistants IA.';
const CONTACT_EMAIL = 'contact@odysseusaudit.fr';

export function organizationJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    email: CONTACT_EMAIL,
  };
}

export function websiteJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    inLanguage: ['fr', 'en'],
  };
}

/** JSON.stringify with `<` escaped to a non-breaking form, so a value
 *  (however unlikely, given the fields above are all static literals) can
 *  never prematurely close the surrounding `<script>` tag. */
export function escapeJsonForScript(data: unknown): string {
  return JSON.stringify(data).replace(/</gu, '\\u003c');
}

/** Rendered once, site-wide, from the root layout. JSON-LD is valid
 *  anywhere in the document (Google's own structured-data tooling parses
 *  it regardless of `<head>` vs `<body>` placement), so this renders
 *  alongside the rest of the body rather than requiring a custom `<Head>`
 *  mechanism the App Router doesn't use. */
export function StructuredData() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: escapeJsonForScript(organizationJsonLd()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: escapeJsonForScript(websiteJsonLd()) }}
      />
    </>
  );
}
