# M9 Prospecting Pipeline

Status: design spec, added 2026-08-25, not yet implemented.
Scope: hospitality (hotels) as the first vertical. Restaurants and
e-commerce reuse the same machinery with different sourcing and scoring
inputs.

**Reconciliation note, read before building anything from this doc.**
Milestones 9a (prospect acquisition and qualification) and 9b
(prospecting throughput) already shipped before this document was
written (`qualifyProspect` in `packages/core`, the AFNIC/mentions-legales/
SIREN/Sirene-stock pipeline, `prospects`/`suppressions` collections in
`packages/store`, `odysseus prospect ingest`/`suppress` in `packages/cli`,
a worker-pool `runProspectingJob` in `packages/interface`). This document
was written without reference to that existing implementation, and
originally specified different sourcing inputs and a different package
layout than what had already shipped. Both conflicts are now resolved
(operator decision, 2026-08-25, see section 1 and `m9-technical-spec.md`'s
own reconciliation note): sourcing reuses 9a's existing Sirene/SIREN join
and adds only DATAtourisme and Atout France, not a from-scratch four-source
build; the package layout folds into the existing `core`/`store`/
`interface`/`cli`, no new packages. Sections 0, 4 through 12 (scoring,
prescan, evidence, contact discovery, preview delivery, email
infrastructure, warmup, sequencing, compliance, instrumentation) were
already additive to what 9a/9b shipped and needed no change.

This document also contains legal claims (CNIL positions on tracking
pixels and B2B email, the loi Cazenave phone-prospecting timeline)
pasted from research rather than verified against `docs/obligation-basis.md`'s
sourcing bar. Treat section 10 as a starting point for the balancing-test
document it calls for, not as already-cleared copy - it governs live
outreach behaviour, which is exactly the class of claim
`docs/outreach-rules.md` and `docs/obligation-basis.md` exist to gate.

---

## 0. Sizing: work backwards from delivery capacity

Do this arithmetic before writing any code, because it determines every throughput target below.

| Input | Value | Note |
|---|---|---|
| Full audits deliverable per month, solo | 4 to 6 | includes reply handling, kickoff call, report QA |
| Contacted-to-paid conversion (hypothesis) | 2.5% | untested, see conversion estimate |
| First-touch emails needed per month | 160 to 240 | |
| First-touch emails per working day | 8 to 12 | |
| Total sends per day incl. 2 follow-ups | 20 to 30 | one mailbox handles this |
| Prescans per day if emailing top 5% | 160 to 240 | trivially achievable |
| Prescans per day if emailing top 2% | 400 to 600 | still achievable overnight |

**Conclusion: email volume is the scarce resource, scan volume is free.** Optimise the ratio, not the throughput.

Revisit these numbers after the first 100 real sends. Everything downstream is calibrated to them.

---

## 1. Sourcing

Goal: a `prospects` collection of French hotels with an own domain, enriched with size and quality signals, built entirely from open data. No scraping of Google Maps, no purchased lists.

**Decided 2026-08-25 (operator call):** two of the four sources this
section originally proposed. The test applied was "does this source give
data the others structurally cannot," not volume - more independent
sources without a shared reliable key multiplies join risk (a fuzzy
name+postcode match can merge two different hotels or miss a real
duplicate) faster than it adds coverage, the same caution CLAUDE.md's
own dedupe trade-offs (3, 24, 30) already apply to scanner findings,
applied here to source records instead.

### Sources used

**Sirene, via 9a's existing join.** Do not build a second Sirene fetch.
9a already resolves SIRET, legal name, NAF code, commune, and
`trancheEffectifsEtablissement` through `qualifyProspect`'s existing
pipeline (AFNIC Fichier A, mentions-legales, SIREN, Sirene-stock join).
Reuse that output as the base record this section enriches. NAF stays a
recall filter only, never a qualification predicate. Turnover is absent
from the stock file, so the microenterprise test stays partial and is
never asserted.

**DATAtourisme** (national open tourism data platform, redistributed via data.gouv.fr).
Kept: it is accommodation-typed already (a free recall filter AFNIC's
generic company registry doesn't give you) and frequently carries a
website URL and contact email directly, which is real leverage on
section 5's contact-discovery step for a sector AFNIC/mentions-legales
alone under-serves. Ingest the national flux, filter on accommodation
types, join against the Sirene-based record on SIRET where present, else
on normalised name plus postcode.

**Atout France classification list** (`Liste des hebergements classes`, data.gouv.fr).
Kept: it is the only source of star rating and declared room count, and
section 4's ability-to-pay score is built directly on that signal.
Nothing else in the pipeline has it. Join on SIRET where present, else on
normalised name plus postcode.

### Deferred: OpenStreetMap Overpass

Dropped from the initial build, not rejected outright. It was originally
scoped as "a gap filler... catches establishments missing from
DATAtourisme" - by its own description, coverage insurance rather than a
unique-data source. Section 0's sizing math needs only 8,000 to 15,000
usable records total, which DATAtourisme plus Atout France should clear
on their own without Overpass's extra join complexity (a geodata source
with no shared key to Sirene/SIRET at all, matched purely by coordinates
and name). Revisit only if a real ingest run against the two kept sources
falls meaningfully short of that target, with the actual shortfall
measured before adding a third source to close it.

### Join and dedupe

- Normalise every URL to its registrable domain (eTLD+1). Dedupe on that, not on establishment name.
- One domain serving many SIRETs means a group or a chain. Route those to a separate `groups` queue: different pitch, different price, and they usually have an in-house or agency web team. Do not send them the SMB email.
- Persist provenance per record (source, retrieval date, licence). You will need this to answer a CNIL question about loyal collection, and it costs nothing to store now.

### Target: 8,000 to 15,000 usable French hotel records with an own domain

That is roughly three to five years of outreach at the volumes above. Sourcing is a one-off job with a quarterly refresh, not a continuous system. Do not over-engineer it.

---

## 2. Cheap qualification (no browser)

Runs at thousands per hour. Kills roughly 40% of the list before any Chromium process starts.

Reject or park:
- Domain does not resolve, or homepage returns non-2xx after redirects
- Parked domain, registrar holding page, expired certificate
- Site is a single-page brochure with no reservation path at all (no product to talk about)
- Domain is a booking aggregator subdomain (the hotel has no own site)
- Site already publishes a `declaration d'accessibilite` (they have already bought this; route to a separate `already-engaged` queue rather than delete, they may be a referral or a competitor's client)
- `trancheEffectifsEtablissement` in the 0 to 9 band **and** capacity under 20 rooms: deprioritise, do not delete. Note in the record that the microenterprise test is partial and unresolved. Never write a scope conclusion here.

Store the rejection reason. When conversion data arrives you will want to know whether a filter was throwing away good prospects.

---

## 3. Prescan

**This must be a distinct code path from the full audit, not the full audit with a flag.** Budget 60 to 90 seconds per site, versus minutes for a paid audit.

### What runs

- Playwright, shared Chromium instance, one browser context per site, contexts not browsers
- Maximum 3 pages: homepage, the detected reservation or booking page, one content page
- axe-core on each page
- **No Lighthouse.** Lighthouse via CDP is the throughput killer and you do not need a full report to decide whether to email someone. Collect raw metrics directly: LCP and CLS via `PerformanceObserver`, total transfer size, request count, third-party request count, main-thread blocking time. Lighthouse stays in the paid audit where the client is paying for rigour.
- Transactional flow detector: is there a real booking path, and is it first-party or an embedded third-party engine (Availpro, Reservit, D-EDGE, Mews, SynXis, Cloudbeds)
- Politeness: reuse `CrawlResult.effectiveDelayMs`, honour the 1000ms baseline published on `/bot`, identify as `OdysseusBot/1.0`, respect robots.txt

### Evidence capture

Two screenshots maximum, compressed, because these are the entire outreach asset:

1. **Render diff.** Homepage or booking page rendered normally, next to the same page under a degraded condition that reflects a real visitor: throttled network, or with the third-party booking script blocked, or at 320px viewport. The visual gap is argument A made concrete: revenue they are not seeing.
2. **A single specific failure**, cropped and annotated. A booking form field with no label, a contrast failure on the reserve button, a date picker unreachable by keyboard.

Generic full-page screenshots are worthless in outreach. The crop and the annotation are the product.

### Throughput

6 concurrent contexts on WSL2 at ~90s each is roughly 240/hour. An overnight run covers 1,500 to 2,000 sites. You will never need this much. Run it in batches of 200 to 400 and keep the machine free during the day.

Kill orphaned Chromium after every batch, same discipline as `pgrep -af vite`.

---

## 4. Scoring and selection

The highest-value component in M9. It decides who gets an email.

Two independent scores, both deterministic, never LLM-generated.

### Brokenness score (is there something to say)

Weighted from prescan findings, prioritising failures on the revenue path over failures anywhere:

- Blocking failure in the booking flow (unlabelled field, keyboard trap, focus lost on step change): highest weight
- Contrast or target-size failure on the primary CTA
- Mobile LCP above 4s on the booking page
- Missing or broken structured data on the accommodation entity
- Sitewide alt-text and heading-hierarchy failures: lowest weight, they are common and unpersuasive

A site that is broken everywhere is not a better prospect than a site that is broken precisely where it takes money. Weight accordingly.

### Ability-and-motivation-to-pay score

- **Owns a first-party booking engine, or embeds one it configures itself.** Strongest single signal in the whole model. A hotel that invested in direct booking has already decided direct revenue matters, and is therefore the buyer for a report about direct revenue leaking. Weight this heavily.
- Atout France rating 3 stars and above
- Declared capacity 25 rooms and above
- Sirene employee band 10 and above
- Evidence of recent web spend (site rebuilt in the last 3 years, real photography, a CMS rather than a template)
- Independent rather than affiliated with a group that centralises web

### Selection rule

Email only records in the **top decile of brokenness among those in the top half of ability-to-pay**. Roughly 5% of prescans. If reply rate underperforms, tighten to the top 2% before you consider increasing volume. Volume is the wrong lever at this stage.

### Vendor pattern detection (bonus channel)

When the same third-party booking engine appears with the same failure across many prospects, that is the agency and vendor channel your second, unvalidated revenue line was meant for. Log booking-engine fingerprints per prescan and surface recurring vendor-level defects. One good vendor finding is worth more than fifty SMB emails, and it costs nothing extra to collect.

---

## 5. Contact discovery

- Fetch `mentions legales` (French sites are required to publish one under LCEN, so coverage is high). Extract legal name, SIRET, publication director, and often a direct email. This also cross-validates the Sirene join.
- Fetch the contact page and footer for `mailto:` links.
- Prefer a nominative professional address (`prenom.nom@hotel.fr`, `direction@`) over a generic one. Both are workable: the CNIL treats a nominative email on a professional domain as B2B, and a purely generic `contact@` is not personal data in the same sense at all.
- **Do not use pattern-guessing plus SMTP verification tools.** They burn sending reputation and the collection is harder to defend as loyal.
- Run syntax, MX, and catch-all verification before any send. Keep hard bounce rate under 2%. One bad batch undoes weeks of warmup.
- No email found after all of the above: park the record. Do not guess.

---

## 6. Preview delivery without attachments

### The design

No attachment, no images in the email body, not even a logo. One link, to a personalised preview page on your own domain.

`https://odysseusaudit.com/apercu/{opaque-token}`

The page carries what a PDF would have carried: the two evidence screenshots, three to five concrete findings, and the render diff framing. It states criteria and observations only. No legal scope conclusion, no prevalence or population statistics, consistent with existing outreach rules.

### Why this beats an attachment

An unsolicited attachment from an unknown sender is close to a guaranteed spam classification, and a PDF from a stranger is close to a guaranteed non-open even when it lands. A single link to a page on a real, resolvable, WHOIS-consistent domain is normal cold email behaviour. It also gives you a genuine engagement signal without a pixel.

### Hosting

Generate a static HTML file plus compressed images per prospect at prescan time, push to object storage (Vercel Blob or Cloudflare R2), and serve under `odysseusaudit.com/apercu/*` via a rewrite. No redeploy per prospect, no database dependency from the public edge.

- `X-Robots-Tag: noindex, nofollow` and `Disallow: /apercu/` in robots.txt
- Opaque high-entropy token, not sequential, not derived from the domain
- **Zero cookies, zero analytics scripts, zero third-party embeds on this page.** The absence of any terminal read operation keeps the engagement signal on much safer ground than a pixel. Your signal is a server log line for a URL the recipient chose to open.
- Expire at 30 days, then serve 410 with a short page offering to regenerate. Aligns with the 90-day deletion policy already published on `/bot`.
- Link the privacy notice and the one-click opt-out from the preview page footer as well as from the email.

### The paid deliverable stays a PDF

The link approach is for cold contact only. Once someone replies, send the full report however they want it.

---

## 7. Email infrastructure

### Domain separation

**Do not send cold email from `odysseusaudit.com`.** That domain hosts the preview pages, and spam filters judge the reputation of domains linked in a message. If the sending domain gets burned, and the link domain is the same domain, both die together.

Recommended: send from `odysseusaudit.fr`, which you already own. It is already registered and aged, which is worth real money in deliverability terms. Adding MX and DKIM records does not conflict with the existing 308 web redirect; A/CNAME and MX are independent.

The tradeoff to accept consciously: a reputation problem on the `.fr` is associated with the brand name. At 20 to 30 sends a day of genuinely personalised mail, that risk is low. If you would rather isolate it completely, register a neutral third domain and accept starting from zero domain age.

### Mailboxes

Two mailboxes on the sending domain (for example `jules@` and `direction@`). Two is for redundancy and for splitting the daily load, not for volume.

Use Google Workspace or Microsoft 365, not a bulk ESP. Mailjet, Brevo, and SendGrid are built for newsletters and their IP pools are read as bulk. Your mail should look like what it is: one person writing to one hotel director.

### DNS and headers

- SPF, DKIM on both mailboxes
- DMARC starting at `p=none` with a reporting address, moving to `p=quarantine` after four weeks of clean reports
- `List-Unsubscribe` and `List-Unsubscribe-Post` headers on every send, one-click, no login, no form
- No custom tracking domain, because there is no tracking
- Real profile photo, real signature with postal address and SIRET

---

## 8. Warmup timeline

Six weeks from zero to steady state. Do not compress it.

### Week 0, days 1 to 3: setup, zero sends

- DNS records live, propagation verified with an external checker
- Mailboxes created, profile photos and signatures set
- **The `/desinscription` page and the prospecting privacy notice must be live before the first send, not after.** This is not a nice-to-have, it is the legal basis for the whole campaign.
- Suppression list table created and wired into the send path

### Weeks 1 to 2: warmup only, no prospects

Volume per mailbox: 5/day rising to 15/day by end of week 2. All of it warmup traffic.

Two approaches, and a hybrid is best:

- **Automated warmup pool** (Mailreach, Warmy, Instantly warmup). Effective, but be aware that mailbox providers have got noticeably better at recognising synthetic warmup networks, and a detected pool can hurt rather than help. Keep the intensity low and the pool reputable.
- **Real correspondence.** Move genuine mail onto the new domain: supplier correspondence, your accountant, the Plateforme Agreee onboarding, invoices, your own personal threads. Slower, entirely authentic, and it produces real replies and real folder placement. For a solo operator this is undervalued.

Ratio to aim for: at least a third of warmup volume as real human threads with real replies.

### Week 3: first real sends

- Warmup continues at reduced intensity
- 5 real cold sends per day per mailbox, so 10/day total
- Send by hand or with a 3 to 8 minute randomised interval. Never a burst.
- Watch: bounce rate, spam complaints, and preview-page open rate as your placement proxy
- **Gate:** do not advance if bounce rate exceeds 2% or preview opens are under 10%. Fix list quality or copy first.

### Week 4

- 10 real sends per day per mailbox, 20/day total
- Run a seed-list placement test (Mailreach or GlockApps) before ramping further

### Week 5

- 20 per day per mailbox, 40/day total
- This already exceeds your delivery capacity, so this is headroom, not a target

### Week 6 onward: steady state

- Hard cap 25 to 30 per day per mailbox including follow-ups
- Operating volume 20 to 30 sends/day total across both mailboxes, which supports 8 to 12 first touches per day
- Keep a low-level warmup running permanently, roughly 5/day per mailbox
- Monthly seed-list placement check
- Pause immediately on any deliverability signal degrading, and resume from the previous week's volume, not from the current one

### Total: first paid client realistically 8 to 10 weeks from starting the domain setup

Six weeks of infrastructure, then a sales cycle. Plan cash accordingly.

---

## 9. Sequence

Three touches. Maximum. Plain text, no images, one link, sent inside the same thread.

A hotel director being sequenced seven times will not buy a 1,600 EUR audit from you, and will remember the brand for the wrong reason. You are selling credibility.

**E1, day 0.** Subject names their establishment specifically, no curiosity-gap subject lines. 60 to 90 words. One concrete observation from the prescan, on the booking path. Link to the preview. Ends with a low-commitment question, not a meeting request.

**E2, day +4.** Reply in thread. One different concrete finding. No new link. Two sentences.

**E3, day +11.** One line closing the loop, plus an explicit offer to delete their data and the preview immediately. This last line converts surprisingly well and costs nothing.

Then stop. Move to suppression. Optionally, one phone touch to the establishment's professional line after E2, which remains lawful for B2B, with the caveat below.

Lead with argument A throughout: revenue not being seen, with the render diff as evidence. Legal framing stays in the paid report.

---

## 10. Compliance

Draft only - see the reconciliation note at the top of this document.
Every claim below must be checked against `docs/obligation-basis.md`'s
sourcing bar and reconciled with `docs/prospect-qualification.md` and
`docs/outreach-rules.md` before anything here governs a real send.

### Email

France is one of the more permissive EU regimes here. RGPD art. 6.1.f allows legitimate interest as the legal basis, and art. L34-5 CPCE confirms the opt-out regime for B2B, under three cumulative conditions: professional email address, content connected to the recipient's role, and a working one-click unsubscribe link.

Operational checklist, all five of which must hold:
1. Every message concerns the recipient's professional activity
2. Footer carries identity, postal address, unsubscribe link, and a link to the RGPD rights notice
3. An objection procedure exists and responds within 30 days. The CNIL's practical recommendation is under 7 days.
4. Objecting addresses go to a permanent blocklist, never deleted, or you will re-contact them on the next refresh
5. Subject line matches the content

Also: prospect data is retained for a maximum of 3 years after last contact. Build the expiry into the `prospects` schema now rather than retrofitting it.

Document the legitimate-interest balancing test once, in `docs/`. It is a page of writing and it is the thing a regulator asks for first.

### Tracking

**No pixels.** The CNIL's position is that inserting a tracking pixel in an email constitutes a read operation on the recipient's terminal, bringing it within art. 82 of the loi Informatique et Libertes, so prior consent is required unless a narrow exemption applies. The delivery-monitoring exemption covers only emails the recipient asked for, such as transactional mail or consented newsletters, which cold prospecting is not.

Your engagement signal is the preview page load. Keep that page free of cookies and third-party scripts so it stays a plain server log rather than a terminal read, and disclose it in the privacy notice.

### Phone

The loi Cazenave does not change the framework for B2B telephone prospecting; only B2C moves to mandatory opt-in from 11 August 2026. A call to a hotel's published professional line about its professional activity is still lawful.

Caution: a small independent hotel's published number can be the owner's personal mobile, and the government's own framing is that telephone prospecting is now prohibited across all sectors absent prior consent, which reads to consumers. Given fines reaching 375,000 EUR per call for a legal person, treat this as a question for your lawyer before you build calling into the pipeline, and in the meantime call only landlines published as establishment contacts.

### Crawling

Already handled by the `/bot` page: published identity, 1000ms baseline delay, 90-day deletion policy, robots.txt compliance. Extend the page to describe the prescan and preview behaviour explicitly before M9 goes live.

---

## 11. Instrumentation

Track per prospect, from first source to outcome:

- source, scored at, brokenness score, ability score, selection decision and reason
- sent at, per touch; bounced; replied; reply sentiment (positive / not now / negative / opt-out)
- preview loaded (boolean and date only, no time, minimise deliberately)
- outcome: no reply / reply / call / quoted / won / lost, with lost reason

Two things you specifically need to learn from the first 100 sends:

1. **Does brokenness score predict reply rate?** If it does not, the scoring model is decorative and the selection rule is arbitrary.
2. **Does the render diff or the accessibility finding drive replies?** Split the E1 body between the two and find out. This decides what the whole product leads with.

Everything else is vanity.

---

## 12. Build order

Each stage in a fresh Claude Code session in plan mode, per the usual workflow. Renumbered relative to the original draft to make the conflict with the already-shipped 9a/9b explicit rather than implicit - see the reconciliation note at the top of this document and `CLAUDE.md`'s build order before starting 9.1.

- **9.1** Sourcing ingest and `prospects` schema, with provenance and 3-year expiry. One-off job, quarterly refresh. Conflicts with 9a's existing AFNIC-based sourcing; needs a decision, not a silent replacement.
- **9.2** Cheap qualification filter with recorded rejection reasons. Overlaps with 9a's `qualifyProspect`; needs the same reconciliation.
- **9.3** Prescan path: distinct from the full audit, no Lighthouse, three pages, budgeted at 90s.
- **9.4** Evidence capture: render diff and annotated crop. Get this right, it is the product.
- **9.5** Scoring: brokenness plus ability-to-pay, deterministic, plus booking-engine fingerprinting for the vendor channel.
- **9.6** Contact discovery from mentions legales, plus verification.
- **9.7** Preview page generation and object-storage serving, with expiry and noindex.
- **9.8** Compliance surfaces: `/desinscription`, privacy notice, suppression list, balancing-test doc. **Must ship before 9.9.**
- **9.9** Send orchestration, sequence state machine, suppression enforcement, rate limiting.
- **9.10** Outcome tracking and the first 100-send analysis.

Domain and mailbox setup runs in parallel from day one of 9.1, because the six-week warmup clock is the real critical path. Start it before you write any M9 code.
