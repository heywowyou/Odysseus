# Offer positioning

What is sold, at what price, and what it explicitly is not. Written
2026-08-15. Supersedes the pricing subsections of brief section 3.2
where they conflict.

**Revised 2026-09-17: flat price lowered from EUR 1,600 HT to EUR 990
HT** (issue #405, trade-off 96). The figure is the only thing that
changed: still one offer, one full audit, one report, no tier, package,
discount, range or add-on. Section 1's table below is current. Every
EUR 1,600 HT mention elsewhere in the repository describes the
2026-08-16 to 2026-09-17 period and is history. The EUR 450 HT re-audit
price is unchanged and is not a percentage of the full audit price. The
code-owned figure is `ODYSSEUS_FULL_AUDIT_PRICE_EUR_HT` in
`packages/core/src/offer/pricing.ts`.

**Revised 2026-08-16: single-tier commercial model, flat price.** The
paid EUR 290 screening tier is dropped entirely, not narrowed. The full
audit is now the only paid deliverable, and its price is a flat,
published price, not a risk-banded EUR 1,200 to 1,900 range set per
client after the scan. In its place, a free, pre-purchase **outreach
preview** document now exists, sent to cold prospects before they buy
anything. It is not a smaller version of the paid report and is not a
"tier" of it: it has its own content rules in `docs/rules/outreach-rules.md`,
and in particular never contains selectors, finding IDs, or exact page
locations, the way the old screening tier did. Every "two tiers" / "both
tiers" reference below and in brief section 3.2, and every mention of a
EUR 1,200 to 1,900 range or a risk band setting the price, is stale and
describes the pre-2026-08-16 model; read it as history, not as the
current offer. The risk-banding *reasoning* (why price should track risk
level rather than a per-finding formula) is kept below for the record,
but does not currently drive a price, since there is now one flat price.

**Revised again 2026-08-16, same day: flat price raised from EUR 300 HT
to EUR 1,600 HT.** Pricing decision only; the product and deliverables
are unchanged (M8.5 will add substance to justify the tier separately).
Reasoning: EUR 300 HT read as a low-credibility, comparison-shopping
price rather than a considered one, and undercut every published market
floor by a wide enough margin to raise doubt about the offer's quality
rather than remove it. The free outreach preview (section 1, and
`docs/rules/outreach-rules.md`) now carries the trust-building, low-risk
first-contact job that the low flat price was originally covering, so
the paid tier no longer needs to be priced as an entry point. Section
1's "why the prices are not being raised" argument and section 2's price
comparison below describe the EUR 300 HT reasoning and are superseded by
this note; read them as history of how EUR 300 HT was arrived at, not as
the current position. `docs/product/odysseus-project-brief.md`'s references
to EUR 300 HT are likewise superseded here, the canonical source.

---

## 1. Prices, held

| Deliverable | Price | Delivery |
|---|---|---|
| Outreach preview | Free | built from a candidate-linked full outreach scan, published by the operator from the audit page as an expiring token page; content rules in `docs/rules/outreach-rules.md` section 6bis |
| Full audit | EUR 990 HT flat, published | automated PDF, no risk band, no freehand quote, from the prospect's Full scan (trade-off 91) |
| Re-audit | EUR 450 HT flat | 5 business days, a verification pass narrower in scope than a full re-scan |

**Re-audit price confirmed 2026-08-19** (La Corniche review follow-up,
retained in Git history), roughly 28% of the full audit price as it then
stood. It is an approved flat figure, not a percentage, and stays at EUR
450 HT now that the full audit is EUR 990 HT. This is the
canonical source for
`ODYSSEUS_REAUDIT_PRICE_EUR_HT` / `ODYSSEUS_REAUDIT_LEAD_TIME_DAYS` in
`packages/report/src/template/html-utils.ts`.

**Full audit price in code, 2026-08-29.** The published full-audit price is
`ODYSSEUS_FULL_AUDIT_PRICE_EUR_HT` in `packages/core/src/offer/pricing.ts`, with
`formatFullAuditPrice()` as the one approved spelling in each language. It sits
in `core` rather than beside the re-audit price because more than one package
has to agree about it: the outreach preview renders it, and plan 010's prose
validator (in `llm`, which can only see `core`) has to recognise it in order to
reject any other figure. The formatter normalizes the French thousands
separator to U+00A0, so the rendered bytes do not change with the host's ICU
version. The Stripe link amount is still updated by hand (trade-off 13).

**A price change revokes and reissues every live preview, amended
2026-09-19 by Plan 069.** Preview HTML embeds the amount at publication time,
so any live v1/v2/v3 object carrying the old figure becomes a misquoted offer.
The procedure, recorded here because the amount is an offer fact: change
`ODYSSEUS_FULL_AUDIT_PRICE_EUR_HT`, and in the same deployment revoke every
live preview for affected prospects, then reissue under the new amount.
Existing first-touch drafts that quote the old amount are regenerated, not
sent as-is. The public site's own price line moves in the same change (it is
literal text pinned by `packages/core/src/offer/pricing.test.ts`, trade-off
43).

**Displayed HT everywhere from the first day.** Reasoning and the VAT
threshold that makes this urgent are in
`docs/rules/operator-obligations.md` section 6.

**Why the price was not being raised (superseded 2026-08-16, see the
note above; kept as history of the EUR 300 HT reasoning).** Published
market ranges for a
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
better. The objection is never "too expensive", it is "I do not believe
this matters". Price is not the lever. Proof is. Revisit pricing only
after a case study and a published study exist, when comparison becomes
the actual sales conversation.

**Pricing decided 2026-08-16, band since replaced by a flat price the same day (see the note above).** Auditing the manual-accessibility
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
does not produce that, and a prospect placing a EUR 990 Odysseus
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
non-technical decision maker. Lead with these rather than with what is
missing.

**Amended 2026-09-02, plan 021 (`docs/decisions/trade-offs.md` entry 64).**
"Whole-site crawl" means the inventory is not capped or template-sampled the
way an audit RGAA's own methodology is: every eligible declared page is
resolved and every successfully crawled HTML page, including every listing,
receives content-sensitive analysis (render diff, axe, the extended pass). It
does not mean every tool runs identically on every URL. Performance
measurement (Lighthouse) uses a disclosed deterministic page selection stratified by
page role, template family, and language, because it is the expensive,
serialized, re-navigating check, not the content-defect check. Do not answer
"does every page get scanned?" with an unqualified yes; answer with content
coverage being total and performance coverage being sampled and disclosed.

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

## 3. What the full audit includes

**Revised 2026-08-16: single deliverable, no tier split.** Executive
summary and risk badge, ranked priorities with effort and impact
framing, full selector detail and affected pages, render diff evidence,
the code-level appendix, the criteria-and-registry-data section per
`docs/rules/obligation-basis.md` section 7, and a draft accessibility
statement skeleton. No manual verification step of any kind: the report
is fully automated, full stop. Still not a conformity rate. No video.

**Amended 2026-09-02, plan 021 (`docs/decisions/trade-offs.md` entry 64).**
Content-sensitive analysis (render diff, axe, the extended accessibility
pass) covers every successfully crawled HTML page, including every listing
and archive page, with no page-count sampling or per-template shortcut.
Performance measurement (Lighthouse, and the Core Web Vitals it reports) uses a
disclosed deterministic page selection: always the homepage, every transactional and
seeded page, every unique page, and a stable representative plus a measured
cost outlier per repeated template family and language, never the full page
count. The report states inventoried, content-checked, and
performance-measured counts separately rather than one undifferentiated
"pages scanned" figure.

The free outreach preview sent before purchase (`docs/rules/outreach-rules.md`
section 6bis; current v3 contract from Plan 069) is a different, deliberately
thinner document, not a lighter tier of this one. It uses the same stored Full
scan and the selected French report structure, but only as an ordering
authority: coverage/count/severity facts are deterministic, and its three
public cards follow the first three report priorities while using reviewed
bilingual public copy rather than report prose. Plan-068 client limitations
may appear in bounded form; operational warnings never do. It never contains
screenshots, selectors, finding IDs, exact page locations, occurrences,
remediation, model prose, model risk, or a conformity rate. Publication still
waits for current FR and EN reports (trade-off 95), so the preview never
describes evidence the paid report could not deliver.

---

## 4. The compliance section states facts

Binds the report template. Full rule in
`docs/rules/obligation-basis.md` section 7. In short: reproduce the criteria,
state this company's registry data, state whether the exemption
conditions appear met on that data, describe where the case law stands
including the Lille and Caen split, recommend confirming scope with a
lawyer. Do not conclude.

This is a template wording change, not an architectural one.
`assessObligations()` runs unchanged on the same inputs; it outputs
facts rather than a verdict.

**Plan 020 boundary.** When the deterministic assessment includes the EAA
context, the detailed legal section may reproduce the one primary-sourced
general EUR 7,500 sentence owned by `eaaSanctionFigureSentence(...)`. It is not
placed beside client facts, findings, opportunity estimates, or prices, and it
never states what this client faces. No other sanction amount or enforcement
procedure is added.

## 4bis. Financial opportunity is optional, singular, and evidence-bound

The executive summary may show at most one **indicative improvement
opportunity**. It is not a loss estimate, forecast, return on investment, or
comparison with the audit price. It renders only when one explicitly opted-in
primary reference matches the recorded sector, measured metric, successful
deterministic evidence, qualifying performance problem, and traceable annual
turnover. Broad editorial `scales-down` status alone is never permission to
calculate money.

The amount uses one conservative bounded calculation and appears once with its
adjacent citation. It is never repeated on priority themes and is never summed
across findings, pages, occurrences, or references. When any required fact is
missing or mismatched, the client report omits the financial block entirely;
only the private operator preview explains the typed omission reason.

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
See `docs/rules/obligation-basis.md` section 3.

**"I run a hotel, does this even apply to me?"** Yes, on the same
footing as any online shop: a booking flow that concludes a consumer
contract online is generally treated as an electronic commerce service.
State it as the general reading, not as a determination for their
specific business, per the report-not-conclude rule. Do not soften this
one relative to a standard e-commerce prospect; the evidence does not
support treating hotels as a harder case.

**"Free scanners exist."** They do, and the free outreach preview
includes what they produce, at no cost. What they do not produce is
render diff evidence, the registry data section, prioritisation aimed at
a non-technical reader, or a document that can be handed to a developer
as a work order, all of which are in the paid full audit.

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
