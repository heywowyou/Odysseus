/**
 * Fixed remediation copy, one line per scanner rule id, English.
 * See fr.ts for the reasoning; the two files must hold identical key sets,
 * which remediation.test.ts asserts.
 */
export const REMEDIATION_EN: Readonly<Record<string, string>> = {
  'accessibility-statement-missing':
    'Optional best practice outside Article 47: consider publishing an accessibility statement and linking to it from the footer.',
  'alt-text-quality-heuristic':
    'Rewrite the alt text on these images so each one describes what it actually shows. This needs a human read, not an automated fix.',
  'aria-command-name':
    'Give every element carrying an ARIA command role a readable name, either with visible text or an aria-label attribute.',
  'aria-required-children':
    'Fix the ARIA structure: a menu or list role must directly contain the child roles the specification expects.',
  'bootup-time':
    'Reduce JavaScript execution time by deferring scripts that are not essential to the first render.',
  'broken-internal-link':
    'Fix or remove the internal links that no longer lead to an existing page.',
  'button-name':
    'Add visible text inside every button, or an aria-label attribute where the button shows only an icon.',
  'cache-insight':
    'Lengthen the cache lifetime of files that rarely change, such as images, stylesheets, and scripts.',
  'canonical-missing':
    'Declare a canonical URL on every page, pointing at the address you want indexed.',
  'canonical-target-noindex':
    'Point the canonical tag at an indexable page, or remove the exclusion on the page it targets. As it stands the two instructions contradict each other.',
  'canonical-target-unreachable':
    'Fix or remove the canonical tag: it points to a page search engines cannot reach, so it cannot serve as the reference version.',
  'cls-culprits-insight':
    "Reserve space for elements that arrive after the first render, so content stops moving under the visitor's eyes.",
  'color-contrast':
    'Raise the contrast between text and its background to at least 4.5 to 1, or 3 to 1 for large text. Fix the style rule, not each element.',
  'crawlable-anchors':
    'Make these links crawlable: use an a tag with an href attribute rather than an element made clickable by JavaScript.',
  'crux-inp-poor':
    'Reduce the work the browser does when someone clicks or types. These measurements come from your real visitors, not from a simulation.',
  'crux-lcp-poor':
    'Speed up how quickly the largest visible element renders, usually the main image. These measurements come from your real visitors.',
  'cumulative-layout-shift':
    'Stabilise the layout during loading by giving images dimensions and reserving space for banners.',
  'document-latency-insight':
    "Reduce the server's response time for the main document, before the browser can begin rendering anything.",
  'document-title': 'Give every page a unique title tag that describes its own content.',
  'dom-size':
    'Simplify the page structure: a very high element count slows down every layout calculation.',
  'entity-data-incomplete':
    "Complete the business entity's structured data with at least its name, address, and telephone number.",
  'faq-content-without-schema':
    'Add FAQPage structured-data markup to the pages that present questions and answers.',
  'first-contentful-paint':
    'Speed up the first render: reduce what blocks rendering and lighten the server response.',
  'focus-order-mismatch':
    "Align the tab order with the page's visual order by reordering the markup, rather than forcing tabindex values.",
  'font-display': 'Add font-display: swap to your fonts so text stays readable while they load.',
  'font-display-insight':
    'Add font-display: swap to your fonts so text stays readable while they load.',
  'forced-reflow-insight':
    'Group layout reads and writes together in your scripts, to avoid forcing the browser to recalculate everything repeatedly.',
  'form-error-not-associated':
    'Associate each form validation error with its field, using aria-invalid="true" and aria-describedby pointing to the error text, or a role="alert" region. A visual change alone is not perceived by a screen reader.',
  'frame-title':
    'Add a title attribute to every iframe describing what it contains, for example a map or a booking widget.',
  'heading-hierarchy-skip':
    'Rework the heading hierarchy so it descends without skipping a level. Choose the level by structure, not by the size you want.',
  'hreflang-missing':
    'Declare hreflang annotations between the language versions of each page, in both directions.',
  'hreflang-no-return-link':
    'Add the missing return link: each language version must declare all the others, including itself.',
  'html-has-lang':
    'Add a lang attribute to the html tag of every page, set to the language the page is actually written in.',
  'html-structural-validity':
    'Fix the reported markup: duplicate ids, tags closed out of order, and elements placed inside a parent that does not accept them.',
  'image-alt':
    'Add an alt attribute describing every image that carries information. For a purely decorative image, leave alt empty.',
  'image-delivery-insight':
    'Serve these images in a modern format and at the size actually displayed. This is one operation to carry out across all the listed files.',
  interactive:
    'Reduce the time before the page responds to clicks, mainly by lightening the JavaScript run at load time.',
  'is-crawlable':
    'Remove the indexing block from this page if it is meant to appear in search results.',
  'jsonld-invalid':
    'Fix the syntax of the structured-data block: it does not parse as JSON and is therefore ignored entirely.',
  'jsonld-missing':
    'Add a JSON-LD structured-data block describing the business, so search engines and answer assistants can read it.',
  label:
    'Associate a label with every form field, using a label tag tied to the field. Placeholder text inside the field is not enough.',
  'largest-contentful-paint':
    'Speed up the largest visible element, usually the main image: preload it and do not lazy-load it.',
  'largest-contentful-paint-element':
    'Identify the slowest element to render and address it first: it is what the measurement is based on.',
  'layout-shifts':
    'Give images explicit dimensions and reserve space for elements injected after the fact.',
  'lcen-mentions-legales-missing':
    "Publish the company's identifying information on the site, including its SIREN or RCS number. The exact criterion and its source are set out in the legal exposure section.",
  'inp-breakdown-insight':
    'Shorten the delay between a click and the page responding: lighten the code run at the moment of the interaction, and let the browser repaint before any long processing.',
  'lcp-breakdown-insight':
    'Shorten the steps that precede the largest element appearing: server response time, discovery of the image, then loading it.',
  'lcp-discovery-insight':
    'Let the browser discover the main image as early as possible: declare it in the HTML rather than through a script.',
  'lcp-lazy-loaded':
    'Remove lazy loading from the main image: it is visible immediately, and deferring it only delays the page.',
  'legacy-javascript':
    'Stop serving modern browsers the compatibility code meant for old ones: it is downloaded and run for nothing.',
  'legacy-javascript-insight':
    'Stop serving modern browsers the compatibility code meant for old ones: it is downloaded and run for nothing.',
  'link-in-text-block':
    'Distinguish links from surrounding text by something other than colour alone, for example an underline.',
  'link-name':
    'Give every link readable text. For a link that only wraps an image, describing that image in its alt attribute is usually enough.',
  'link-text':
    'Replace generic link labels such as click here or read more with text that describes the destination.',
  'llms-txt-missing':
    'Publish an /llms.txt file at the site root to tell AI answer engines what the site is and how to reference it. A recent convention, not yet a standard: an opportunity rather than a defect.',
  'mainthread-work-breakdown':
    'Reduce the work the browser does at load time: fewer scripts, fewer style recalculations.',
  'max-potential-fid':
    'Break up long JavaScript tasks so the page can still respond to a click while it loads.',
  'meta-description':
    'Add a meta description to every page: it is the text shown under the title in search results.',
  'meta-description-length':
    'Adjust the meta description length so it stays fully readable in search results, around 120 to 160 characters.',
  'meta-title-length':
    'Adjust the page title length so it is not cut off in search results, around 30 to 60 characters.',
  'meta-viewport':
    'Remove user-scalable=no and any maximum-scale limit from the viewport tag, so zooming stays possible.',
  'modern-http-insight':
    'Enable a recent version of the HTTP protocol on your hosting, so files load in parallel.',
  'modern-image-formats':
    'Convert these images to a modern format such as WebP or AVIF. This is one operation to carry out across all the listed files.',
  'multiple-h1': 'Keep a single level-1 heading per page and move the others down to level 2.',
  'nested-interactive':
    'Do not place one clickable control inside another. Move the nested button or link out of its parent.',
  'network-dependency-tree-insight':
    'Shorten chains of cascading requests: every extra level adds a round trip before anything renders.',
  'no-h1': 'Add a level-1 heading describing what the page is about.',
  'noindex-on-public-page':
    'Remove the exclusion instruction from this page if it is meant to appear in search results.',
  'offscreen-images':
    'Lazy-load the images that sit off-screen at first render, while keeping the main image loading immediately.',
  'opengraph-missing':
    'Add Open Graph tags (title, description, image) to control the preview shown when the page is shared on social networks.',
  'prioritize-lcp-image':
    "Preload the page's main image so the browser requests it without waiting.",
  redirects: 'Point links straight at the final address, removing the intermediate redirects.',
  'reflow-horizontal-scroll':
    'Make the layout adapt down to a width of 320 pixels with no horizontal scrolling.',
  'render-blocking-insight':
    'Defer or inline the stylesheets and scripts that block the first render.',
  'render-blocking-resources':
    'Defer or inline the stylesheets and scripts that block the first render.',
  'robots-disallow-broad':
    "Narrow the robots.txt rule: as written it blocks a large share of the site's pages.",
  'robots-txt': 'Fix the robots.txt syntax: as it stands part of its content is ignored.',
  'scrollable-region-focusable':
    'Add tabindex="0" to scrollable areas so they can be reached with a keyboard.',
  'security-header-missing-csp':
    'Add a Content-Security-Policy header to limit which scripts the browser will run on your pages.',
  'security-header-missing-hsts':
    'Add a Strict-Transport-Security header so the browser only ever uses the encrypted connection.',
  'security-header-missing-permissions-policy':
    'Add a Permissions-Policy header declaring which browser features the site uses, such as camera, microphone, or location.',
  'security-header-missing-referrer-policy':
    'Add a Referrer-Policy header to limit the page address the browser passes on to third-party sites.',
  'security-header-missing-x-frame-options':
    "Add an X-Frame-Options header, or the equivalent frame-ancestors directive, to stop the site being displayed inside another site's frame.",
  'select-name':
    'Associate a visible label with every dropdown, or give it an aria-label attribute.',
  'server-response-time':
    "Reduce the server's first response time, through server-side caching or faster hosting.",
  'sitemap-orphan-page':
    "Link to these pages from the site's own navigation, or remove them from the sitemap. A page listed but never linked is hard to reach.",
  'sitemap-stale': 'Regenerate the sitemap so it matches the pages currently published.',
  'speed-index':
    'Speed up how quickly the page fills visually, by addressing render blocking and image weight first.',
  'structured-data-entity-missing':
    'Add structured data identifying the business (type, name, address), so answer assistants can cite it.',
  'structured-data-invalid':
    'Fill in the missing structured-data fields: as it stands Google reads them but cannot use everything it could display.',
  'target-size':
    'Make clickable targets at least 24 pixels across, or space them further apart. This is usually one style rule to fix across a group of controls.',
  'text-missing-from-raw-html':
    'Make the content present in the HTML as served, without waiting for JavaScript to run, through server-side rendering or pre-generated pages.',
  'third-party-data-transfer':
    "Review the third-party providers contacted on page load and remove the ones that are not needed. Each one receives the visitor's IP address.",
  'third-party-facades':
    'Replace heavy third-party widgets such as video, chat, or maps with a clickable image that loads them only on demand.',
  'third-party-summary':
    'Review the third-party scripts being loaded and remove the ones no longer in use.',
  'total-blocking-time':
    'Break up long JavaScript tasks and defer whatever is not needed for the first render.',
  'total-byte-weight':
    'Reduce the total weight downloaded per page, mainly by compressing images and removing unused code.',
  'tracker-request-before-consent':
    'Block these trackers from loading until the visitor has given consent. A request to these domains already transmits their IP address and the page they are on, even with no cookie set.',
  'unminified-css': 'Enable stylesheet minification in your publishing pipeline.',
  'unminified-javascript': 'Enable JavaScript minification in your publishing pipeline.',
  'unsized-images':
    'Add width and height attributes to images so the browser reserves their space before loading them.',
  'unused-css-rules':
    'Remove or split the stylesheets whose bulk is unused on the page being loaded.',
  'unused-javascript': 'Remove or split the scripts whose bulk is unused on the page being loaded.',
  'uses-http2':
    'Enable HTTP/2 on your hosting so files load in parallel rather than one after another.',
  'uses-long-cache-ttl':
    'Lengthen the cache lifetime of static files so returning visitors do not download them again.',
  'uses-optimized-images':
    'Recompress these images at a quality suited to the web. This is one operation to carry out across all the listed files.',
  'uses-rel-preconnect':
    'Declare a preconnect to the third-party domains contacted early during loading.',
  'uses-responsive-images':
    'Serve these images at the dimensions actually displayed, rather than at full resolution resized by the browser.',
  'uses-text-compression': 'Enable compression of text responses, gzip or brotli, on your server.',
  'video-missing-captions': 'Add a captions track to videos carrying speech or meaningful audio.',
};
