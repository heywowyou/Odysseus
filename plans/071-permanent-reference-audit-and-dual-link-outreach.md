# Plan 071: Publish a permanent reference audit and add it to Touch 1

> **Executor instructions:** implement this plan against the latest main after
> Plans 067 and 069. Rebaseline immediately before implementation. This plan
> creates a new public marketing artifact and deliberately revises the current
> Touch-1 shape from one body link to two. Do not weaken the personalized
> preview's expiry, lineage, suppression, or public-safety rules to build the
> reference audit.

## Status

- **Priority:** P1
- **Effort:** L
- **Depends on:** 067, 069
- **Execution status:** TODO
- **Planning rebaseline:** b9fd6fd4a0d4adc8ffaa24ddbd3199c97f9dce6a
- **Product decision:** approved 2026-09-19

## Objective

Give every first outreach email two complementary pieces of proof:

1. **the prospect's personalized preview** — proves the outreach is based on
   that hotel's actual Full scan;
2. **one permanent full reference audit** — proves exactly what the paid
   deliverable looks like before the prospect buys it.

The two links answer different buyer questions:

- "Is this relevant to my site?" -> personalized preview;
- "What do I actually receive for EUR 990 HT?" -> reference audit.

The reference audit is not another preview, not a client report accidentally
made public, and not a second report-generation product path. It is one curated,
publication-safe showcase artifact rendered through the current paid-report
system, finalized to the same standard as a client delivery, and served forever
behind one stable Odysseus URL.

Target public URL:

    https://www.odysseusaudit.com/exemple-audit

Replacing the PDF behind that route must never invalidate an email already
sent.

## Current seams this plan changes

The latest main establishes several contracts this feature must respect.

1. Plan 069 makes the personalized v3 preview the exact Touch-1 evidence
   document. It is prospect-specific, expires after 30 days, and is bound to
   selected report lineage.
2. docs/rules/outreach-rules.md currently says Touch 1 carries exactly one body
   link: the preview. This plan intentionally changes that to exactly two body
   links: preview plus reference audit.
3. packages/interface/src/outreach/assemble-outreach-draft.ts allowlists the
   exact URLs rendered into the draft, and draft-body-lint.ts rejects tracking
   query parameters and off-domain links.
4. packages/site is intentionally isolated from Mongo/interface imports. The
   public preview route reads opaque artifacts and does not reach into private
   application state.
5. The new client-report-finalizer skill is the canonical pre-delivery
   "no known client-facing defect" workflow for an already-generated report.
   The reference audit should reuse that quality doctrine rather than inventing
   a second review loop.

## Binding decisions

### 1. One stable canonical reference URL

The permanent customer-facing URL is:

    /exemple-audit

It never contains an audit id, source hostname, report id, version id, or
prospect token.

The route serves the currently approved reference PDF. Internal versions may
change indefinitely; the canonical URL does not.

The route is public and shareable, but starts with noindex response metadata.
The marketing site can deliberately make it indexable later if there is a
separate SEO reason to do so.

### 2. The reference artifact is separate from preview publication

Do not extend outreach_previews and do not reuse /apercu/<token>.

The personalized preview remains:

- prospect-specific;
- expiring;
- revocable;
- suppression-aware;
- an opaque stored HTML object;
- tied to a Full scan and selected analysis lineage.

The reference audit is:

- global;
- non-expiring at the canonical URL;
- not tied to a prospect;
- not revoked when one prospect opts out;
- a versioned PDF marketing artifact;
- replaceable atomically behind the same URL.

### 3. No real client identity reaches the public artifact

The reference audit may use one strong stored Full scan as the **semantic
source**, but the public PDF must be rendered from a detached
publication-safe showcase bundle.

Anonymization happens **before HTML/PDF rendering**. Never redact a finished PDF
and call it safe.

The source audit, findings and selected analysis remain immutable. The showcase
builder creates a detached projection with a synthetic public identity such as:

- business name: Hôtel Exemple;
- hostname: www.hotel-exemple.fr;
- synthetic page URLs preserving page roles but not original paths;
- synthetic/omitted registry identity as required by the legal section.

The public report may retain the same categories, severities, finding
relationships, priority order, counts, performance measurements and remediation
substance only where those facts cannot identify the source business.

### 4. Identity-bearing evidence gets a showcase-safe projection

The anonymizer must treat all of these as potentially identifying:

- business, trading and legal names;
- hostname, registrable domain and every raw URL;
- postal address, city/postcode where identifying, phone and email;
- SIREN/SIRET and registry identifiers;
- analytics/tag identifiers;
- page titles and structured-data organization names;
- asset/file names containing brand strings;
- snippets containing source-specific visible text;
- selectors containing business/brand-specific identifiers;
- any screenshot or image captured from the source site;
- PDF metadata and embedded document properties.

URLs are mapped deterministically to synthetic paths that preserve page role
when useful, for example /, /chambres and /reservation.

Selectors/snippets may be generalized only in the detached showcase projection;
the source finding stays untouched.

If the current report renderer ever includes a source screenshot or another
image that cannot be proven publication-safe, the showcase build fails closed.
Do not publish client imagery.

### 5. Legal/company facts belong to the synthetic showcase identity

Do not copy a source hotel's legal identity into a PDF labelled Hôtel Exemple.

The showcase bundle owns its own bounded synthetic company facts. Any
obligation assessment or registry-facing report section is rebuilt from those
facts using the normal deterministic legal logic.

The resulting section must remain internally coherent and must not imply that
the synthetic identity is a real company.

### 6. Transparent anonymization, not fake provenance

The cover or metadata page carries one short deterministic disclosure equivalent
to:

> Exemple de rapport. Les éléments permettant d'identifier l'établissement,
> son site et ses données administratives ont été remplacés. La structure, le
> niveau de détail et le type de constats correspondent au livrable.

Do not claim that Hôtel Exemple is a real client or that the public PDF is an
unaltered customer report.

### 7. Pick the source for showcase quality, not convenience

Before building the artifact, inspect stored Full scans and choose one whose
shape demonstrates the product well.

Minimum source criteria:

- complete Plan-050 Full scan coverage;
- current French report lineage;
- Plan-068 diagnostics complete, or no client limitation that would distract
  from the showcase;
- meaningful findings across at least accessibility, SEO and performance, with
  additional categories preferred when genuinely present;
- enough findings to demonstrate prioritization and the appendix without making
  the document abnormally long;
- usable performance evidence;
- no source-specific visual/evidence dependency that cannot be anonymized
  coherently;
- no known report-generation defect.

Do not rescan a real hotel merely to make the showcase richer. If no stored
audit can satisfy the publication-safety gate without materially distorting the
report, stop and create a separate controlled demo-site strategy rather than
publishing weak anonymization.

### 8. Use the normal report renderer

The showcase PDF must pass through the same report view model, template, CSS,
Paged.js/Chromium print path and deterministic render gates as a normal paid
report.

Do not create a hand-designed marketing PDF that only resembles the product.

A small showcase adapter may provide the detached sanitized input, the
anonymization disclosure and publication metadata. It must not fork report
layout, ranking, findings semantics or remediation logic.

### 9. "Perfect" means the client-finalizer release gate

After deterministic showcase generation, explicitly run the
client-report-finalizer workflow on the exact candidate PDF.

For this marketing artifact, READY-FOR-CLIENT is the minimum publication
standard even though no client receives it directly.

Any systemic defect discovered during finalization is fixed at its owning
source, tested, and the showcase is regenerated. Do not paper over a shared
report bug inside the showcase adapter.

The publication loop ends only after a complete post-change page-by-page pass
finds no known factual, editorial, consistency or rendering defect.

### 10. Versioned object, stable pointer, atomic replacement

Publish immutable internal PDF versions plus one tiny current manifest.

Equivalent storage shape:

    reference-audit/<pdf-sha256>.pdf
    reference-audit/current.json

The private manifest records at least:

- PDF SHA-256;
- publication timestamp;
- report/template/data version;
- anonymizer version;
- reference release version;
- page count;
- release status.

Do not expose the source audit id in the public object name or HTTP response.

Publication order:

1. upload immutable candidate PDF;
2. read it back and verify digest/page count;
3. run public-route smoke checks against the candidate where possible;
4. atomically replace current.json;
5. keep at least the immediately previous approved version for rollback.

A failed publication never moves the pointer.

### 11. The public route streams only the approved current version

Add /exemple-audit in packages/site using the existing site-safe object-reader
boundary or a dedicated equally narrow reader.

The route:

- imports no store/interface/Mongoose code;
- resolves only the fixed current manifest/object prefix;
- serves application/pdf inline;
- uses a stable filename such as exemple-audit-odysseus.pdf;
- sets nosniff and a restrictive referrer policy;
- starts with X-Robots-Tag: noindex, noarchive;
- never logs source lineage;
- does not execute client-side script.

Use bounded cache semantics that let a newly approved version replace the old
one promptly. The exact CDN TTL is an implementation choice, but the acceptance
probe must show that pointer replacement becomes visible without changing the
canonical URL.

### 12. Touch 1 changes from one body link to exactly two

The first email's body order becomes:

1. prospect-specific scan facts;
2. existing conditional impact/legal bridge;
3. personalized preview link;
4. commercial explanation of the paid audit;
5. reference-audit link;
6. reply question.

French-first reference bridge, subject to final copy review:

> Pour voir concrètement le document livré, vous pouvez consulter un exemple
> d'audit complet :

Link label:

> Voir un exemple d'audit complet

English receives an equivalent native translation.

Do not call it a "rapport anonymisé" in the sales sentence. The artifact itself
contains the transparent anonymization disclosure.

Touches 2 and 3 remain link-free exactly as today.

### 13. Reference availability is a Touch-1 prerequisite once enabled

Do not generate a new first-touch draft that promises a reference audit if the
canonical artifact has no approved current manifest.

The actionability/refusal should be typed and operator-readable, for example:

    reference-audit-unavailable

This is a publication/readiness gate, not a reason to rescan the prospect.

### 14. Preserve the existing draft safety rules

The reference URL must be included in the exact allowedUrls set passed to both
text and HTML draft lint.

Keep all existing rules:

- HTTPS only;
- exact approved Odysseus hosts;
- no markdown/markup injection;
- no tracking query parameters;
- no arbitrary href values;
- no remote image/pixel;
- no third-party script or analytics.

The test that rejects utm_*, ref, fbclid and gclid stays green.

### 15. Optional click attribution uses a first-party opaque path, not query tracking

The canonical reference route is always /exemple-audit.

When tracking infrastructure is available, Touch 1 may instead render a
prospect-specific first-party redirect URL such as:

    /exemple-audit/r/<high-entropy-token>

The route records only a bounded request receipt and redirects to the canonical
/exemple-audit URL.

No tracking parameter is added. No cookie, pixel, JavaScript analytics,
fingerprint, third-party service or mail-open tracking is introduced.

### 16. Tracking must never make the report unavailable

Reference-link telemetry is fail-open.

If token minting/persistence is unavailable when creating the draft, use the
canonical /exemple-audit URL and continue. The email still contains a useful
reference report; only attribution is lost.

If the public receipt write fails after a recipient requests a tracked URL,
redirect to /exemple-audit anyway.

Sales collateral availability outranks analytics.

### 17. Keep the public site isolated with a write-only receipt drop box

Do not let /exemple-audit/r/<token> query Mongo.

Reuse the architectural pattern of the public opt-out drop box:

- high-entropy token minted privately;
- only a hash is required for private resolution;
- public route hashes the token;
- public route writes a minimal JSON receipt into a dedicated bucket prefix
  using credentials limited to PutObject on that prefix;
- private interface poller consumes receipts and resolves the hash to the
  outreach link record.

Receipt payload is bounded to values equivalent to:

    tokenHash
    requestedAt
    referenceVersion

Do not store IP address, User-Agent, Referer, email address, hostname or
prospectId in the public receipt.

### 18. Attribution is "link requested", not proof a human read the report

Email-security systems can automatically request links.

The data model and dashboard must not turn an HTTP request into a claim that the
prospect personally read the audit.

Use semantics such as:

- referenceAuditFirstRequestedAt;
- referenceAuditLastRequestedAt;
- referenceAuditRequestCount.

The UI copy must include a short qualification that automated mail-security
checks can trigger the signal.

Do not build bot fingerprinting or invasive classification to make this metric
look cleaner.

### 19. Bounded tracking retention

The tracked URL itself may continue redirecting permanently, but prospect
attribution is retained only for a bounded period.

Default retention target: 90 days from Touch-1 draft creation.

After attribution expires:

- the URL still redirects to /exemple-audit;
- new receipts for that token are discarded from private attribution;
- no prospect event is created.

Suppression/opt-out disables future attribution immediately, without breaking
the destination link.

Record the final retention decision in outreach/privacy doctrine before
shipping.

### 20. Store exact outreach lineage

Extend the first-touch draft/link persistence enough to answer:

- which draft/thread/prospect received the reference link;
- canonical versus tracked link;
- reference release version current when the draft was assembled;
- token hash when tracked;
- first/last request timestamps and aggregate request count.

The draft body remains the exact historical record of what the operator could
send.

On the first accepted request, append a prospect history event such as
reference-audit-requested. Repeated requests update bounded aggregates rather
than flooding prospect history.

### 21. Update the privacy notice before enabling attribution

The current system deliberately avoids pixels, cookies and open analytics.
First-party per-prospect link-request attribution is still outreach personal
data and must be described truthfully.

Before tracked URLs are enabled, update the prospecting privacy copy/doctrine to
state, in plain language:

- that a request to the example-audit link may be recorded;
- why it is recorded (understanding whether the outreach material is useful);
- that no cookie/pixel/third-party tracker is used;
- the retention period;
- that automated mail-security systems may generate requests;
- the existing objection/opt-out route.

Do not bury this as a technical implementation note only.

### 22. Keep reference freshness visible

A perfect showcase becomes misleading if the product evolves while the public
PDF stays old.

The current manifest records the report/template/data/anonymizer versions.
Expose a private dashboard/operator status that can say:

- current;
- stale because report/template/data version changed;
- missing;
- last release date and digest.

Staleness does not break the public URL. It creates an operator work item to
regenerate/finalize/publish a new reference version.

Do not automatically publish a newly generated report.

## Implementation slices

### Slice A — Reference-audit showcase bundle

1. Add a strict reference-audit publication type and deterministic anonymizer.
2. Build the source-derived detached showcase bundle without mutating the
   original audit/findings/analysis.
3. Generate synthetic identity and legal/company facts.
4. Map identifying URLs/selectors/snippets to publication-safe equivalents.
5. Add the deterministic anonymization disclosure.
6. Add a leak guard that derives a denylist from the source artifact and fails
   on any surviving source identifier in render input, HTML, extracted PDF text
   or PDF metadata.
7. Block source screenshots/images unless explicitly transformed into a
   publication-safe synthetic asset.
8. Render through the normal paid-report path.

### Slice B — Finalization and publication

1. Choose one stored source audit using decision 7.
2. Generate the French showcase candidate.
3. Run the client-report-finalizer workflow until READY-FOR-CLIENT.
4. Record a compact reference release note with public digest/version/checklist,
   but no source client identity.
5. Add the immutable object + current-manifest publisher.
6. Add the site-safe /exemple-audit route.
7. Add rollback to the previous approved manifest version.
8. Probe the production route before changing outreach copy.

### Slice C — Dual-link Touch 1

1. Extend the code-owned FR/EN Touch-1 copy with the reference bridge/link.
2. Extend AssembleOutreachDraftOptions with referenceAuditUrl and reference
   release/version metadata as appropriate.
3. Require the approved reference artifact before new Touch-1 assembly.
4. Add the reference URL to exact text/HTML lint allowlists.
5. Preserve two-link body shape exactly; touches 2/3 remain unchanged.
6. Persist the exact reference link/version on the draft.
7. Update actionability/refusal UI for a missing reference artifact.
8. Update docs/rules/outreach-rules.md and any template-lock tests.

### Slice D — Privacy-minimal click attribution

1. Add a high-entropy reference-link token contract and private hash mapping.
2. Add a site-safe /exemple-audit/r/<token> redirect handler.
3. Add a dedicated write-only bucket receipt adapter and least-privilege
   deployment credentials.
4. Add the private receipt poller/consumer.
5. Persist bounded first/last/count aggregates and the first prospect-history
   event.
6. Make opt-out/suppression stop future attribution.
7. Add 90-day expiry/cleanup for the private mapping and consumed receipts.
8. Add dashboard display with the automated-link-check caveat.
9. Update the prospecting privacy page/doctrine before enabling tracked links.
10. Keep canonical-link fallback whenever telemetry is unavailable.

### Slice E — Freshness and operating workflow

1. Compare current reference manifest versions with the shipped report/template/
   data/anonymizer versions.
2. Surface stale/missing/current state privately.
3. Document the operator workflow:
   generate -> leak gate -> render gates -> finalizer -> publish -> production
   probe.
4. Add the reference-audit release check to future material report-design/report-
   writing changes so a stale showcase is visible rather than silently forgotten.

## Anonymization proof contract

The release gate must mechanically prove that no source identity survived.

At minimum, derive and scan for:

- normalized business/legal/trading names and name fragments;
- source hostname/domain and URL-encoded forms;
- email addresses and phone numbers;
- postal/SIREN/SIRET identifiers;
- known social/booking/property identifiers captured in evidence;
- original page URLs and canonical URLs;
- structured-data organization names;
- source-specific CSS ids/classes selected by a configurable denylist builder;
- PDF Title, Author, Subject, Keywords and producer metadata when source-bearing.

Run the leak check against:

1. detached showcase JSON;
2. final HTML;
3. extracted PDF text;
4. PDF metadata;
5. the list of embedded image/object names.

A single hit blocks publication.

Manual finalization then covers semantic/visual leaks a string denylist cannot
prove, especially recognizable branded imagery or prose.

## Focused tests

Tests must prove all of the following.

### Reference artifact

- showcase construction never mutates source audit/findings/analysis;
- source name/domain/address/SIREN/email/phone fixtures are absent from showcase
  JSON, HTML, PDF text and metadata;
- source URL paths are replaced by deterministic synthetic paths;
- source-specific snippet/selector fixtures are generalized without changing
  the source finding;
- legal/registry output uses synthetic showcase facts, not source company facts;
- a source screenshot/image causes refusal unless publication-safe;
- anonymization disclosure is present;
- reference PDF uses the normal report renderer/template;
- normal report generation output is unchanged by adding the showcase adapter;
- current manifest points only to a PDF whose digest matches;
- failed upload/readback never moves current;
- rollback restores the previous approved version;
- /exemple-audit serves the approved PDF with the required headers;
- site package isolation remains green.

### Outreach

- Touch 1 contains exactly two body links plus the existing footer opt-out and
  privacy links;
- link 1 is the exact published personalized preview;
- link 2 is the approved reference audit URL;
- reference copy is French-first and EN parity tests pass;
- missing reference publication gives a typed refusal;
- utm/ref/fbclid/gclid query tracking remains rejected;
- off-domain and unallowlisted href tests remain rejected;
- touches 2 and 3 still contain no body links;
- existing preview lineage/expiry/revocation tests remain unchanged.

### Click attribution

- token is high entropy and private persistence uses its hash;
- public receipt contains no prospectId, email, IP, User-Agent or Referer;
- receipt-write failure still redirects successfully;
- unknown/expired tokens still land on the canonical reference report but do
  not create prospect attribution;
- first accepted receipt records firstRequestedAt and one prospect-history
  event;
- repeated receipts update lastRequestedAt/requestCount without history spam;
- opt-out/suppression disables future attribution;
- attribution expires at the documented retention boundary while redirect
  behavior continues;
- no cookie, pixel, client-side analytics or third-party network request exists;
- dashboard copy says the signal may be caused by automated mail security.

## Acceptance

Use one stored Full scan selected under decision 7. No live hotel rescan is
required.

1. Build the detached showcase bundle.
2. Run the full anonymization leak gate and save its clean result.
3. Render the exact French PDF through the normal report path.
4. Run deterministic PDF/render gates.
5. Run client-report-finalizer and reach READY-FOR-CLIENT.
6. Publish immutable version N and point /exemple-audit to it.
7. Open the canonical production URL on desktop and mobile PDF viewers and
   verify the intended complete PDF is readable.
8. Generate one French and one English synthetic Touch-1 draft and verify:
   - prospect preview link is correct;
   - reference link is present and clearly distinct;
   - footer privacy/opt-out remains intact;
   - no prohibited URL/tracking syntax appears.
9. With tracking enabled in a test/staging path, request the tracked reference
   URL and verify redirect, bounded receipt, private attribution and dashboard
   caveat.
10. Publish approved version N+1, leave the old email untouched, and prove the
    same canonical URL now resolves to N+1.
11. Roll back to N and prove the canonical URL works without changing outreach
    records.

No email is sent as part of acceptance.

## Rollout order

Ship in this order so outreach never contains a dead sales link:

1. showcase/anonymization tooling;
2. finalized approved reference PDF;
3. object publication + canonical public route;
4. production probe;
5. Touch-1 second-link copy and readiness gate;
6. optional tracked redirect/receipt path;
7. privacy notice update;
8. enable tracked URLs;
9. dashboard engagement signal.

The canonical untracked reference link is a valid fallback at every point after
step 4.

## Out of scope

- changing the personalized preview's 30-day expiry;
- tracking preview opens/clicks;
- email-open tracking;
- pixels, cookies, fingerprinting or third-party analytics;
- UTM/ref/fbclid/gclid parameters;
- A/B testing email copy;
- making the reference audit prospect-specific;
- publishing a raw real-client PDF;
- rescanning a hotel solely for the showcase;
- changing report ranking/findings/remediation semantics for marketing;
- automatic report publication after generator changes;
- sending outreach automatically;
- building a client portal or checkout flow.

## Canonical docs to update during implementation

At minimum:

- docs/rules/outreach-rules.md;
- docs/product/odysseus-project-brief.md;
- docs/report/report-design-system.md where the reference-only disclosure/seam
  needs documenting;
- docs/decisions/trade-offs.md;
- the prospecting privacy page/copy and its owning rule doc;
- deploy/runbook.md for the reference object reader and optional write-only
  click-receipt credentials;
- any public-site surface brief covering /exemple-audit.

Do not move implementation detail into canonical rules until the code contract
is real.

## Definition of done

Plan 071 is complete when one permanent Odysseus reference-audit URL serves an
approved, fully anonymized, current French paid-report example; the PDF was
built through the normal report renderer and passed the client-finalizer's full
clean release gate; its source hotel cannot be recovered from public identity,
URLs, snippets, selectors, images, metadata or legal/company facts; the
canonical URL survives artifact replacement; every new Touch-1 draft contains
both the prospect's exact personalized preview and the reference-audit link;
existing outreach safety/preview semantics remain intact; optional click
attribution uses only first-party opaque redirect receipts with bounded
retention and no cookies/pixels/query tracking; and reference freshness is
visible to the operator so the showcase cannot silently drift behind the
product.

## Executable closure contract: requirement-to-proof ledger

| Requirement | Owner/seam | Proof |
| --- | --- | --- |
| stable permanent URL | site reference route + current manifest | replacement/rollback integration test |
| no source identity | showcase anonymizer + leak guard | JSON/HTML/PDF/metadata denylist fixtures |
| no source imagery | showcase evidence projection | image refusal/publication-safe fixture |
| coherent synthetic legal identity | showcase facts -> obligation logic | deterministic synthetic-facts test |
| same paid-report product | existing report renderer | renderer parity/non-fork test |
| perfect showcase release | client-report-finalizer | dated READY-FOR-CLIENT release record |
| atomic publish | reference publisher + manifest | failed-publish and rollback tests |
| Touch 1 has two links | outreach template/assembler | exact link-count FR/EN tests |
| no tracking params/pixels | draft lint + public route | existing tracking-param guards + network/static tests |
| telemetry fail-open | tracked redirect | receipt failure still 3xx test |
| no public DB dependency | site package isolation | package-isolation test |
| bounded click data | receipt schema + mapping store | forbidden-field/retention tests |
| opt-out stops attribution | receipt consumer | suppressed-prospect fixture |
| signal is not overstated | dashboard copy | copy assertion + acceptance review |
| reference freshness visible | manifest/version comparison | stale/current/missing fixtures |
| no prospect rescan | stored-audit acceptance | dated no-rescan acceptance record |
