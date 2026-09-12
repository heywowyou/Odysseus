# Outreach rules

Messaging doctrine for prospecting. Governs milestone 9c and the
outreach email templates in `packages/interface/src/outreach`. Written
2026-08-15.

**Amended 2026-09-11, trade-off 83: no model writes outreach.** Every
email is fixed operator-approved wording
(`outreach-email-template.ts`), two approved variants per rotating
sentence, filled only with the hotel's formatted name and the categories
of its own preview's proof cards. Where this document says "the model" or
"the prompt", the rule now binds those templates; the model-era
mechanics (prompt, prose guards, touch word limits) are retired.

Companions: `docs/rules/obligation-basis.md` for what may be claimed about the
client, `docs/rules/operator-obligations.md` for what binds us,
`docs/rules/prospect-qualification.md` for who may be contacted,
`docs/rules/offer-positioning.md` for what is being sold,
`docs/rules/llm-layer-rules.md` section 10 for when the model is called.

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

**Revised 2026-09-11, plan 037.** The first touch's evidence document is the
full-scan scorecard preview (section 6bis), built from a candidate-linked
full outreach scan rather than from the three-page prescan. Touch 1's render
diff and measured failure crop belonged to the retired v1 preview, which
carried images; the v2 preview carries none. The prescan evidence contract
itself is unchanged and still feeds prescan completeness, scoring inputs,
and the touch 2 observation, but the measured crop and composite no longer
reach the prospect.

| Touch | Content | Source |
|---|---|---|
| 1 | The published full-scan scorecard preview: coverage counts, aggregate finding totals, three proof cards | outreach full scan |
| 2 | A short reminder pointing back to the preview; names no finding (trade-off 83) | approved template |
| 3 | Criteria, this company's registry data, and where the case law stands | `assessObligations()` |

Touch 2 no longer carries a second observation, so it is no longer gated on
the prescan having one (trade-off 83); the reminder is the operator's
approved wording and names no finding.

The deterministic facts block appears on touch 3 only. Assembly refuses it on
touches 1 and 2, so legal context cannot be front-loaded into the cold opener.

## 6bis. The full-scan scorecard preview

**Added 2026-09-11, plan 037.** The preview sent at touch 1 is a versioned
v2 document built from one candidate-linked **outreach full scan**: a full
audit run with the paid audit's content-coverage policy, stopped before the
model analysis. Cheap qualification, the prescan, immutable scoring, and
cohort selection remain the cost gate; only selected cohort members receive
one. It is started by the operator from a selected prospect, never
automatically.

What the preview shows, and nothing more:

- coverage facts: inventoried, content-checked, and performance-measured
  page counts, reported separately
- the count of distinct findings and the count of unique affected pages
- distinct-finding totals for each of the four severities
- exactly three text proof cards, each a public-safe title with its category,
  severity, and affected-page count, selected deterministically in code from
  an operator-approved bilingual copy catalog
- the deterministic facts block when the sources permit it (same
  `buildOutreachFactsBlock` path as touch 3)
- the code-owned EUR 1,600 HT price, with the ask being to reply and request
  the audit, not a checkout link
- the article 14 disclosures: identity, data origins, purpose, opt-out, and
  the 30-day link expiry

What it never contains: screenshots or any image, exact URLs, selectors,
finding or rule IDs, occurrences, raw evidence, remediation, model prose, a
0-to-100 score, statistics, or a legal conclusion about the business.

Lifecycle rules:

- The audit detail page owns the document: the operator renders the exact
  unpublished preview there, downloads the operator PDF, then publishes,
  copies the one-time token link, and only then can create the first draft.
  The prospect page starts the scan and links to the audit; it has no
  preview controls.
- The public page is an opaque-token, noindex, no-store HTML page that
  expires after 30 days. It offers no PDF. Only the operator downloads a PDF,
  from the private audit page.
- Nothing publishes automatically, and no first-touch draft exists before an
  explicit publication. Suppression blocks publication and revokes every live
  preview for the domain.
- A paid audit is always a fresh scan; the preview's scan is dated
  prospecting evidence, never a deliverable held back.
- Changing the published price revokes and reissues every live v2 preview,
  so no live link ever shows a stale amount.
- A full-scan preview is built only after the audit's coverage gate passes;
  a coverage failure means no preview, not a partial one.

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

**Touch shape**, since trade-off 83: the approved templates themselves. Touch
1 carries exactly one body link (the published preview) plus the footer's
opt-out and privacy links; touches 2 and 3 carry no link at all. The model-era
word and sentence limits (`outreach-limits.ts`) are retired with the model.

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
with milestone 9c plan 012. `plans/README.md` binding decision 14 forbids
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
