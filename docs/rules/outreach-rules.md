# Outreach rules

> **Plan 047 amendment (2026-09-15).** Outreach is attached to the durable
> `prospectId`, not a selected cohort or candidate generation. A prospect may
> use an own or vendor-hosted website; website kind is an information badge.
> The preview controls live on the prospect page, and a preview or first
> email requires an attached audit with complete crawl coverage. **Plan 050
> (2026-09-16):** the audit's normalization data version is advisory, not a
> gate (trade-off 91). Suppression, a valid URL, and polite crawling remain
> the only hard safety gates.

Messaging doctrine for prospecting. Governs milestone 9c and the
outreach email templates in `packages/interface/src/outreach`. Written
2026-08-15.

**Amended 2026-09-11, trade-off 83: no model writes outreach.** Every
email is fixed operator-approved wording
(`outreach-email-template.ts`). Where this document says "the model" or
"the prompt", the rule now binds those templates; the model-era
mechanics (prompt, prose guards, touch word limits) are retired.

**Amended 2026-09-19, preview v3 (Plan 069).** Qualification remains separate
from the public preview. A prospect is contacted only after a Plan-050
qualifying Full scan has complete declared crawl coverage, current FR and EN
reports, and a published v3 preview. The preview's first three cards follow the
selected French report's first three rendered priorities, but every public
sentence remains reviewed deterministic copy. Touch 1 reuses only the bounded
facts frozen on that exact publication row: distinct-finding count,
unique-affected-page count, severity totals, and the three priority-card
categories. It never recomputes them from later findings. Those facts make the
message genuinely prospect-specific rather than merely personalised-looking.
The subject and opener use "analyse"; "audit complet" is reserved for the paid
deliverable. Historical v1/v2 links remain compatible until revocation or
expiry; no new v1/v2 publication is created.

**Amended 2026-09-20, Plan 071.** New Touch-1 drafts carry exactly two body
links, in this order: the prospect-specific published preview, then the
permanent reference audit at `/exemple-audit`. The second link answers what
the paid deliverable looks like; it is not a second preview and is never
prospect-specific. Touches 2 and 3 remain link-free. A new Touch-1 draft is
refused when the approved reference manifest is unavailable. The reference
PDF is a synthetic, explicitly disclosed showcase rendered through the paid
report path; it must not expose the source audit, client identity, imagery or
source URLs.

Companions: `docs/rules/obligation-basis.md` for what may be claimed about the
client, `docs/rules/operator-obligations.md` for what binds us,
`docs/rules/prospect-qualification.md` for who may be contacted,
`docs/rules/offer-positioning.md` for what is being sold,
`docs/rules/llm-layer-rules.md` for the report-model boundary; outreach
itself adds no model call.

---

## 1. Two arguments, not three

An earlier framing had three pillars: legal obligation, customers turned
away by impairment, and search and LLM invisibility. Pillars two and
three are the same claim with different causes, and separating them
dilutes both.

**Argument A, revenue not being seen.** Causes: content invisible to
search engines and to LLM answer engines, transactional flows that
cannot be completed, interfaces that fail for age-typical eyesight and
dexterity.

**Argument B, a legal landscape the business does not know about.**
Cause: the EAA regime, the company's own registry data, and the state of
the case law. Not a determination. See section 3.

---

## 2. Ordering

**A before B in outreach.** Argument A leads because the loss is already
happening, is verifiable today, and is not contingent on a law. An SMB
has a mental budget line for being found and for completed sales; it has
none for accessibility. Argument B needs prior credibility and is easily
dismissed as scare-selling when it arrives cold from a stranger.

**Touch-1 bridge, revised for v3 on 2026-09-19.** Touch 1 may contain one fixed
bridge after the prospect-specific scan facts: "Ces constats ont un impact
direct sur l'expérience de vos clients et peuvent également relever du cadre
légal applicable en matière d'accessibilité." The legal half is emitted only
when the published v3 snapshot's priority-card categories contain
accessibility. It is not Argument B's facts block, does not say the regime
applies to this business, and carries no criterion, registry datum, deadline,
sanction or scope conclusion. If no accessibility priority card is present,
the bridge ends after the customer-experience sentence. Historical v2 drafts
keep their existing compatibility behavior.

**B before A in the paid report.** The buyer has paid and now wants to
know where they stand. This inversion is deliberate; report templates
should not reuse the outreach ordering.

---

## 3. Argument B states facts. It does not conclude.

Two independent reasons, either sufficient on its own.

**The law is contested.** Lille and Caen went opposite ways in 2026 on
whether an e-commerce company below the article 47 threshold is bound at
all, and an appeal is pending at Douai. Any prospect's lawyer finds this
in five minutes, and a confident determination we cannot defend costs
more than the confidence buys.

**We may not be permitted to make it.** See
`docs/rules/operator-obligations.md` section 2.

**Permitted formulations.** The criteria as the texts set them out. The
company's own registry data. Whether the two exemption conditions appear
met on that data. The state of the case law including the split. A
recommendation to confirm scope with a lawyer.

**Prohibited formulations.** "You are subject to the EAA." "You must do
X by Y." Any sanction amount applied to this company. Any scope
statement presented as settled.

**Three rejected framings**, recorded so they are not re-invented:

- *Penalty.* "You risk a fine of X." Rejected on accuracy (the market
  quotes a figure belonging to a different regime) and on conversion (a
  threat from a stranger with a commercial interest is the least
  credible message that exists).
- *Moral.* "Businesses need to accommodate people with disabilities."
  Rejected because it implies the recipient is doing something wrong,
  which is an accusation from a stranger, and because it asks for
  discretionary spend on grounds the recipient already agrees with,
  which produces agreement and no purchase.
- *Determination.* "This obligation applies to you specifically."
  Rejected for the two reasons above. It was the intended
  differentiator; it is not available.

---

## 4. Statistics

**No population or prevalence statistics in outreach. None.**

A percentage-of-population figure is identical in every email sent,
which is the signature of mass mail. It does not survive the recipient's
intuition: a merchant told that fifteen percent of the population has a
disability thinks "not fifteen percent of my customers" and is partly
right, and the credibility loss contaminates the rest of the message.

**The stronger version is one reproducible failure.** "The checkout on
your site cannot be completed with a keyboard" is a lost transaction the
recipient can verify in thirty seconds. It beats any percentage because
it is about them.

**Age instead of disability, where the sector supports it.** Age-related
vision and dexterity decline is close to universal past sixty and nobody
argues that their customers are getting older. Permitted without a
numeric prevalence claim attached, and not as a generic opener in every
email.

In the paid report, statistics are permitted only from
`docs/rules/obligation-basis.md` section 8, with source and date, never inline
in a template. That list is currently empty.

---

## 5. Deterministic splice: the model makes no legal statements

`docs/rules/llm-layer-rules.md` forbids the model from asserting that the EAA
applies to a specific business. Unchanged and absolute, and now wider:
the model writes no part of argument B at all.

Argument B enters the email as a fixed, non-generated block produced
from the same `assessObligations()` output that feeds the report's
compliance section. The model writes around it, never rewrites it, never
paraphrases it, never summarises it into the subject line.

Stated in the outreach prompt directly. Not inherited from the audit
prompt. Since trade-off 83 there is no outreach prompt: the whole email is
code-owned, which keeps this rule by construction.

The model never receives the facts block. When assembling touch 3, code rebuilds
the block from the obligation assessment, compares it with the block expected by
the caller, and splices the freshly rebuilt value. This catches a caller that
mutated or rebuilt stale content between preview publication and draft assembly.
A mismatch is discarded rather than repaired. Touches 1 and 2 cannot carry a
facts block.

---

## 6. Touch sequence

One new piece of information per touch. Each is deterministic in
substance; since trade-off 83 the wording is too (approved templates, no
model).

**Revised 2026-09-19, preview v3.** The first touch's evidence document is the
report-aligned full-scan preview (section 6bis). The same Full scan supplies
the measured facts, while the currently selected French analysis supplies only
the report priority order. The publication row freezes the bounded aggregates
and priority-card categories that Touch 1 may repeat, so a later report
regeneration cannot silently make the email describe a different story.

| Touch | Content | Source |
|---|---|---|
| 1 | Prospect-specific full-scan aggregates, conditional impact/legal bridge, and the published report-aligned preview | Full scan + selected report lineage |
| 2 | A short reminder focused on acting on the findings; names no new finding | approved template |
| 3 | Criteria and this company's available registry data, followed by a commercial paragraph explicitly separated from the legal question | deterministic facts block + approved template |

Touch 2 no longer carries a second observation, so it is no longer gated on
the prescan having one (trade-off 83); the reminder is the operator's
approved wording and names no new finding.

The deterministic facts block appears on touch 3 only. Assembly refuses it on
touches 1 and 2. Touch 1's fixed conditional bridge is deliberately narrower:
it may say the observed findings "peuvent également relever du cadre légal
applicable en matière d'accessibilité" when an accessibility priority card is
present, but it never carries the legal criteria, registry facts or a scope
conclusion. Touch 3 remains the first place where those facts are spelled out.

**Touch 3 email form, 2026-09-24.** The email splices the facts block's
paragraphs without its heading, since the intro sentence already announces the
regulatory framework, and leaves out the "no registry data found" sentence
when there is no registry snapshot (`omitAbsentRegistry`). The public preview
keeps both. Every outreach email uses straight apostrophes only.

## 6bis. The report-aligned full-scan preview

**Current contract: v3, Plan 069 (2026-09-19). Historical v2 remains
compatible.** The preview sent at touch 1 is still a separate, deliberately
thin public document built from the prospect's one Full scan. New publication
requires all of the following:

- a Plan-050 qualifying Full scan whose declared crawl coverage completed;
- current FR and EN client reports for that audit;
- the currently selected French analysis, matching the audit's current
  findings provenance;
- the Plan-068 scoped evidence diagnostics available for that stored audit
  (the diagnostics themselves may report `complete`, `limited` or
  `unavailable`).

The selected French analysis is an **ordering authority, not a prose source**.
V3 runs the paid report's exact `buildRenderedPriorities()` logic and uses the
first three rendered priorities. Each public card then resolves its title from
the existing operator-reviewed bilingual proof-card catalog through that
priority's deterministic representative finding. Theme titles, executive
summary, business-impact prose, recommended actions, notes and model risk never
enter the preview.

Plan 050 crawl qualification and Plan 068 diagnostics answer different
questions and must not be merged:

- incomplete declared crawl -> no preview;
- completed crawl + diagnostics `complete` -> normal v3 preview;
- completed crawl + diagnostics `limited` -> preview plus the existing
  bounded client-facing limitation summaries;
- completed crawl + diagnostics `unavailable` -> preview plus a fixed
  "detailed diagnostics unavailable" disclosure;
- operational warnings are operator-only and never enter public HTML.

Touch 1 may reuse only the exact public-safe facts frozen when v3 was published:
distinct-finding count, unique affected-page count, severity totals, and the
three priority-card categories. The private preview row also records the
selected French `sourceAnalysisId` and current `sourceFindingsDigest`. If
either lineage changes, the old public link remains reachable until it is
revoked or expires, but it is **stale for a new first-touch draft** and must be
reissued. Reissue uses stored evidence and reports; it does not imply a rescan.

The bounded regulatory block is rebuilt from the selected French analysis's
deterministic `obligationAssessment`. It may state the regime criterion,
available public registry facts and the recommendation to confirm scope with
counsel. It still never states that this business is bound, and never prints a
client-specific deadline, sanction claim or model-written legal conclusion.

What v3 shows, and nothing more:

- inventoried, content-checked and performance-measured page counts, separately;
- distinct-finding count and unique affected-page count;
- non-zero severity totals;
- non-zero category totals over the same distinct findings, largest first;
- exactly three ranked priority cards in the same order as the first three
  paid-report priorities, using reviewed public-safe copy;
- scan-data quality status and only bounded client limitations where relevant;
- the deterministic regulatory facts block when the sources permit it;
- the code-owned EUR 990 HT price, with the ask being to reply and request the
  diagnostic, not a checkout link;
- the article 14 disclosures: identity, actual data origins, purpose, opt-out,
  and the 30-day link expiry.

What it never contains: screenshots or any image, exact URLs, selectors,
finding or rule IDs, occurrences, raw evidence, remediation, model prose,
model risk, the historical v2 grade/risk hero, population statistics, or a
legal conclusion about the business.

Lifecycle rules:

- New publications are v3. Stored v1/v2 objects are not rewritten; existing
  links continue to load, expire and revoke under their historical contracts,
  and v2 remains resolvable where an already-established draft compatibility
  path needs it.
- The authenticated audit/prospect workflow renders the same v3 HTML used for
  publication and its operator-only PDF. The public site remains an opaque
  object reader with no database access.
- Nothing publishes automatically, and no first-touch draft exists before an
  explicit publication. Suppression blocks publication and revokes every live
  preview for the domain.
- The preview and paid report come from the same stored Full scan. Publication
  waits for the current report pair; report/preview regeneration reuses stored
  evidence and never asks for a rescan merely because prose or selection
  changed.
- A published price change revokes and reissues every live preview that embeds
  the old amount, because the HTML object is immutable after publication.
- The Plan-050 crawl-completeness gate remains: an incomplete crawl means no
  preview, not a partial one. Scoped Plan-068 limitations do not turn a
  completed crawl back into an incomplete one.

**Preview links in hosting logs**, verified against Vercel's runtime logs
documentation on 2026-09-16. The site code never logs a preview token, but
the token is a path segment (`/apercu/<token>`) and the personal opt-out link
carries one as a query parameter (`/desinscription?t=<token>`). Vercel's
runtime logs record the request path and the search parameters of every
function invocation, searchable by path, and keep them for 1 hour (Hobby),
1 day (Pro), 3 days (Enterprise), or 30 days with Observability Plus. Anyone
with runtime-log access to the site project can therefore read working
preview links for that window, and a log drain would copy them to a third
system with its own retention. The controls, all operator-side:

- The Vercel team that owns `packages/site` has the operator as its only
  member with runtime-log access. Adding a member is granting preview access.
- No log drain and no Observability Plus on the site project. Either one
  extends where, and for how long, the paths are kept.
- If log access is ever shared or exposed, revoke and reissue every live
  preview; the 30-day expiry bounds the damage but does not end it.

Moving the token out of the request (for example into a URL fragment read by
a client-side loader) was considered and not adopted: it would change every
published link format and put script on a page whose CSP currently forbids
all script, for a log that only the operator can read.

Existing v1 previews are neither rewritten nor invalidated early: they stay
revocable and expire under their existing records, and no new v1 preview or
first-touch draft can be created after plan 037 ships.

Follow-ups generate only if no reply is detected on the thread. Spacing
is a setting, not a constant in a prompt. Canonical defaults, added with
milestone 9c plan 012 (`ODYSSEUS_OUTREACH_TOUCH2_DAYS` /
`_TOUCH3_DAYS` / `_REPLY_WINDOW_DAYS`, snapshotted onto each thread at
open so a later setting change never retroactively redates a live
thread): touch 2 no earlier than day +4 after touch 1 is confirmed sent,
touch 3 no earlier than day +11. A thread with no reply 14 days after
touch 3 is confirmed sent moves to `sequence-complete` and is
suppressed; no fourth touch exists.

**Touch shape**, since trade-off 83 and Plan 071: the approved templates
themselves. Touch 1 carries exactly two body links - first the published
prospect preview and then `/exemple-audit` - plus the footer's opt-out and
privacy links; touches 2 and 3 carry no link at all. The opt-out link is
personal (`/desinscription?t=<token>`): it prefills the recipient's address on
the public form, whose submission reaches the blacklist through the bucket drop
box (trade-off 89). The model-era word and sentence limits
(`outreach-limits.ts`) are retired with the model.

---

## 7. Required disclosures

RGPD article 14 applies because the data was not collected from the
person. Every first-contact message states:

- who is writing, with a real identity and a working reply address
- **where the data came from**, accurately and per prospect: the address
  from the company's own website, the company data from AFNIC and Sirene
  open data
- the purpose
- a simple, free means of objecting

The origin disclosure is why `docs/rules/prospect-qualification.md` section 7
stores data origin per record rather than relying on a boilerplate line.

**A manually entered contact address (plan 045 slice 1.6) carries its own
origin,** honestly stated per record rather than reusing the automated
addresses' phrasing:

- found on a public page other than the hotel's own site (a directory, a
  booking platform): "un annuaire professionnel ou une plateforme de
  réservation en ligne" / "a professional directory or an online booking
  platform".
- given to the operator directly by someone at the hotel: "les
  coordonnées que vous nous avez communiquées" / "the contact details you
  provided to us". This line never says "public source", because it is
  not one. Status: secondary, like the telephone rule in
  `docs/rules/operator-obligations.md` section 5 - this case sits under RGPD
  article 13 (data obtained directly from the person) rather than
  article 14, and that distinction has not had its own legal review.

The prospect's site language is not yet stored on `HotelCandidate` or
`HotelPrescan`. Until that missing fact has a deterministic source, draft
generation inherits the operator-supplied language and records
`languageSource: 'operator'`. The default value is not evidence that the site
uses that language. A future detector must be versioned and reviewed before it
replaces the operator source.

A validator confirms identity, origin and opt-out are present before a
draft is created. The human confirms again at review.

**Placement and wording, revised 2026-09-11 (trade-off 82).** The
disclosures sit in a small footer below the sign-off and signature, never
in the body. The purpose line states the whole sequence: a first message
followed by two reminders at most, never "once", because the reminders
exist. Every code-owned line is written in French first, in the firm's
plural voice, and translated to English from there. Who is writing comes
from `OUTREACH_CONTACT` (`packages/core`), which the v2 preview
interpolates too, so the email and the preview it links to name one
person and one mailbox.

**Reference-link request signal, Plan 071.** When optional first-party
attribution is configured, Touch 1 may use an opaque high-entropy path under
`/exemple-audit/r/` that redirects to the same canonical `/exemple-audit`
page, which reads the approved PDF page by page (trade-off 108). The public route
writes only a token hash, request time and reference release version to a
dedicated receipt prefix; it does not query Mongo and does not receive an IP,
User-Agent, Referer, cookie, pixel or query tracking parameter. The private
mapping expires after 90 days from draft creation, suppression stops future
attribution, and storage failure never blocks the redirect or the draft. The
dashboard calls the result a "link requested" signal, not proof of a human
reading the report, because automated mail-security checks can request links.

**Plain link by default, 2026-09-21.** Touch 1 prints both the preview
address and the canonical `/exemple-audit` address in full as the link text,
in HTML as well as plain text, never behind a label, so a cold-email
recipient can read where each link goes before clicking. Attribution
is off unless `ODYSSEUS_REFERENCE_AUDIT_LINK_TRACKING=on` is set together with
the receipt bucket: a per-recipient redirect path looks like tracking to spam
filters and to the reader, and it is not needed at the current volume.

---

## 8. Channel mechanics

**Sending domain.** Cold volume never leaves the domain carrying
invoices and client correspondence. `odysseusaudit.fr` currently exists
only as a 308 redirect and is the natural candidate, redirect retained.

**Authentication.** SPF, DKIM and DMARC configured and verified before
the first send. Mailbox warmed two to three weeks before volume.

**Volume ceiling.** Twenty to forty per day per warmed mailbox. This is
the binding constraint on the whole system, not drafting time. Exceeding
it does not produce more replies, it produces the same number of emails
landing in spam, which fails silently and is therefore worse than
failing loudly.

**Automation boundary.** Everything up to the draft is automated:
qualification, scanning, evidence selection, facts block, prose,
suppression check, disclosures, follow-up scheduling. The send is
manual. Because the ceiling is set by deliverability rather than
drafting effort, automating the send buys about twenty minutes a day and
costs the review step that keeps the evidence honest.

**No sequencer.** No lemlist, Instantly, Smartlead or equivalent. They
optimise volume, the one variable we have decided not to optimise.

**Telephone is closed** since 11 August 2026. See
`docs/rules/operator-obligations.md` section 5. Phone is a follow-up channel
for people who replied, never a prospecting channel.

**Timing.** Avoid landing the first wave in the last week of August or
the first two weeks of September 2026. Every business in the target
segment is dealing with the 1 September electronic invoicing reception
deadline in that window, and it is direct competition for attention.

**Suppression checked at draft time**, so a suppressed prospect never
produces a draft that could be sent by reflex.

**Reconciling "no sequencer" with automated follow-up scheduling**, added
with milestone 9c plan 012. Binding decision 14 of the milestone 9c plans index
(now `plans/archive/9c-plans-index-history.md`) forbids
"automatic follow-ups"; read together with the automation boundary above,
that means a system that sends on a timer, which this is not. Scheduling
and drafting a follow-up are automated (bounded, operator-invoked, and
gated on a confirmed send, elapsed spacing, and no reply); the send stays
manual, exactly as it does for touch 1. There is still no sequencer.

---

## 9. Prohibited in outreach

- Any figure from `docs/rules/obligation-basis.md` whose status is not `primary`
- The EUR 50,000 amount in any EAA-regime context
- Any population or prevalence percentage
- Any claim that the recipient will be fined, inspected or sued
- Any conclusion about whether this company is legally bound
- Any answer to the "my site predates June 2025" objection beyond
  saying it is a question for their lawyer
- Any finding not present in that prospect's own scan
- Named individual recipients and free-mail addresses discovered by the
  automated pipeline (`docs/rules/prospect-qualification.md` section 6 is
  unchanged). A named person or a free-mail address the operator enters
  by hand is the sole exception (plan 045 slice 1.6, honest origin
  wording above; a free-mail address additionally requires the
  operator's attestation in `docs/rules/operator-obligations.md` section 5).
- Any statement about what a competitor of theirs is doing
- Any description of the offer as an audit RGAA or as producing an
  official conformity rate

---

## 10. Mailbox preflight, before the first draft

Milestone 9c plan 011 creates drafts in a real mailbox through the Gmail API.
The tool refuses to do anything at all until the four `ODYSSEUS_MAILBOX_*`
variables in `.env.example` are set, so an unprovisioned mailbox fails loudly
rather than silently drafting nowhere. What has to exist first:

1. **A Google Workspace account on the sending domain.** Section 8's rule
   stands: cold volume does not leave the domain carrying invoices and client
   correspondence. A sender reputation problem attaches to the domain, and
   `odysseusaudit.com` also serves the marketing site and the preview links
   prospects click, so a hit there degrades everything at once. The sender is
   a single environment variable, so this is reversible, but it is cheaper to
   get right before warmup than after.

   **Interim state, recorded 2026-08-30 so it does not become permanent by
   forgetting.** `contact@odysseusaudit.fr` is the intended sending address
   and could not be provisioned yet, so the Workspace account is being set up
   as `contact@odysseusaudit.com` and that is what the mailbox variables point
   at for now. This is a knowing, temporary deviation from section 8, not a
   revision of it.

   The distinction that makes the interim safe is what the mailbox is used
   for. Creating drafts, and plan 011 step 6's synthetic draft to an address
   the operator controls, put nothing in front of a stranger and cannot earn a
   spam complaint, so the domain is not at risk. The risk begins at the first
   real prospect send, because that is when a recipient can mark the message
   as spam and attach that judgement to the domain.

   **The trigger is therefore the first send to a real prospect, not a date.**
   Before it, move to `odysseusaudit.fr`: SPF, DKIM and DMARC verified on that
   domain, the mailbox warmed per section 8, and
   `ODYSSEUS_MAILBOX_SENDER_ADDRESS` repointed. Nothing in the code needs to
   change; the sender is configuration precisely so that this switch stays a
   one-line change rather than a migration. The `.fr` 308 redirect is retained
   either way, and adding mail records to it does not disturb it.

   **Interim closed in code, 2026-09-11 (trade-off 82).** The operator
   repointed `ODYSSEUS_MAILBOX_SENDER_ADDRESS` to `contact@odysseusaudit.fr`,
   and `getMailboxSenderAddress` now refuses any other value, so a draft can
   no longer leave from one address while its body names another. Every
   prospect-facing surface (drafts, the v2 preview, the whole public site)
   names `.fr`; the paid report keeps `.com`. Warmup completion is still what
   closes runbook gate I, not this change.

   **Alias fact confirmed, 2026-09-12.** `contact@odysseusaudit.fr` is a
   Google Workspace alias on the same inbox as `contact@odysseusaudit.com`,
   verified directly in Workspace admin, not a second mailbox. This means
   the "two approved mailboxes" and "sending domain separation" framing
   below did not happen as originally specified: `.fr` and `.com` share one
   underlying mailbox and therefore one sender reputation. The operator has
   accepted this as a deliberate trade-off rather than reopening
   provisioning. Reasoning: trade-off 86.
2. **An OAuth client of user type Internal.** This is the load-bearing
   setting. An External client left in Testing is issued refresh tokens that
   expire after seven days, and moving it out of Testing means Google
   verification, which `gmail.compose` being a restricted scope makes
   expensive. Internal avoids both.
3. **Two scopes, no more:** `https://www.googleapis.com/auth/gmail.compose`
   for drafts and `https://www.googleapis.com/auth/gmail.metadata` for thread
   reads. Note plainly that no Gmail scope grants draft creation without also
   granting send. The guarantee that this tool cannot send is a property of
   the adapter's shape, enforced by test, and has no permission backstop.
4. **SPF, DKIM and DMARC** configured and verified on the sending domain.
5. **A monitored reply address.** Every draft invites a reply, and section 7's
   opt-out promise cannot be kept by a mailbox nobody reads.
6. **Mailbox warmup**, two to three weeks before volume, per section 8.
   **Status, confirmed 2026-09-12.** Warmup is running via MailReach
   (SMTP/IMAP plus Gmail domain-wide delegation), started 2026-09-12 on
   `contact@odysseusaudit.com`; the `.fr` alias inherits the same
   reputation since it is the same inbox. Not yet reported complete.

MailReach's domain-wide delegation is a separate Gmail API access path from
item 2's Internal OAuth client: MailReach authenticates as a service account
in its own GCP project ("Odysseus Outreach"), authorized in Workspace Admin
under Security > API Controls > Domain-wide Delegation for that service
account's client ID (`109319686726400251298`), and uses it only for warmup
traffic, never for drafting. The plan 011 Gmail adapter and its refresh
token are unaffected. Reasoning and the granted scope: trade-off 86.

No secret value belongs in this repository. The four variables are read from
the environment and are never printed by any command, including on failure.
