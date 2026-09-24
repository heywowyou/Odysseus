import type { RemediationEntry } from './snippet.js';

/**
 * Fixed remediation copy, one line per scanner rule id, English, plus a
 * deterministic fix snippet (plan 041 Part A). See fr.ts for the reasoning;
 * the two files must hold identical key sets, which remediation.test.ts
 * asserts. `snippet` is enforced by the type system (RemediationEntry.snippet
 * is non-optional), not a runtime test.
 */
export const REMEDIATION_EN: Readonly<Record<string, RemediationEntry>> = {
  'accessibility-statement-missing': {
    text: 'Optional best practice, except for public bodies and companies with turnover above EUR 250 million (Article 47 of French Law No. 2005-102): consider publishing an accessibility statement and linking to it from the footer.',
    snippet: { kind: 'not-applicable' },
  },
  'ai-crawler-blocked': {
    text: 'Remove the robots.txt rule that blocks this AI assistant crawler, if you want the site to be citable in its answers.',
    snippet: { kind: 'fixed', template: 'User-agent: GPTBot\nAllow: /' },
  },
  'alt-text-quality-heuristic': {
    text: 'Rewrite the alt text on these images so each one describes what it actually shows. This needs a human read, not an automated fix.',
    snippet: { kind: 'fill-in-blank', template: 'alt="<describe what the image actually shows>"' },
  },
  'area-alt': {
    text: 'Add an alt attribute to every clickable area of an image map, describing where the link leads.',
    snippet: { kind: 'fill-in-blank', template: '<area alt="<link destination>" ...>' },
  },
  'aria-allowed-attr': {
    text: "Remove the ARIA attribute this element's role does not accept, or change the role to the one that matches what the component really is.",
    snippet: { kind: 'not-applicable' },
  },
  'aria-braille-equivalent': {
    text: 'Add the text label matching the braille label, or remove the braille one if it is redundant.',
    snippet: {
      kind: 'fill-in-blank',
      template: 'aria-label="<same content as the braille label>"',
    },
  },
  'aria-command-name': {
    text: 'Give every element carrying an ARIA command role a readable name, either with visible text or an aria-label attribute.',
    snippet: { kind: 'fill-in-blank', template: '<button aria-label="<button name>">...</button>' },
  },
  'aria-conditional-attr': {
    text: 'Remove this ARIA attribute, or put the element in the situation the specification allows it in.',
    snippet: { kind: 'not-applicable' },
  },
  'aria-deprecated-role': {
    text: 'Replace this deprecated ARIA role with its current equivalent, or with the native HTML element that does the same job.',
    snippet: { kind: 'not-applicable' },
  },
  'aria-hidden-body': {
    text: 'Remove the aria-hidden attribute set on the page body: as it stands, a screen reader sees no content at all.',
    snippet: { kind: 'fixed', template: '<body>' },
  },
  'aria-hidden-focus': {
    text: 'Take elements hidden from screen readers out of the keyboard path with tabindex="-1", or stop hiding them.',
    snippet: {
      kind: 'fixed',
      template: '<div aria-hidden="true">\n  <a href="..." tabindex="-1">...</a>\n</div>',
    },
  },
  'aria-input-field-name': {
    text: 'Give this input field a name, with a visible label tied to the field or an aria-label attribute.',
    snippet: { kind: 'fill-in-blank', template: '<input aria-label="<field name>">' },
  },
  'aria-meter-name': {
    text: 'Give this meter a name, so its value is announced together with what it measures.',
    snippet: {
      kind: 'fill-in-blank',
      template: '<div role="meter" aria-label="<what this gauge measures>">',
    },
  },
  'aria-progressbar-name': {
    text: 'Give this progress bar a name, so the percentage announced says what it refers to.',
    snippet: {
      kind: 'fill-in-blank',
      template: '<div role="progressbar" aria-label="<name of this progress>">',
    },
  },
  'aria-prohibited-attr': {
    text: 'Remove this ARIA attribute: it is prohibited on this type of element and causes an incorrect announcement.',
    snippet: { kind: 'not-applicable' },
  },
  'aria-required-attr': {
    text: 'Add the ARIA attributes this role requires, without which the component is announced incompletely.',
    snippet: { kind: 'fixed', template: '<div role="switch" aria-checked="false">...</div>' },
  },
  'aria-required-children': {
    text: 'Fix the ARIA structure: a menu or list role must directly contain the child roles the specification expects.',
    snippet: {
      kind: 'fixed',
      template: '<ul role="listbox">\n  <li role="option">...</li>\n</ul>',
    },
  },
  'aria-required-parent': {
    text: 'Place this element inside the container its role requires, for example an option inside a list.',
    snippet: {
      kind: 'fixed',
      template: '<ul role="listbox">\n  <li role="option">...</li>\n</ul>',
    },
  },
  'aria-roledescription': {
    text: 'Give this element a role, or remove the role description: with no role, it is never announced.',
    snippet: { kind: 'not-applicable' },
  },
  'aria-roles': {
    text: 'Correct the ARIA role value: the one given does not exist in the specification, usually a typo.',
    snippet: { kind: 'not-applicable' },
  },
  'aria-tab-name': {
    text: 'Give every tab a name describing the content it leads to.',
    snippet: { kind: 'fill-in-blank', template: '<div role="tab" aria-label="<tab content>">' },
  },
  'aria-toggle-field-name': {
    text: 'Give this two-state control a name, so the person knows what it switches.',
    snippet: {
      kind: 'fill-in-blank',
      template: '<button role="switch" aria-label="<what this control turns on>">',
    },
  },
  'aria-tooltip-name': {
    text: 'Give this tooltip accessible text content, otherwise its information is not conveyed.',
    snippet: { kind: 'fill-in-blank', template: '<div role="tooltip"><your tooltip text></div>' },
  },
  'aria-valid-attr': {
    text: 'Correct this ARIA attribute name: it does not exist in the specification, so it is ignored.',
    snippet: { kind: 'not-applicable' },
  },
  'aria-valid-attr-value': {
    text: "Correct this ARIA attribute's value, often a reference to an id that is not on the page.",
    snippet: { kind: 'not-applicable' },
  },
  'audio-caption': {
    text: 'Publish a text transcript of the audio content, or captions when it accompanies a video.',
    snippet: {
      kind: 'fixed',
      template:
        '<audio controls>\n  <source src="...">\n  <track kind="captions" src="captions.vtt" srclang="en">\n</audio>',
    },
  },
  'autocomplete-valid': {
    text: 'Correct the autocomplete attribute with one of the recognized keywords, so the browser can prefill the field.',
    snippet: { kind: 'fixed', template: '<input type="email" autocomplete="email">' },
  },
  'avoid-inline-spacing': {
    text: 'Remove the letter and line spacing set directly on the element, and handle it in the stylesheet instead.',
    snippet: { kind: 'not-applicable' },
  },
  'bf-cache': {
    text: 'Remove what stops the page being restored instantly on back navigation, usually a no-store header or an unload event listener.',
    snippet: { kind: 'not-applicable' },
  },
  blink: {
    text: 'Remove the blinking content: no setting makes this effect conform.',
    snippet: { kind: 'not-applicable' },
  },
  'bootup-time': {
    text: 'Reduce JavaScript execution time by deferring scripts that are not essential to the first render.',
    snippet: { kind: 'not-applicable' },
  },
  'broken-internal-link': {
    text: 'Fix or remove the internal links that no longer lead to an existing page.',
    snippet: { kind: 'not-applicable' },
  },
  'button-name': {
    text: 'Add visible text inside every button, or an aria-label attribute where the button shows only an icon.',
    snippet: {
      kind: 'fill-in-blank',
      template: '<button aria-label="<button action>"><svg .../></button>',
    },
  },
  bypass: {
    text: 'Add a skip link at the top of the page, or structural landmarks and a level 1 heading, so the content can be reached without going through the menu again.',
    snippet: { kind: 'fixed', template: '<a class="skip-link" href="#main">Skip to content</a>' },
  },
  'cache-insight': {
    text: 'Lengthen the cache lifetime of files that rarely change, such as images, stylesheets, and scripts.',
    snippet: { kind: 'not-applicable' },
  },
  canonical: {
    text: "Correct the canonical tag: it must hold a valid absolute address pointing at the page's reference version.",
    snippet: { kind: 'not-applicable' },
  },
  'canonical-conflicting': {
    text: 'Declare a single canonical URL per page: while several contradict each other, search engines pick one of them arbitrarily.',
    snippet: { kind: 'not-applicable' },
  },
  'canonical-missing': {
    text: 'Declare a canonical URL on every page, pointing at the address you want indexed.',
    snippet: {
      kind: 'fill-in-blank',
      template: '<link rel="canonical" href="<absolute address of this page>">',
    },
  },
  'canonical-target-noindex': {
    text: 'Point the canonical tag at an indexable page, or remove the exclusion on the page it targets. As it stands the two instructions contradict each other.',
    snippet: { kind: 'not-applicable' },
  },
  'canonical-target-unreachable': {
    text: 'Fix or remove the canonical tag: it points to a page search engines cannot reach, so it cannot serve as the reference version.',
    snippet: { kind: 'not-applicable' },
  },
  'cls-culprits-insight': {
    text: "Reserve space for elements that arrive after the first render, so content stops moving under the visitor's eyes.",
    snippet: { kind: 'not-applicable' },
  },
  'color-contrast': {
    text: 'Raise the contrast between text and its background to at least 4.5 to 1, or 3 to 1 for large text. Fix the style rule, not each element.',
    snippet: { kind: 'not-applicable' },
  },
  'consent-mechanism-absent': {
    text: 'Put a consent mechanism in place on the site, able to hold back the analytics and advertising components until the visitor has accepted them.',
    snippet: { kind: 'not-applicable' },
  },
  'cookie-non-essential-before-consent': {
    text: 'Delay analytics and advertising cookies until the visitor has made a choice. Only cookies the site needs to function may be written before that.',
    snippet: { kind: 'not-applicable' },
  },
  'crawlable-anchors': {
    text: 'Make these links crawlable: use an a tag with an href attribute rather than an element made clickable by JavaScript.',
    snippet: { kind: 'fill-in-blank', template: '<a href="<destination address>">link text</a>' },
  },
  'crux-cls-poor': {
    text: 'Stabilize the layout while the page loads, by sizing images and reserving space for banners. These measurements come from field data, not a simulation.',
    snippet: { kind: 'not-applicable' },
  },
  'crux-inp-poor': {
    text: 'Reduce the work the browser does when someone clicks or types. These measurements come from field data, not a simulation.',
    snippet: { kind: 'not-applicable' },
  },
  'crux-lcp-poor': {
    text: 'Speed up how quickly the largest visible element renders, usually the main image. These measurements come from field data.',
    snippet: { kind: 'not-applicable' },
  },
  'css-orientation-lock': {
    text: 'Let the page display in both portrait and landscape, without locking the orientation.',
    snippet: { kind: 'not-applicable' },
  },
  'cumulative-layout-shift': {
    text: 'Stabilise the layout during loading by giving images dimensions and reserving space for banners.',
    snippet: { kind: 'not-applicable' },
  },
  'definition-list': {
    text: 'Put only terms and their definitions inside a definition list, with nothing else in between.',
    snippet: { kind: 'fixed', template: '<dl>\n  <dt>...</dt>\n  <dd>...</dd>\n</dl>' },
  },
  dlitem: {
    text: 'Put every term and its definition inside a definition list, so the link between them is kept.',
    snippet: { kind: 'fixed', template: '<dl>\n  <dt>...</dt>\n  <dd>...</dd>\n</dl>' },
  },
  'document-latency-insight': {
    text: "Reduce the server's response time for the main document, before the browser can begin rendering anything.",
    snippet: { kind: 'not-applicable' },
  },
  'document-title': {
    text: 'Give every page a unique title tag that describes its own content.',
    snippet: { kind: 'fill-in-blank', template: '<title><title describing this page></title>' },
  },
  'dom-size': {
    text: 'Simplify the page structure: a very high element count slows down every layout calculation.',
    snippet: { kind: 'not-applicable' },
  },
  'dom-size-insight': {
    text: 'Simplify the page structure: a very high element count slows down every layout calculation.',
    snippet: { kind: 'not-applicable' },
  },
  'duplicate-id-aria': {
    text: 'Make this id unique within the page: a label or ARIA attribute points at it, and the reference becomes ambiguous.',
    snippet: { kind: 'not-applicable' },
  },
  'duplicated-javascript-insight': {
    text: 'Remove the JavaScript downloaded more than once, usually a library bundled by several scripts.',
    snippet: { kind: 'not-applicable' },
  },
  'entity-data-incomplete': {
    text: "Complete the business entity's structured data with at least its name, address, and telephone number.",
    snippet: {
      kind: 'fill-in-blank',
      template: '"name": "<business name>", "address": {...}, "telephone": "<phone number>"',
    },
  },
  'faq-content-without-schema': {
    text: 'Add FAQPage structured-data markup to the pages that present questions and answers.',
    snippet: {
      kind: 'fill-in-blank',
      template:
        '{ "@type": "FAQPage", "mainEntity": [{ "@type": "Question", "name": "<question>", "acceptedAnswer": { "@type": "Answer", "text": "<answer>" } }] }',
    },
  },
  'first-contentful-paint': {
    text: 'Speed up the first render: reduce what blocks rendering and lighten the server response.',
    snippet: { kind: 'not-applicable' },
  },
  'focus-order-mismatch': {
    text: "Align the tab order with the page's visual order by reordering the markup, rather than forcing tabindex values.",
    snippet: { kind: 'not-applicable' },
  },
  'font-display': {
    text: 'Add font-display: swap to your fonts so text stays readable while they load.',
    snippet: { kind: 'fixed', template: '@font-face { ... font-display: swap; }' },
  },
  'font-display-insight': {
    text: 'Add font-display: swap to your fonts so text stays readable while they load.',
    snippet: { kind: 'fixed', template: '@font-face { ... font-display: swap; }' },
  },
  'forced-reflow-insight': {
    text: 'Group layout reads and writes together in your scripts, to avoid forcing the browser to recalculate everything repeatedly.',
    snippet: { kind: 'not-applicable' },
  },
  'form-error-not-associated': {
    text: 'Associate each form validation error with its field, using aria-invalid="true" and aria-describedby pointing to the error text, or a role="alert" region. A visual change alone is not perceived by a screen reader.',
    snippet: {
      kind: 'fill-in-blank',
      template:
        '<input aria-invalid="true" aria-describedby="err-1">\n<span id="err-1" role="alert"><error message></span>',
    },
  },
  'placeholder-only-label': {
    text: 'Give each field a visible label tied to it with the for attribute, and keep the placeholder for an example value. The placeholder disappears as soon as the visitor starts typing.',
    snippet: {
      kind: 'fill-in-blank',
      template:
        '<label for="field-1"><field name></label>\n<input id="field-1" placeholder="<example>">',
    },
  },
  'form-field-multiple-labels': {
    text: 'Keep a single label per form field, merging the wording where needed.',
    snippet: { kind: 'fixed', template: '<label for="field1">...</label>\n<input id="field1">' },
  },
  'frame-focusable-content': {
    text: 'Put this frame back in the keyboard path, or remove the interactive elements it contains.',
    snippet: { kind: 'not-applicable' },
  },
  'frame-title': {
    text: 'Add a title attribute to every iframe describing what it contains, for example a map or a booking widget.',
    snippet: { kind: 'fill-in-blank', template: '<iframe title="<frame content>" ...>' },
  },
  'frame-title-unique': {
    text: 'Give each frame a distinct title describing its own content.',
    snippet: {
      kind: 'fill-in-blank',
      template: '<iframe title="<this frame\'s own content>" ...>',
    },
  },
  'heading-hierarchy-skip': {
    text: 'Rework the heading hierarchy so it descends without skipping a level. Choose the level by structure, not by the size you want.',
    snippet: { kind: 'not-applicable' },
  },
  hreflang: {
    text: "Correct the page's hreflang annotations: each language code must be valid and each declared address complete.",
    snippet: { kind: 'not-applicable' },
  },
  'hreflang-invalid': {
    text: 'Correct the language or region code in this hreflang annotation: as written it is not recognized, so the annotation is ignored.',
    snippet: { kind: 'not-applicable' },
  },
  'hreflang-target-invalid': {
    text: 'Correct the declared language-version address so it responds as a valid public page on the site.',
    snippet: { kind: 'not-applicable' },
  },
  'hreflang-missing': {
    text: 'Declare hreflang annotations between the language versions of each page, in both directions.',
    snippet: {
      kind: 'fill-in-blank',
      template: '<link rel="alternate" hreflang="fr" href="<address of the French version>">',
    },
  },
  'hreflang-no-return-link': {
    text: 'Add the missing return link: each language version must declare all the others, including itself.',
    snippet: {
      kind: 'fill-in-blank',
      template: '<link rel="alternate" hreflang="en" href="<address of this page>">',
    },
  },
  'html-has-lang': {
    text: 'Add a lang attribute to the html tag of every page, set to the language the page is actually written in.',
    snippet: { kind: 'fixed', template: '<html lang="en">' },
  },
  'html-lang-valid': {
    text: 'Correct the page language code with a recognized code, for example fr or en.',
    snippet: { kind: 'fixed', template: '<html lang="en">' },
  },
  'html-structural-validity': {
    text: 'Fix the reported markup: duplicate ids, tags closed out of order, and elements placed inside a parent that does not accept them.',
    snippet: { kind: 'not-applicable' },
  },
  'html-xml-lang-mismatch': {
    text: "Make the page's two language declarations agree, or keep only one of them.",
    snippet: { kind: 'fixed', template: '<html lang="en" xml:lang="en">' },
  },
  'http-error-status': {
    text: 'Restore this page, or redirect it to the address that replaced it, then fix the links still pointing at it.',
    snippet: { kind: 'not-applicable' },
  },
  'http-status-code': {
    text: 'Restore a normal response for this page: while the server returns an error, it will not be indexed.',
    snippet: { kind: 'not-applicable' },
  },
  'image-alt': {
    text: 'Add an alt attribute describing every image that carries information. For a purely decorative image, leave alt empty.',
    snippet: { kind: 'fill-in-blank', template: 'alt="<what the image shows>"' },
  },
  'image-delivery-insight': {
    text: 'Serve these images in a modern format and at the size actually displayed. This is one operation to carry out across all the listed files.',
    snippet: { kind: 'not-applicable' },
  },
  'image-legacy-format': {
    text: 'Convert these images to a modern format such as WebP or AVIF, at comparable visual quality. This is one operation across the whole list of files.',
    snippet: { kind: 'not-applicable' },
  },
  'image-oversized': {
    text: 'Serve these images at the size they are actually displayed, rather than at full resolution resized by the browser.',
    snippet: { kind: 'not-applicable' },
  },
  'input-button-name': {
    text: 'Give this form button a label, with a value attribute or visible text.',
    snippet: { kind: 'fill-in-blank', template: '<input type="submit" value="<button label>">' },
  },
  'input-image-alt': {
    text: 'Add an alt attribute to this image button, describing the action it triggers rather than the picture.',
    snippet: { kind: 'fill-in-blank', template: '<input type="image" alt="<action triggered>">' },
  },
  'interaction-to-next-paint': {
    text: "Reduce the delay between a click and the page's visible response, by lightening the code run at interaction time.",
    snippet: { kind: 'not-applicable' },
  },
  interactive: {
    text: 'Reduce the time before the page responds to clicks, mainly by lightening the JavaScript run at load time.',
    snippet: { kind: 'not-applicable' },
  },
  'is-crawlable': {
    text: 'Remove the indexing block from this page if it is meant to appear in search results.',
    snippet: { kind: 'not-applicable' },
  },
  'jsonld-invalid': {
    text: 'Fix the syntax of the structured-data block: it does not parse as JSON and is therefore ignored entirely.',
    snippet: { kind: 'not-applicable' },
  },
  'jsonld-missing': {
    text: 'Add a JSON-LD structured-data block describing the business, so search engines and answer assistants can read it.',
    snippet: {
      kind: 'fill-in-blank',
      template:
        '<script type="application/ld+json">{ "@context": "https://schema.org", "@type": "LodgingBusiness", "name": "<name>", "address": {...} }</script>',
    },
  },
  'keyboard-trap': {
    text: 'Give this element a keyboard way out, such as the Escape key or an accessible close button, instead of intercepting the Tab key that should keep moving focus forward.',
    snippet: { kind: 'not-applicable' },
  },
  label: {
    text: 'Associate a label with every form field, using a label tag tied to the field. Placeholder text inside the field is not enough.',
    snippet: {
      kind: 'fill-in-blank',
      template: '<label for="field1"><label text></label>\n<input id="field1">',
    },
  },
  'label-content-name-mismatch': {
    text: "Make the accessible name contain the control's visible text, so voice control works on the label people can see.",
    snippet: { kind: 'not-applicable' },
  },
  'largest-contentful-paint': {
    text: 'Speed up the largest visible element, usually the main image: preload it and do not lazy-load it.',
    snippet: { kind: 'not-applicable' },
  },
  'largest-contentful-paint-element': {
    text: 'Identify the slowest element to render and address it first: it is what the measurement is based on.',
    snippet: { kind: 'not-applicable' },
  },
  'layout-shifts': {
    text: 'Give images explicit dimensions and reserve space for elements injected after the fact.',
    snippet: { kind: 'not-applicable' },
  },
  'lcen-mentions-legales-missing': {
    text: "Publish the company's identifying information on the site, including its SIREN or RCS number. The exact criterion and its source are set out in the legal exposure section. The automated check covers the page reached from the Mentions légales link; legal information may exist elsewhere (an unvisited page, a separate document, or an external provider).",
    snippet: { kind: 'not-applicable' },
  },
  'inp-breakdown-insight': {
    text: 'Shorten the delay between a click and the page responding: lighten the code run at the moment of the interaction, and let the browser repaint before any long processing.',
    snippet: { kind: 'not-applicable' },
  },
  'lcp-breakdown-insight': {
    text: 'Shorten the steps that precede the largest element appearing: server response time, discovery of the image, then loading it.',
    snippet: { kind: 'not-applicable' },
  },
  'lcp-discovery-insight': {
    text: 'Let the browser discover the main image as early as possible: declare it in the HTML rather than through a script.',
    snippet: { kind: 'not-applicable' },
  },
  'lcp-lazy-loaded': {
    text: 'Remove lazy loading from the main image: it is visible immediately, and deferring it only delays the page.',
    snippet: { kind: 'fixed', template: '<img src="..." loading="eager">' },
  },
  'legacy-javascript': {
    text: 'Stop serving modern browsers the compatibility code meant for old ones: it is downloaded and run for nothing.',
    snippet: { kind: 'not-applicable' },
  },
  'legacy-javascript-insight': {
    text: 'Stop serving modern browsers the compatibility code meant for old ones: it is downloaded and run for nothing.',
    snippet: { kind: 'not-applicable' },
  },
  'link-in-text-block': {
    text: 'Distinguish links from surrounding text by something other than colour alone, for example an underline.',
    snippet: { kind: 'fixed', template: 'a { text-decoration: underline; }' },
  },
  'link-name': {
    text: 'Give every link readable text. For a link that only wraps an image, describing that image in its alt attribute is usually enough.',
    snippet: {
      kind: 'fill-in-blank',
      template: '<a href="..."><img alt="<link destination>"></a>',
    },
  },
  'link-text': {
    text: 'Replace generic link labels such as click here or read more with text that describes the destination.',
    snippet: {
      kind: 'fill-in-blank',
      template: '<a href="..."><text describing the destination></a>',
    },
  },
  list: {
    text: 'Put only list items inside a list, moving anything else out of it.',
    snippet: { kind: 'fixed', template: '<ul>\n  <li>...</li>\n</ul>' },
  },
  listitem: {
    text: 'Put every list item inside a list element, ul or ol.',
    snippet: { kind: 'fixed', template: '<ul>\n  <li>...</li>\n</ul>' },
  },
  'llms-txt-missing': {
    text: 'Publish an /llms.txt file at the site root to tell AI answer engines what the site is and how to reference it. A recent convention, not yet a standard: an opportunity rather than a defect.',
    snippet: { kind: 'fill-in-blank', template: '# <site name>\n\n> <brief site description>' },
  },
  'long-tasks': {
    text: 'Split long-running work into shorter tasks, so the page keeps responding to clicks while it runs.',
    snippet: { kind: 'not-applicable' },
  },
  'mainthread-work-breakdown': {
    text: 'Reduce the work the browser does at load time: fewer scripts, fewer style recalculations.',
    snippet: { kind: 'not-applicable' },
  },
  marquee: {
    text: 'Remove the automatic text scrolling and show this content statically.',
    snippet: { kind: 'not-applicable' },
  },
  'max-potential-fid': {
    text: 'Break up long JavaScript tasks so the page can still respond to a click while it loads.',
    snippet: { kind: 'not-applicable' },
  },
  'meta-description': {
    text: 'Add a meta description to every page: it is the text shown under the title in search results.',
    snippet: {
      kind: 'fill-in-blank',
      template: '<meta name="description" content="<page summary>">',
    },
  },
  'meta-description-length': {
    text: 'Adjust the meta description length so it stays fully readable in search results, around 120 to 160 characters.',
    snippet: {
      kind: 'fill-in-blank',
      template: '<meta name="description" content="<120 to 160 character summary>">',
    },
  },
  'meta-description-missing': {
    text: 'Add a meta description to this page, so you choose the summary shown under the title in search results rather than leaving it to the search engine.',
    snippet: {
      kind: 'fill-in-blank',
      template: '<meta name="description" content="<page summary>">',
    },
  },
  'meta-refresh': {
    text: 'Remove the automatic page refresh, or let the visitor trigger it themselves.',
    snippet: { kind: 'not-applicable' },
  },
  'meta-title-length': {
    text: 'Adjust the page title length so it is not cut off in search results, around 30 to 65 characters.',
    snippet: { kind: 'fill-in-blank', template: '<title><title of 30 to 65 characters></title>' },
  },
  'title-not-translated': {
    text: 'Translate the title of each language version of the page: it is the headline shown at the top of the search result in that language.',
    snippet: {
      kind: 'fill-in-blank',
      template: '<title><title written in the page language></title>',
    },
  },
  'meta-title-missing': {
    text: 'Give this page a title: it is the label shown in the browser tab and at the head of the search result.',
    snippet: { kind: 'fill-in-blank', template: '<title><title describing this page></title>' },
  },
  'meta-viewport': {
    text: 'Remove user-scalable=no and any maximum-scale limit from the viewport tag, so zooming stays possible.',
    snippet: {
      kind: 'fixed',
      template: '<meta name="viewport" content="width=device-width, initial-scale=1">',
    },
  },
  'mixed-content': {
    text: 'Serve these files over HTTPS like the rest of the page, or remove them: over plain HTTP, browsers either block them or show a security warning.',
    snippet: { kind: 'not-applicable' },
  },
  'modern-http-insight': {
    text: 'Enable a recent version of the HTTP protocol on your hosting, so files load in parallel.',
    snippet: { kind: 'not-applicable' },
  },
  'modern-image-formats': {
    text: 'Convert these images to a modern format such as WebP or AVIF. This is one operation to carry out across all the listed files.',
    snippet: { kind: 'not-applicable' },
  },
  'multiple-h1': {
    text: 'Keep a single level-1 heading per page and move the others down to level 2.',
    snippet: { kind: 'not-applicable' },
  },
  'nap-phone-mismatch': {
    text: 'Bring the phone number in the structured data into line with the one shown to visitors, so both versions agree.',
    snippet: { kind: 'not-applicable' },
  },
  'nap-postal-code-mismatch': {
    text: 'Bring the postal code in the structured data into line with the address shown to visitors, so both versions agree.',
    snippet: { kind: 'not-applicable' },
  },
  'nested-interactive': {
    text: 'Do not place one clickable control inside another. Move the nested button or link out of its parent.',
    snippet: { kind: 'not-applicable' },
  },
  'network-dependency-tree-insight': {
    text: 'Shorten chains of cascading requests: every extra level adds a round trip before anything renders.',
    snippet: { kind: 'not-applicable' },
  },
  'no-autoplay-audio': {
    text: 'Do not start audio automatically, or provide an accessible stop button from the moment it starts.',
    snippet: { kind: 'fixed', template: '<audio controls src="..."></audio>' },
  },
  'no-h1': {
    text: 'Add a level-1 heading describing what the page is about.',
    snippet: { kind: 'fill-in-blank', template: '<h1><page title></h1>' },
  },
  'noindex-on-public-page': {
    text: 'Remove the exclusion instruction from this page if it is meant to appear in search results.',
    snippet: { kind: 'not-applicable' },
  },
  'non-composited-animations': {
    text: 'Animate only transform and opacity properties, which the browser can handle without repainting the page.',
    snippet: { kind: 'not-applicable' },
  },
  'object-alt': {
    text: 'Add a text description to this embedded content, so its information stays available.',
    snippet: {
      kind: 'fill-in-blank',
      template: '<object><text description of the content></object>',
    },
  },
  'offscreen-images': {
    text: 'Lazy-load the images that sit off-screen at first render, while keeping the main image loading immediately.',
    snippet: { kind: 'not-applicable' },
  },
  'opengraph-missing': {
    text: 'Add Open Graph tags (title, description, image) to control the preview shown when the page is shared on social networks.',
    snippet: {
      kind: 'fill-in-blank',
      template:
        '<meta property="og:title" content="<title>">\n<meta property="og:description" content="<description>">\n<meta property="og:image" content="<image url>">',
    },
  },
  'p-as-heading': {
    text: 'Use a real heading element for this text, rather than an enlarged or bold paragraph.',
    snippet: { kind: 'fixed', template: '<h2>...</h2>' },
  },
  'prioritize-lcp-image': {
    text: "Preload the page's main image so the browser requests it without waiting.",
    snippet: { kind: 'not-applicable' },
  },
  'redirect-chain-excessive': {
    text: 'Shorten the redirect chain by pointing the first address straight at the final destination.',
    snippet: { kind: 'not-applicable' },
  },
  redirects: {
    text: 'Point links straight at the final address, removing the intermediate redirects.',
    snippet: { kind: 'not-applicable' },
  },
  'relative-link-nesting': {
    text: 'Correct the relative link so it points to the intended path without adding an unintended language or directory level.',
    snippet: { kind: 'not-applicable' },
  },
  'reflow-horizontal-scroll': {
    text: 'Make the layout adapt down to a width of 320 pixels with no horizontal scrolling.',
    snippet: { kind: 'not-applicable' },
  },
  'render-blocking-insight': {
    text: 'Defer or inline the stylesheets and scripts that block the first render.',
    snippet: { kind: 'not-applicable' },
  },
  'render-blocking-resources': {
    text: 'Defer or inline the stylesheets and scripts that block the first render.',
    snippet: { kind: 'not-applicable' },
  },
  'robots-blocks-indexing': {
    text: 'Remove the robots.txt rule blocking access to the home page, otherwise the site can disappear from search results.',
    snippet: { kind: 'not-applicable' },
  },
  'robots-disallow-broad': {
    text: "Narrow the robots.txt rule: as written it blocks a large share of the site's pages.",
    snippet: { kind: 'not-applicable' },
  },
  'robots-txt': {
    text: 'Fix the robots.txt syntax: as it stands part of its content is ignored.',
    snippet: { kind: 'not-applicable' },
  },
  'role-img-alt': {
    text: 'Add an accessible description to this element declared as an image, with an aria-label attribute.',
    snippet: {
      kind: 'fill-in-blank',
      template: '<div role="img" aria-label="<image description>">',
    },
  },
  'scrollable-region-focusable': {
    text: 'Add tabindex="0" to scrollable areas so they can be reached with a keyboard.',
    snippet: { kind: 'fixed', template: '<div tabindex="0">...</div>' },
  },
  'security-header-missing-csp': {
    text: 'Add a Content-Security-Policy header to limit which scripts the browser will run on your pages.',
    snippet: { kind: 'fixed', template: "Content-Security-Policy: default-src 'self'" },
  },
  'security-header-missing-hsts': {
    text: 'Add a Strict-Transport-Security header so the browser only ever uses the encrypted connection.',
    snippet: {
      kind: 'fixed',
      template: 'Strict-Transport-Security: max-age=63072000; includeSubDomains',
    },
  },
  'security-header-missing-permissions-policy': {
    text: 'Add a Permissions-Policy header declaring which browser features the site uses, such as camera, microphone, or location.',
    snippet: {
      kind: 'fixed',
      template: 'Permissions-Policy: camera=(), microphone=(), geolocation=()',
    },
  },
  'security-header-missing-referrer-policy': {
    text: 'Add a Referrer-Policy header to limit the page address the browser passes on to third-party sites.',
    snippet: { kind: 'fixed', template: 'Referrer-Policy: strict-origin-when-cross-origin' },
  },
  'security-header-missing-x-frame-options': {
    text: "Add an X-Frame-Options header, or the equivalent frame-ancestors directive, to stop the site being displayed inside another site's frame.",
    snippet: { kind: 'fixed', template: 'X-Frame-Options: SAMEORIGIN' },
  },
  'select-name': {
    text: 'Associate a visible label with every dropdown, or give it an aria-label attribute.',
    snippet: {
      kind: 'fill-in-blank',
      template: '<label for="s1"><label></label>\n<select id="s1">',
    },
  },
  'server-response-time': {
    text: "Reduce the server's first response time, through server-side caching or faster hosting.",
    snippet: { kind: 'not-applicable' },
  },
  'server-side-image-map': {
    text: 'Replace this server-side image map with ordinary links that can be used with a keyboard.',
    snippet: { kind: 'not-applicable' },
  },
  'sitemap-missing': {
    text: 'Publish a sitemap.xml listing the site pages and declare it in robots.txt, so their discovery does not rest on internal links alone.',
    snippet: { kind: 'fill-in-blank', template: '<url><loc><absolute page address></loc></url>' },
  },
  'sitemap-orphan-page': {
    text: "Link to these pages from the site's own navigation, or remove them from the sitemap. A page listed but never linked is hard to reach.",
    snippet: { kind: 'not-applicable' },
  },
  'sitemap-stale': {
    text: 'Regenerate the sitemap so it matches the pages currently published.',
    snippet: { kind: 'not-applicable' },
  },
  'sitemap-lists-redirects': {
    text: 'Replace redirected or off-site sitemap entries with the final canonical URLs that belong to this site.',
    snippet: { kind: 'not-applicable' },
  },
  'sitemap-lists-noindex': {
    text: 'Remove these pages from the sitemap if keeping them out of search results is intended; otherwise, remove the noindex directive.',
    snippet: { kind: 'not-applicable' },
  },
  'speed-index': {
    text: 'Speed up how quickly the page fills visually, by addressing render blocking and image weight first.',
    snippet: { kind: 'not-applicable' },
  },
  'structured-data': {
    text: "Validate the page's structured data with a dedicated tool: Lighthouse flags this check without performing it itself.",
    snippet: { kind: 'not-applicable' },
  },
  'structured-data-entity-missing': {
    text: 'Add structured data identifying the business (type, name, address), so answer assistants can cite it.',
    snippet: {
      kind: 'fill-in-blank',
      template: '"@type": "LodgingBusiness", "name": "<name>", "address": {...}',
    },
  },
  'structured-data-invalid': {
    text: 'Fill in the missing structured-data fields: as it stands Google reads them but cannot use everything it could display.',
    snippet: { kind: 'not-applicable' },
  },
  'summary-name': {
    text: "Give this expandable block's summary a label describing what it contains.",
    snippet: {
      kind: 'fill-in-blank',
      template: '<details><summary><what this section contains></summary>...</details>',
    },
  },
  'svg-img-alt': {
    text: 'Add an accessible description to this vector image, with a title element or an aria-label attribute.',
    snippet: { kind: 'fill-in-blank', template: '<svg><title><image description></title></svg>' },
  },
  'table-fake-caption': {
    text: 'Use a real caption element for the table title, instead of an ordinary row.',
    snippet: {
      kind: 'fill-in-blank',
      template: '<table><caption><table title></caption>...</table>',
    },
  },
  'target-size': {
    text: 'Make clickable targets at least 24 pixels across, or space them further apart. This is usually one style rule to fix across a group of controls.',
    snippet: {
      kind: 'fixed',
      template: '{{selector}} {\n  min-width: 24px;\n  min-height: 24px;\n}',
    },
  },
  'td-has-header': {
    text: 'Tie every cell in this large table to its row and column headers.',
    snippet: { kind: 'fixed', template: '<td headers="h1 h2">' },
  },
  'td-headers-attr': {
    text: "Correct these cells' header references: they must point at existing headers in the same table.",
    snippet: { kind: 'not-applicable' },
  },
  'text-missing-from-raw-html': {
    text: 'Make the content present in the HTML as served, without waiting for JavaScript to run, through server-side rendering or pre-generated pages.',
    snippet: { kind: 'not-applicable' },
  },
  'th-has-data-cells': {
    text: 'Tie this header to the cells it describes, or treat the table as a layout table if it holds no data.',
    snippet: { kind: 'not-applicable' },
  },
  'third-parties-insight': {
    text: 'Review the third-party services the page loads and remove the ones that are no longer needed.',
    snippet: { kind: 'not-applicable' },
  },
  'third-party-data-transfer': {
    text: "Review the third-party providers contacted on page load and remove the ones that are not needed. Each one receives the visitor's IP address.",
    snippet: { kind: 'not-applicable' },
  },
  'third-party-facades': {
    text: 'Replace heavy third-party widgets such as video, chat, or maps with a clickable image that loads them only on demand.',
    snippet: { kind: 'not-applicable' },
  },
  'third-party-summary': {
    text: 'Review the third-party scripts being loaded and remove the ones no longer in use.',
    snippet: { kind: 'not-applicable' },
  },
  'total-blocking-time': {
    text: 'Break up long JavaScript tasks and defer whatever is not needed for the first render.',
    snippet: { kind: 'not-applicable' },
  },
  'total-byte-weight': {
    text: 'Reduce the total weight downloaded per page, mainly by compressing images and removing unused code.',
    snippet: { kind: 'not-applicable' },
  },
  'tracker-request-before-consent': {
    text: 'Block these trackers from loading until the visitor has given consent. A request to these domains already transmits their IP address and the page they are on, even with no cookie set.',
    snippet: { kind: 'not-applicable' },
  },
  'unminified-css': {
    text: 'Enable stylesheet minification in your publishing pipeline.',
    snippet: { kind: 'not-applicable' },
  },
  'unminified-javascript': {
    text: 'Enable JavaScript minification in your publishing pipeline.',
    snippet: { kind: 'not-applicable' },
  },
  'unsized-images': {
    text: 'Add width and height attributes to images so the browser reserves their space before loading them.',
    snippet: {
      kind: 'fill-in-blank',
      template: '<img src="..." width="<real width>" height="<real height>">',
    },
  },
  'unused-css-rules': {
    text: 'Remove or split the stylesheets whose bulk is unused on the page being loaded.',
    snippet: { kind: 'not-applicable' },
  },
  'unused-javascript': {
    text: 'Remove or split the scripts whose bulk is unused on the page being loaded.',
    snippet: { kind: 'not-applicable' },
  },
  'uses-http2': {
    text: 'Enable HTTP/2 on your hosting so files load in parallel rather than one after another.',
    snippet: { kind: 'not-applicable' },
  },
  'uses-long-cache-ttl': {
    text: 'Lengthen the cache lifetime of static files so returning visitors do not download them again.',
    snippet: { kind: 'fixed', template: 'Cache-Control: max-age=31536000, immutable' },
  },
  'uses-optimized-images': {
    text: 'Recompress these images at a quality suited to the web. This is one operation to carry out across all the listed files.',
    snippet: { kind: 'not-applicable' },
  },
  'uses-rel-preconnect': {
    text: 'Declare a preconnect to the third-party domains contacted early during loading.',
    snippet: {
      kind: 'fill-in-blank',
      template: '<link rel="preconnect" href="<third-party domain>">',
    },
  },
  'uses-responsive-images': {
    text: 'Serve these images at the dimensions actually displayed, rather than at full resolution resized by the browser.',
    snippet: { kind: 'not-applicable' },
  },
  'uses-text-compression': {
    text: 'Enable compression of text responses, gzip or brotli, on your server.',
    snippet: { kind: 'not-applicable' },
  },
  'valid-lang': {
    text: "Correct this text passage's language code with a recognized code.",
    snippet: { kind: 'fixed', template: '<span lang="fr">...</span>' },
  },
  'video-caption': {
    text: 'Add a captions track to this video, so its spoken content is accessible.',
    snippet: {
      kind: 'fixed',
      template:
        '<video controls>\n  <source src="...">\n  <track kind="captions" src="captions.vtt" srclang="en">\n</video>',
    },
  },
  'video-missing-captions': {
    text: 'Add a captions track to videos carrying speech or meaningful audio.',
    snippet: {
      kind: 'fixed',
      template:
        '<video controls>\n  <source src="...">\n  <track kind="captions" src="captions.vtt" srclang="en">\n</video>',
    },
  },
  'viewport-insight': {
    text: 'Declare a mobile-friendly viewport tag, so the page responds without delay to the first tap.',
    snippet: {
      kind: 'fixed',
      template: '<meta name="viewport" content="width=device-width, initial-scale=1">',
    },
  },
  'youtube-tracking-embed': {
    text: 'Swap the youtube.com domain for youtube-nocookie.com in the video embed code: the same video is served, without the advertising cookies set on load.',
    snippet: {
      kind: 'fixed',
      template: '<iframe src="https://www.youtube-nocookie.com/embed/..."></iframe>',
    },
  },
};
