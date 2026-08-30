# Outreach rules

Messaging doctrine for prospecting. Governs milestone 9c and the
outreach prompt in `packages/llm`. Written 2026-08-15.

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
prompt.

The model never receives the facts block. When assembling touch 3, code rebuilds
the block from the obligation assessment, compares it with the block expected by
the caller, and splices the freshly rebuilt value. This catches a caller that
mutated or rebuilt stale content between preview publication and draft assembly.
A mismatch is discarded rather than repaired. Touches 1 and 2 cannot carry a
facts block.

---

## 6. Touch sequence

One new piece of information per touch. Each is deterministic in
substance; only the prose is generated.

| Touch | Content | Source |
|---|---|---|
| 1 | Render diff: what a crawler sees versus what a person sees; if no render composite exists, the measured failure crop | scan |
| 2 | One different allowlisted observation, plus age framing where the sector fits | scan, behavioural checks |
| 3 | Criteria, this company's registry data, and where the case law stands | `assessObligations()` |

The render comparison is preferred for touch 1, not required. A server-rendered
site can have a genuine measured failure without a render gap. In that case,
touch 1 uses the measured failure crop and touch 2 takes a different allowlisted
summary. If no distinct second observation exists, no three-touch draft is
created.

The deterministic facts block appears on touch 3 only. Assembly refuses it on
touches 1 and 2, so legal context cannot be front-loaded into the cold opener.

Follow-ups generate only if no reply is detected on the thread. Spacing
is a setting, not a constant in a prompt.

**Touch shape**, added with milestone 9c plan 010. Each row is what
`packages/llm/src/outreach/outreach-limits.ts` enforces, so a change here
must change that file's constants in the same commit, and
`outreach-limits.test.ts` reads this table to keep the two from drifting.

| Touch | Words | Sentences | Links |
|---|---|---|---|
| 1 | 60 to 90 | (bounded per field, not as one count) | one preview link, no new link on 2 or 3 |
| 2 | up to 60 | exactly two | none |
| 3 | up to 40 | exactly one closing sentence, before the deterministic deletion and opt-out lines | none |

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

The prospect's site language is not yet stored on `HotelCandidate` or
`HotelPrescan`. Until that missing fact has a deterministic source, draft
generation inherits the operator-supplied language and records
`languageSource: 'operator'`. The default value is not evidence that the site
uses that language. A future detector must be versioned and reviewed before it
replaces the operator source.

A validator confirms identity, origin and opt-out are present before a
draft is created. The human confirms again at review.

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
- Named individual recipients, and free-mail addresses
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

No secret value belongs in this repository. The four variables are read from
the environment and are never printed by any command, including on failure.
