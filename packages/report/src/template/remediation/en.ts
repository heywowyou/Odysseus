/**
 * Fixed remediation copy, one line per scanner rule id, English.
 * See fr.ts for the reasoning; the two files must hold identical key sets,
 * which remediation.test.ts asserts.
 */
export const REMEDIATION_EN: Readonly<Record<string, string>> = {
  'accessibility-statement-missing':
    'Optional best practice outside Article 47: consider publishing an accessibility statement and linking to it from the footer.',
  'ai-crawler-blocked':
    'Remove the robots.txt rule that blocks this AI assistant crawler, if you want the site to be citable in its answers.',
  'alt-text-quality-heuristic':
    'Rewrite the alt text on these images so each one describes what it actually shows. This needs a human read, not an automated fix.',
  'area-alt':
    'Add an alt attribute to every clickable area of an image map, describing where the link leads.',
  'aria-allowed-attr':
    "Remove the ARIA attribute this element's role does not accept, or change the role to the one that matches what the component really is.",
  'aria-braille-equivalent':
    'Add the text label matching the braille label, or remove the braille one if it is redundant.',
  'aria-command-name':
    'Give every element carrying an ARIA command role a readable name, either with visible text or an aria-label attribute.',
  'aria-conditional-attr':
    'Remove this ARIA attribute, or put the element in the situation the specification allows it in.',
  'aria-deprecated-role':
    'Replace this deprecated ARIA role with its current equivalent, or with the native HTML element that does the same job.',
  'aria-hidden-body':
    'Remove the aria-hidden attribute set on the page body: as it stands, a screen reader sees no content at all.',
  'aria-hidden-focus':
    'Take elements hidden from screen readers out of the keyboard path with tabindex="-1", or stop hiding them.',
  'aria-input-field-name':
    'Give this input field a name, with a visible label tied to the field or an aria-label attribute.',
  'aria-meter-name':
    'Give this meter a name, so its value is announced together with what it measures.',
  'aria-progressbar-name':
    'Give this progress bar a name, so the percentage announced says what it refers to.',
  'aria-prohibited-attr':
    'Remove this ARIA attribute: it is prohibited on this type of element and causes an incorrect announcement.',
  'aria-required-attr':
    'Add the ARIA attributes this role requires, without which the component is announced incompletely.',
  'aria-required-children':
    'Fix the ARIA structure: a menu or list role must directly contain the child roles the specification expects.',
  'aria-required-parent':
    'Place this element inside the container its role requires, for example an option inside a list.',
  'aria-roledescription':
    'Give this element a role, or remove the role description: with no role, it is never announced.',
  'aria-roles':
    'Correct the ARIA role value: the one given does not exist in the specification, usually a typo.',
  'aria-tab-name': 'Give every tab a name describing the content it leads to.',
  'aria-toggle-field-name':
    'Give this two-state control a name, so the person knows what it switches.',
  'aria-tooltip-name':
    'Give this tooltip accessible text content, otherwise its information is not conveyed.',
  'aria-valid-attr':
    'Correct this ARIA attribute name: it does not exist in the specification, so it is ignored.',
  'aria-valid-attr-value':
    "Correct this ARIA attribute's value, often a reference to an id that is not on the page.",
  'audio-caption':
    'Publish a text transcript of the audio content, or captions when it accompanies a video.',
  'autocomplete-valid':
    'Correct the autocomplete attribute with one of the recognized keywords, so the browser can prefill the field.',
  'avoid-inline-spacing':
    'Remove the letter and line spacing set directly on the element, and handle it in the stylesheet instead.',
  'bf-cache':
    'Remove what stops the page being restored instantly on back navigation, usually a no-store header or an unload event listener.',
  blink: 'Remove the blinking content: no setting makes this effect conform.',
  'bootup-time':
    'Reduce JavaScript execution time by deferring scripts that are not essential to the first render.',
  'broken-internal-link':
    'Fix or remove the internal links that no longer lead to an existing page.',
  'button-name':
    'Add visible text inside every button, or an aria-label attribute where the button shows only an icon.',
  bypass:
    'Add a skip link at the top of the page, or structural landmarks and a level 1 heading, so the content can be reached without going through the menu again.',
  'cache-insight':
    'Lengthen the cache lifetime of files that rarely change, such as images, stylesheets, and scripts.',
  canonical:
    "Correct the canonical tag: it must hold a valid absolute address pointing at the page's reference version.",
  'canonical-conflicting':
    'Declare a single canonical URL per page: while several contradict each other, search engines pick one of them arbitrarily.',
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
  'consent-mechanism-absent':
    'Put a consent mechanism in place on the site, able to hold back the analytics and advertising components until the visitor has accepted them.',
  'cookie-non-essential-before-consent':
    'Delay analytics and advertising cookies until the visitor has made a choice. Only cookies the site needs to function may be written before that.',
  'crawlable-anchors':
    'Make these links crawlable: use an a tag with an href attribute rather than an element made clickable by JavaScript.',
  'crux-cls-poor':
    'Stabilize the layout while the page loads, by sizing images and reserving space for banners. These measurements come from your real visitors.',
  'crux-inp-poor':
    'Reduce the work the browser does when someone clicks or types. These measurements come from your real visitors, not from a simulation.',
  'crux-lcp-poor':
    'Speed up how quickly the largest visible element renders, usually the main image. These measurements come from your real visitors.',
  'css-orientation-lock':
    'Let the page display in both portrait and landscape, without locking the orientation.',
  'cumulative-layout-shift':
    'Stabilise the layout during loading by giving images dimensions and reserving space for banners.',
  'definition-list':
    'Put only terms and their definitions inside a definition list, with nothing else in between.',
  dlitem:
    'Put every term and its definition inside a definition list, so the link between them is kept.',
  'document-latency-insight':
    "Reduce the server's response time for the main document, before the browser can begin rendering anything.",
  'document-title': 'Give every page a unique title tag that describes its own content.',
  'dom-size':
    'Simplify the page structure: a very high element count slows down every layout calculation.',
  'dom-size-insight':
    'Simplify the page structure: a very high element count slows down every layout calculation.',
  'duplicate-id-aria':
    'Make this id unique within the page: a label or ARIA attribute points at it, and the reference becomes ambiguous.',
  'duplicated-javascript-insight':
    'Remove the JavaScript downloaded more than once, usually a library bundled by several scripts.',
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
  'form-field-multiple-labels':
    'Keep a single label per form field, merging the wording where needed.',
  'frame-focusable-content':
    'Put this frame back in the keyboard path, or remove the interactive elements it contains.',
  'frame-title':
    'Add a title attribute to every iframe describing what it contains, for example a map or a booking widget.',
  'frame-title-unique': 'Give each frame a distinct title describing its own content.',
  'heading-hierarchy-skip':
    'Rework the heading hierarchy so it descends without skipping a level. Choose the level by structure, not by the size you want.',
  hreflang:
    "Correct the page's hreflang annotations: each language code must be valid and each declared address complete.",
  'hreflang-invalid':
    'Correct the language or region code in this hreflang annotation: as written it is not recognized, so the annotation is ignored.',
  'hreflang-missing':
    'Declare hreflang annotations between the language versions of each page, in both directions.',
  'hreflang-no-return-link':
    'Add the missing return link: each language version must declare all the others, including itself.',
  'html-has-lang':
    'Add a lang attribute to the html tag of every page, set to the language the page is actually written in.',
  'html-lang-valid': 'Correct the page language code with a recognized code, for example fr or en.',
  'html-structural-validity':
    'Fix the reported markup: duplicate ids, tags closed out of order, and elements placed inside a parent that does not accept them.',
  'html-xml-lang-mismatch':
    "Make the page's two language declarations agree, or keep only one of them.",
  'http-error-status':
    'Restore this page, or redirect it to the address that replaced it, then fix the links still pointing at it.',
  'http-status-code':
    'Restore a normal response for this page: while the server returns an error, it will not be indexed.',
  'image-alt':
    'Add an alt attribute describing every image that carries information. For a purely decorative image, leave alt empty.',
  'image-delivery-insight':
    'Serve these images in a modern format and at the size actually displayed. This is one operation to carry out across all the listed files.',
  'image-legacy-format':
    'Convert these images to a modern format such as WebP or AVIF, at comparable visual quality. This is one operation across the whole list of files.',
  'image-oversized':
    'Serve these images at the size they are actually displayed, rather than at full resolution resized by the browser.',
  'input-button-name': 'Give this form button a label, with a value attribute or visible text.',
  'input-image-alt':
    'Add an alt attribute to this image button, describing the action it triggers rather than the picture.',
  'interaction-to-next-paint':
    "Reduce the delay between a click and the page's visible response, by lightening the code run at interaction time.",
  interactive:
    'Reduce the time before the page responds to clicks, mainly by lightening the JavaScript run at load time.',
  'is-crawlable':
    'Remove the indexing block from this page if it is meant to appear in search results.',
  'jsonld-invalid':
    'Fix the syntax of the structured-data block: it does not parse as JSON and is therefore ignored entirely.',
  'jsonld-missing':
    'Add a JSON-LD structured-data block describing the business, so search engines and answer assistants can read it.',
  'keyboard-trap':
    'Give this element a keyboard way out, such as the Escape key or an accessible close button, instead of intercepting the Tab key that should keep moving focus forward.',
  label:
    'Associate a label with every form field, using a label tag tied to the field. Placeholder text inside the field is not enough.',
  'label-content-name-mismatch':
    "Make the accessible name contain the control's visible text, so voice control works on the label people can see.",
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
  list: 'Put only list items inside a list, moving anything else out of it.',
  listitem: 'Put every list item inside a list element, ul or ol.',
  'llms-txt-missing':
    'Publish an /llms.txt file at the site root to tell AI answer engines what the site is and how to reference it. A recent convention, not yet a standard: an opportunity rather than a defect.',
  'long-tasks':
    'Split long-running work into shorter tasks, so the page keeps responding to clicks while it runs.',
  'mainthread-work-breakdown':
    'Reduce the work the browser does at load time: fewer scripts, fewer style recalculations.',
  marquee: 'Remove the automatic text scrolling and show this content statically.',
  'max-potential-fid':
    'Break up long JavaScript tasks so the page can still respond to a click while it loads.',
  'meta-description':
    'Add a meta description to every page: it is the text shown under the title in search results.',
  'meta-description-length':
    'Adjust the meta description length so it stays fully readable in search results, around 120 to 160 characters.',
  'meta-description-missing':
    'Add a meta description to this page, so you choose the summary shown under the title in search results rather than leaving it to the search engine.',
  'meta-refresh': 'Remove the automatic page refresh, or let the visitor trigger it themselves.',
  'meta-title-length':
    'Adjust the page title length so it is not cut off in search results, around 30 to 60 characters.',
  'meta-title-missing':
    'Give this page a title: it is the label shown in the browser tab and at the head of the search result.',
  'meta-viewport':
    'Remove user-scalable=no and any maximum-scale limit from the viewport tag, so zooming stays possible.',
  'mixed-content':
    'Serve these files over HTTPS like the rest of the page, or remove them: over plain HTTP, browsers either block them or show a security warning.',
  'modern-http-insight':
    'Enable a recent version of the HTTP protocol on your hosting, so files load in parallel.',
  'modern-image-formats':
    'Convert these images to a modern format such as WebP or AVIF. This is one operation to carry out across all the listed files.',
  'multiple-h1': 'Keep a single level-1 heading per page and move the others down to level 2.',
  'nap-phone-mismatch':
    'Bring the phone number in the structured data into line with the one shown to visitors, so both versions agree.',
  'nap-postal-code-mismatch':
    'Bring the postal code in the structured data into line with the address shown to visitors, so both versions agree.',
  'nested-interactive':
    'Do not place one clickable control inside another. Move the nested button or link out of its parent.',
  'network-dependency-tree-insight':
    'Shorten chains of cascading requests: every extra level adds a round trip before anything renders.',
  'no-autoplay-audio':
    'Do not start audio automatically, or provide an accessible stop button from the moment it starts.',
  'no-h1': 'Add a level-1 heading describing what the page is about.',
  'noindex-on-public-page':
    'Remove the exclusion instruction from this page if it is meant to appear in search results.',
  'non-composited-animations':
    'Animate only transform and opacity properties, which the browser can handle without repainting the page.',
  'object-alt':
    'Add a text description to this embedded content, so its information stays available.',
  'offscreen-images':
    'Lazy-load the images that sit off-screen at first render, while keeping the main image loading immediately.',
  'opengraph-missing':
    'Add Open Graph tags (title, description, image) to control the preview shown when the page is shared on social networks.',
  'p-as-heading':
    'Use a real heading element for this text, rather than an enlarged or bold paragraph.',
  'prioritize-lcp-image':
    "Preload the page's main image so the browser requests it without waiting.",
  'redirect-chain-excessive':
    'Shorten the redirect chain by pointing the first address straight at the final destination.',
  redirects: 'Point links straight at the final address, removing the intermediate redirects.',
  'reflow-horizontal-scroll':
    'Make the layout adapt down to a width of 320 pixels with no horizontal scrolling.',
  'render-blocking-insight':
    'Defer or inline the stylesheets and scripts that block the first render.',
  'render-blocking-resources':
    'Defer or inline the stylesheets and scripts that block the first render.',
  'robots-blocks-indexing':
    'Remove the robots.txt rule blocking access to the home page, otherwise the site can disappear from search results.',
  'robots-disallow-broad':
    "Narrow the robots.txt rule: as written it blocks a large share of the site's pages.",
  'robots-txt': 'Fix the robots.txt syntax: as it stands part of its content is ignored.',
  'role-img-alt':
    'Add an accessible description to this element declared as an image, with an aria-label attribute.',
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
  'server-side-image-map':
    'Replace this server-side image map with ordinary links that can be used with a keyboard.',
  'sitemap-missing':
    'Publish a sitemap.xml listing the site pages and declare it in robots.txt, so their discovery does not rest on internal links alone.',
  'sitemap-orphan-page':
    "Link to these pages from the site's own navigation, or remove them from the sitemap. A page listed but never linked is hard to reach.",
  'sitemap-stale': 'Regenerate the sitemap so it matches the pages currently published.',
  'speed-index':
    'Speed up how quickly the page fills visually, by addressing render blocking and image weight first.',
  'structured-data':
    "Validate the page's structured data with a dedicated tool: Lighthouse flags this check without performing it itself.",
  'structured-data-entity-missing':
    'Add structured data identifying the business (type, name, address), so answer assistants can cite it.',
  'structured-data-invalid':
    'Fill in the missing structured-data fields: as it stands Google reads them but cannot use everything it could display.',
  'summary-name': "Give this expandable block's summary a label describing what it contains.",
  'svg-img-alt':
    'Add an accessible description to this vector image, with a title element or an aria-label attribute.',
  'table-fake-caption':
    'Use a real caption element for the table title, instead of an ordinary row.',
  'target-size':
    'Make clickable targets at least 24 pixels across, or space them further apart. This is usually one style rule to fix across a group of controls.',
  'td-has-header': 'Tie every cell in this large table to its row and column headers.',
  'td-headers-attr':
    "Correct these cells' header references: they must point at existing headers in the same table.",
  'text-missing-from-raw-html':
    'Make the content present in the HTML as served, without waiting for JavaScript to run, through server-side rendering or pre-generated pages.',
  'th-has-data-cells':
    'Tie this header to the cells it describes, or treat the table as a layout table if it holds no data.',
  'third-parties-insight':
    'Review the third-party services the page loads and remove the ones that are no longer needed.',
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
  'valid-lang': "Correct this text passage's language code with a recognized code.",
  'video-caption': 'Add a captions track to this video, so its spoken content is accessible.',
  'video-missing-captions': 'Add a captions track to videos carrying speech or meaningful audio.',
  'viewport-insight':
    'Declare a mobile-friendly viewport tag, so the page responds without delay to the first tap.',
  'youtube-tracking-embed':
    'Swap the youtube.com domain for youtube-nocookie.com in the video embed code: the same video is served, without the advertising cookies set on load.',
};
