# Operator obligations

Odysseus's own regulatory position, as distinct from the client's, which
is in `docs/obligation-basis.md`. Written 2026-08-15.

This file exists because two of these have hard dates inside the next
month and one of them constrains what the product may say.

---

## 1. Dated obligations

| Date | Obligation | Status |
|---|---|---|
| 2 August 2026, already in force | AI Act article 50 transparency obligations applicable | see section 3 |
| 11 August 2026, already in force | Unsolicited telephone prospecting prohibited without prior explicit consent or an existing contract | see section 5 |
| **1 September 2026** | Every French VAT-assujetti business, including micro-entreprises in franchise en base, must be able to **receive** electronic invoices through a Plateforme Agréée | see section 4 |
| 1 September 2027 | Micro-entreprises must **issue** electronic invoices and do e-reporting | see section 4 |

---

## 2. Perimeter of legal advice

Loi n° 71-1130 du 31 décembre 1971, article 54, prohibits giving
consultations juridiques habitually and for remuneration without a law
degree or, for a non-regulated activity under article 60, an agrément
delivered by arrêté. Article 60 additionally requires a qualification
recognised by the State or attested by an approved professional body.
Neither exists here. There is case law in which an activity presenting
itself as a technical audit was held to be juridique in nature, in
breach of articles 54 and 60, with the resulting report excluded from
proceedings. Status: primary for the articles, secondary for the case
law summary.

A compliance section that applies the law to a specific client's
situation, concludes they are bound, and states what they must do, is a
personalised opinion on a specific question intended to guide a
decision. Close enough to the prohibited perimeter that it must not be
the differentiator the offer rests on.

**Operating rule** is in `docs/obligation-basis.md` section 7 and binds
report templates directly.

**Optional upgrade, worth pricing once revenue exists.** A lawyer
partner who reviews and signs the scope section converts the weakest
part of the offer into the strongest and removes the question entirely.
Cost per report is small if the review covers a template plus a data
block rather than freeform prose.

---

## 3. AI Act, article 50

Regulation (EU) 2024/1689. Article 50 transparency obligations became
applicable **2 August 2026**. Sanctions under article 99 reach EUR 15
million or 3 percent of worldwide turnover, obviously scaled to the
operator, but the obligation is real rather than notional.

Odysseus is a **deployer**, not a provider: the model is Mistral's.
Provider obligations, including machine-readable marking of synthetic
content under 50(2), sit with Mistral. Deployer obligations under 50(4)
cover deepfakes and **text published to inform the public on matters of
public interest**. This is a narrow category: a document sent privately
to one paying client is not "publishing to inform the public," so it
does not apply by definition, not because of any mitigation we add.

**Assessment by output:**

- **Client audit reports, both tiers.** Commissioned, private,
  single-recipient deliverables. Not public-interest text. Out of scope
  for 50(4), full stop. **No change to the LLM report pipeline.**
  Continue generating with Mistral exactly as built.
- **Outreach emails.** Private commercial communication to one prospect.
  Out of scope for the same reason. No change.
- **The benchmark study, milestone 10.** The one document in this
  product that is actually published to the general public. This is the
  only place 50(4) is even plausibly engaged.

**Fix for the study, corrected 2026-08-16.** An earlier version of this
file recommended writing the study by hand to avoid the question
entirely. That is stronger than necessary and not worth the cost of
manually drafting 20-plus pages. **The actual requirement is disclosure,
not authorship.** Generate the study with Mistral as with everything
else, and add one visible line near the top, not buried in a footer or
the CGU:

> Cette étude a été rédigée avec l'assistance d'un outil d'intelligence
> artificielle, à partir de données de scan automatisées.

That single sentence satisfies 50(4) if it applies, and costs nothing
against the existing pipeline. Hand-writing remains an option if a
fully manual document is wanted for other reasons, but it is not what
this regulation requires.

**If a conversational assistant is ever added to the site**, article
50(1) requires telling people they are talking to an AI. The milestone
12 scope check is a form, not an assistant, so this does not apply as
currently specified.

Status: secondary. Verify the 50(4) reading before publishing the study,
not before scanning anything, and not before any client report.

---

## 4. Electronic invoicing

**1 September 2026, seventeen days from this writing.** Every business
registered in France and assujettie à la TVA must be able to receive
electronic invoices through a Plateforme Agréée. Franchise en base does
not exempt: a micro-entrepreneur in franchise is not redevable but is
still assujetti, and is therefore in scope.

Action required: choose a Plateforme Agréée before 1 September 2026.
The same platform can serve reception now and issuance later, so choose
once. Suppliers, including hosting, insurance and accounting software,
will start sending through the network on that date.

**1 September 2027:** issuance and e-reporting for micro-entreprises.
From that point a PDF attached to an email is no longer a compliant B2B
invoice; it must be a structured format (UBL, CII or Factur-X) sent
through a platform.

Commercial side note: every prospect in the target segment is also
dealing with this in late August and early September. That is
competition for attention, and it argues for the first outreach wave
landing either before or after that window rather than inside it.

Status: secondary but consistent across many sources including
accounting vendors and the KPMG summary of the ministry's confirmation.
Verify the platform choice against the official list.

---

## 5. Prospecting channel rules

**Email, B2B.** Opt-out regime on a legitimate interest basis, provided
the message relates to the recipient's professional activity, the
recipient is informed at first contact per RGPD article 14 including
where the data came from, and every message carries a simple free means
of objecting. Free-mail addresses used for business are treated as
personal and are excluded. Full rules in `docs/outreach-rules.md`.

**Telephone. Closed.** Since 11 August 2026 unsolicited telephone
prospecting is prohibited without prior explicit consent or an existing
contractual relationship. Phone is a follow-up channel for people who
have replied, not a prospecting channel. Status: secondary, verify
before any call. This matters more than it looks, because "just call
them" was the obvious fallback if email underperforms, and it no longer
exists.

---

## 6. Tax and status

**VAT is the binding threshold, not the micro-entreprise ceiling.** For
2026, franchise en base for prestations de services is EUR 37,500 base
and EUR 41,250 majoré; the proposed single EUR 25,000 threshold was
abandoned. The micro-entreprise regime ceiling for services is
EUR 83,600, more than twice as far away.

Crossing the base threshold makes VAT due from 1 January of the
following year. Crossing the majoré threshold makes it due from the day
of crossing. So track cumulative revenue continuously rather than
discovering it in January.

**All prices displayed HT from the first day**, per
`docs/offer-positioning.md`. Clients are businesses and recover VAT, so
this is neutral for them and avoids a price that silently rises later.

---

## 7. Not yet researched

**Professional liability insurance.** A report a client acts on, or does
not act on, followed by a regulator or association disagreeing, is the
scenario RC Pro exists for. Not mandatory for this activity as far as is
known, and worth one conversation with a broker before the first paid
delivery rather than after it. Note also that article 54 of loi 71-1130
conditions accessory legal practice on holding professional liability
cover, which is a second reason to have it even though the operating
rule avoids that perimeter.

**Odysseus's own site accessibility.** odysseusaudit.com is under 10
employees and under the turnover threshold, so it is exempt. It should
still pass its own scanner, for the obvious reason.
