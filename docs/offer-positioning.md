# Offer positioning

What is sold, at what price, and what it explicitly is not. Written
2026-08-15. Supersedes the pricing subsections of brief section 3.2
where they conflict.

---

## 1. Prices, held

| Tier | Price | Delivery |
|---|---|---|
| Screening | EUR 290 HT | automated PDF, published price, Stripe link, no call |
| Full audit | EUR 1,200 to 1,900 HT | set per client within risk band after scan |

**Displayed HT everywhere from the first day.** Reasoning and the VAT
threshold that makes this urgent are in
`docs/operator-obligations.md` section 6.

**Why the prices are not being raised.** Published market ranges for a
French accessibility audit run from EUR 1,400 to EUR 20,000 HT, with
DINUM's own guidance at EUR 2,000 to 5,000, putting this offer below
every published floor. The case for raising is real and was rejected,
because it assumes a buyer comparing quotes. This buyer is not
comparing. They are a cold prospect who did not know they had a problem
twenty minutes ago, and their reference point is zero. A solo operator
with no case study and no certification loses a comparison-shopping
fight at any price, so the offer avoids that fight rather than trying to
win it.

**What is not true:** that a lower price converts a cold prospect
better. Between EUR 290 and EUR 490 the difference is small, because the
objection is never "too expensive", it is "I do not believe this
matters". Price is not the lever. Proof is. Revisit pricing only after a
case study and a published study exist, when comparison becomes the
actual sales conversation.

**Pricing decided 2026-08-16.** Auditing the manual-accessibility
checklist against what milestone 8 actually shipped found the remaining
gap outside automated detection was down to three specific items
(placeholder-as-only-label, reading order versus visual order, visible
focus indicators), not a broad pass. That is materially thinner than the
"manual accessibility verification pass" language previously used to
justify the full audit's position above the screening tier, so three
options were weighed for how to hold the EUR 1,200 to 1,900 HT band
without that claim:

- **Sell a narrowed manual review of those three items to justify the
  existing price.** Rejected. Manual human verification is not part of
  the product or the offer, in any tier, full stop, even narrowed down
  to a handful of items; the report stays fully automated.
- **Partner with an accessibility agency for a manual layer.** Deferred,
  not rejected. Real option once the second channel (section 5) has
  produced a working relationship with an agency; revisit after the
  first case study rather than building it speculatively now.
- **Pre-audit framing: price the full audit as the automated step before
  an audit RGAA, not as a smaller version of one.** Chosen. Ships now.
  Full audit stays at EUR 1,200 to 1,900 HT; the justification for that
  band moves from "includes a manual pass" to "is the thing a business
  runs before commissioning an audit RGAA," per section 2.

Revisit this once a case study exists and the agency-partnership option
in section 5 has real conversations behind it, not before.

---

## 2. This is a diagnostic, not an audit RGAA. Say so.

**Positioning, decided 2026-08-16: Odysseus is the automated first step
before a full audit RGAA, not a substitute for one.** That is the
offer, stated as what it is rather than as what it falls short of. The
price sitting below the audit RGAA market range is the direct
consequence of that positioning, not a shortcoming to apologize for: a
pre-audit product should cost less than the audit it precedes, and
pricing it near audit-RGAA rates would be pricing a different product
than the one being delivered.

The artifact the French market treats as having legal value is a taux de
conformité computed over the 106 RGAA criteria on a representative
sample of gabarits per the DINUM grid, feeding a declaration. Odysseus
does not produce that, and a prospect placing a EUR 1,900 Odysseus
report next to a EUR 2,500 audit RGAA will conclude the cheaper one is
missing something. They will be right, if the comparison is "which one
is the audit." It is the wrong comparison: Odysseus is priced and built
as the thing a business runs before commissioning that audit, not as a
cheaper version of it.

The answer is not to imply otherwise. It is to name it first, on the
offer page, in the proposal and in the report itself:

> Ceci est un diagnostic technique, pas un audit RGAA. Il ne produit pas
> de taux de conformité officiel et ne peut pas servir de base à une
> déclaration d'accessibilité.

Stating the limit first removes the comparison instead of losing it, and
it is the same instinct that governs the legal claims: being the
accurate one is the position, not an inconvenience.

**What the diagnostic does that an audit RGAA does not.** Whole-site
crawl rather than a sample of gabarits. Render diff evidence showing
what a crawler sees versus what a person sees. Search and LLM visibility
findings alongside accessibility ones. Commercial framing aimed at a
non-technical decision maker. Delivered in 48 hours at the screening
tier without a qualification call. Lead with these rather than with what
is missing.

**This is the primary justification for the price gap, not a side
note.** The market's own position is that starting with automated
detection reduces expert audit time and therefore cost: Odysseus is that
starting step, priced as one. A client who later commissions a full
audit RGAA arrives with a whole-site crawl and a prioritized findings
set already in hand, which is real time saved for whichever auditor they
hire next, including a partner agency under the second channel in
section 5. The price is not low despite being a diagnostic; it is priced
as a diagnostic, because that is the product.

---

## 3. What each tier includes

Both tiers run one identical crawl and one `findings.json`. Differences
are expressed only at report generation, through template depth and
section inclusion.

**Screening, EUR 290 HT.** Executive summary, risk badge, top findings
by severity, counts only for behavioural checks, render diff evidence,
the criteria-and-registry-data section per
`docs/obligation-basis.md` section 7. No manual verification pass. No
conformity rate. No video.

**Full audit, EUR 1,200 to 1,900 HT.** Everything above plus theme
grouping, effort and impact framing, full selector detail, affected
pages, code-level appendix, before-and-after render diff. No manual
step of any kind, on either tier: the report is fully automated, full
stop, superseding the 2026-08-15 draft of this section which described
a narrowed set of hand-reviewed checks. Still not a conformity rate. No
video: dropped from both tiers, and brief section 3.3 item 4 is stale
and should be removed.

If a screening client upgrades within 30 days, the screening fee is
deducted.

---

## 4. The compliance section states facts

Applies to both tiers and binds the report templates. Full rule in
`docs/obligation-basis.md` section 7. In short: reproduce the criteria,
state this company's registry data, state whether the exemption
conditions appear met on that data, describe where the case law stands
including the Lille and Caen split, recommend confirming scope with a
lawyer. Do not conclude.

This is a template wording change, not an architectural one.
`assessObligations()` runs unchanged on the same inputs; it outputs
facts rather than a verdict.

---

## 5. Second channel: sell to the auditors

Accessibility agencies and freelances bill manual audit hours, and their
automated detection stage is pure cost. A tool that compresses it, in
French, aligned to the criteria they already work in, has a buyer who
understands the value immediately, already has clients, and needs no
cold outreach, no qualification pipeline, no deliverability ceiling and
no legal-perimeter argument at all.

Disadvantages, stated honestly: price-sensitive buyers, some have built
their own tooling, some are competitors, and a small population caps
total revenue below a broad SMB market. Access42 states it uses no
automated tooling at all and is not a prospect.

**Run as a parallel track from week one.** Five conversations cost a
week and settle whether the channel is real. Do not stop the SMB track
for it.

---

## 6. Objections and the honest answer to each

**"An overlay widget costs EUR 49 a month and says it makes me
compliant."** The Caen court rejected a 71 percent accessibility rate on
the reasoning that an e-commerce site cannot be only somewhat
accessible. An overlay does not change the underlying markup.

**"A court just said Auchan was not covered."** Correct, at Lille, in
référé, under appeal at Douai, while Caen went the other way five weeks
later. This is exactly why the offer does not sell a determination.

**"My site was built before June 2025."** Some sources say pre-2025
services have until 2030. The transitional provisions concern service
contracts rather than a website's age and the commercial sources garble
it. Say it is a question for their lawyer and do not claim either way.
See `docs/obligation-basis.md` section 3.

**"I run a hotel, does this even apply to me?"** Yes, on the same
footing as any online shop: a booking flow that concludes a consumer
contract online is generally treated as an electronic commerce service.
State it as the general reading, not as a determination for their
specific business, per the report-not-conclude rule. Do not soften this
one relative to a standard e-commerce prospect; the evidence does not
support treating hotels as a harder case.

**"Free scanners exist."** They do, and the screening includes what they
produce. What they do not produce is render diff evidence, the registry
data section, prioritisation aimed at a non-technical reader, or a
document that can be handed to a developer as a work order.

**"My site is fine, my developer said so."** The report is checkable.
Every finding names a page and a selector. Invite them to have the
developer verify one.

**"It would cost too much to fix."** Disproportionate burden is a real
exemption, and it is a documented evaluation filed on request, not an
absence of action. Note before recommending any subsidy route: taking
public funding intended to improve accessibility removes the right to
invoke disproportionate burden for that service.

**"Why should I trust a one-person operation?"** No good answer yet.
This is what the case study and the published benchmark study are for,
and the reason those precede scaled outreach rather than following it.

**"Why is this cheaper than a real audit RGAA?"** Because it is a
different, earlier product, not a cut-rate version of the same one.
Odysseus is the automated first step a business runs before
commissioning a full audit RGAA: whole-site crawl, prioritized findings,
render diff evidence, delivered in days rather than the weeks a full
manual audit takes. It is priced as that starting step, decided
2026-08-16 (section 1's pricing note), not as an audit RGAA sold below
market. Do not answer this with a claim of manual verification depth;
that claim was removed for accuracy and the pre-audit framing replaces
it, not supplements it.
