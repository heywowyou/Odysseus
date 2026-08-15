# Obligation basis

Canonical source of legal facts about **the client's** position. Feeds
`assessObligations()`, the compliance section of the report, and any
claim made in outreach. Nothing legal may be stated anywhere in the
product unless it appears here with status `primary`.

Odysseus's own regulatory obligations are in
`docs/operator-obligations.md`, which is a separate subject.

Created and revised 2026-08-15 across four passes. Section 10 records
what earlier passes got wrong.

---

## 0. Verification convention

- `primary` — checked against Légifrance or an official publication.
  Only these may reach a client or a prospect.
- `secondary` — multiple independent sources agreeing. Internal use only.
- `disputed` — sources or courts contradict each other. Never asserted.

---

## 1. Instruments

| Instrument | Reference | Status |
|---|---|---|
| EU directive | 2019/882, 17 April 2019 | primary |
| French transposition | loi n° 2023-171 du 9 mars 2023, art. 16 | primary |
| Consumer code | art. L412-13 code de la consommation | primary |
| Decree | décret n° 2023-931 du 9 octobre 2023 | primary |
| Codified provisions | art. D412-49 à D412-62 code de la consommation | primary |
| Sanction provision | art. R451-4 code de la consommation | primary |
| Requirements | arrêté du 9 octobre 2023, chap. III, art. 8 à 10 for services | primary |
| Application | services provided after 28 June 2025 | primary |

---

## 2. Two regimes, never merged

The most important thing in this file. Almost every commercial source
blends them, and the blend produces wrong thresholds, wrong referentials,
wrong obligations and wrong sanction amounts, always in the direction of
overstating.

**Regime 1, article 47 of loi 2005-102.** Public bodies, and since 2016
private companies above EUR 250 million average turnover over three
years. Referential RGAA. Supervisor ARCOM. Carries the déclaration
d'accessibilité, schéma pluriannuel and action plan obligations.

**Regime 2, EAA via art. L412-13.** Consumer-facing services in the
listed sectors, above the microenterprise threshold. Referential:
harmonised European standards. Supervisor: market surveillance.
Carries technical documentation and consumer information obligations,
not the RGAA declaration trio.

Odysseus prospects are almost entirely regime 2.

L412-13 opens "sans préjudice des articles 47 et 48 de la loi
n° 2005-102", the textual basis for treating the regimes as cumulative
rather than alternative. Status: primary. Section 5 covers why a court
read them the other way.

---

## 3. Scope test, regime 2

**Prong A, size.** The microenterprise exemption applies only where
fewer than 10 persons are employed AND turnover or balance sheet total
does not exceed EUR 2 million. Failing either prong removes the
exemption. Status: secondary, consistently stated, not yet read in the
decree text itself.

Headcount of 10 or more therefore establishes scope on the size prong
alone. Headcount under 10 does not establish exemption.
`docs/prospect-qualification.md` qualifies on headcount only.

**Prong B, sector.** Electronic commerce, consumer banking, electronic
communications, passenger transport, audiovisual media access services,
ebooks and dedicated software. Status: primary.

An online shop is an electronic commerce service regardless of the legal
form of the operator: distance selling by electronic means is an
economic activity. Status: secondary, consistent with Carrefour not
contesting assujettissement at Caen.

**Scope covers the whole digital service, not the visible interface.**
Authentication flows, payment, interaction with assistive technologies,
and user-facing documentation are all in scope. Status: secondary. This
is why the transactional flow detector and the behavioural checks are
the commercially relevant part of the scan, not the page-level
violations count.

**Hotels and accommodation.** Upgraded from `disputed` to `secondary`
on this pass. Booking services concluding a consumer contract online are
generally treated as electronic commerce services, and several French
sources apply this reading to tourism businesses specifically, including
one source that states it directly for hotels. Not named separately in
the sector list, not confirmed by a French court or authority, but the
reading is now the consistent one across independent sources rather than
a single hopeful blog post.

Practical effect: hotels are on comparable legal footing to a standard
online shop and the argument B facts block may be used with hotel
prospects on the same terms as any other e-commerce prospect, not held
back out of caution. It may state that a booking flow concluding a
contract online is generally treated as an electronic commerce service,
attributed as a general reading rather than as this company's settled
position, per section 7's report-not-conclude rule. First study and
first outreach wave still target unambiguous e-commerce, chosen for
volume and clarity of framing, not because hotels are legally weaker.

**Known objection, unresolved: "my site predates June 2025."** Some
commercial sources state that services or content published before 2025
have until 28 June 2030. The directive's transitional provisions concern
service contracts concluded before 28 June 2025, which is not the same
thing as a website's age, and commercial sources garble this. Status:
disputed. Do not answer this objection with a claim until it is
resolved; say it is a question for their lawyer.

---

## 4. Requirements and referential

Service requirements are in the arrêté du 9 octobre 2023, chapter III,
articles 8 to 10, restating perceivable, operable, understandable,
robust. Status: primary.

**Presumption of conformity.** Art. D412-59 gives a presumption of
conformity to products and services conforming to harmonised European
standards. The only applicable harmonised standard is **EN 301 549**.
Status: primary for the mechanism, secondary for "only EN 301 549".

**RGAA is not the regime 2 referential.** It is the article 47
referential. Telling an EAA-covered SMB they must comply with RGAA 4.1.2
cites the wrong instrument. Where a standard is named for a regime 2
client, name EN 301 549. DINUM has announced RGAA 5 aligned on a newer
EN 301 549 including WCAG 2.2, targeted end 2026. Status: secondary,
worth tracking because it changes how our WCAG 2.2 checks map to a legal
criterion.

**Mapping requirement.** The scanner runs WCAG 2.2 checks. A 2.2-only
failure is not presently a legal non-conformity under either regime. The
finding-to-criterion layer must keep them separable.

---

## 5. Enforcement, three routes, one contested

**Route 1, market surveillance.** The DGCCRF is described in some
sources as the transverse control authority for everything except the
ebook, and in others as one of several sector authorities alongside ACPR
and Banque de France for consumer banking, ARCEP for electronic
communications and ARCOM for audiovisual media access. Both may be true
simultaneously. Status: secondary, and name the authority cautiously.

Art. R451-4 punishes breaches of the D412-49 et seq. provisions with the
fine for a contravention de 5e classe, EUR 7,500 for a legal person,
cumulable, reported at EUR 15,000 on récidive with an injunction under
astreinte. Status: primary for R451-4 and the 5e classe qualification,
secondary for astreinte figures. Field checks reported active since
January 2026 with a pedagogical opening posture, publicly reported
targets being large retail. Status: secondary.

**Route 2, article 47.** ARCOM, up to EUR 50,000 per service,
EUR 25,000 for declaration and schéma obligations. Public bodies and
companies above EUR 250M. Status: secondary.

**The EUR 50,000 figure belongs to route 2** and is quoted throughout
this market as though it applied to an SMB under route 1. Odysseus never
uses it in an EAA context.

**Route 3, civil action by associations. Contested.** Two conflicting
référé decisions in 2026, both brought by apiDV and Droit Pluriel with
support from Intérêt à Agir.

- **Lille, 5 May 2026, Auchan E-Commerce.** Associations dismissed. The
  judge accepted the site was non-conforme, which Auchan did not
  contest, but held no obligation applied because the entity did not
  exceed the EUR 250 million article 47 threshold. Appeal lodged before
  the cour d'appel de Douai.
- **Caen, 4 June 2026, Carrefour France.** Injunction to make
  carrefour.fr and the mobile application fully accessible within six
  months, astreinte EUR 500 per day, EUR 10,000 damages. Carrefour did
  not contest assujettissement and argued a 71 percent accessibility
  rate. Rejected: an e-commerce site cannot be only somewhat accessible.
- **Créteil, E.Leclerc, hearing postponed to 22 September 2026.** Picard
  Surgelés also under mise en demeure.

Status: secondary, from many independent sources including the
associations' own publications and national press.

**Consequence.** A lawyer advising an SMB today can point at Lille and
argue the client is not covered. Any Odysseus output stating scope as
settled is commercially fragile and factually wrong. The defensible
position: the text creates the obligation, its application below the
article 47 threshold is contested at first instance, and an appeal is
pending.

The Caen reasoning that partial accessibility does not discharge the
obligation is separately usable, and is the strongest available argument
against overlay widgets and against doing a little and stopping.

---

## 6. What a regime 2 entity actually owes

Not the RGAA declaration trio. Per décret 2023-931, a service provider
holds documentation covering, where applicable, a general description of
the service in accessible formats, the explanations needed to understand
how it works, and a description of how the L412-13 accessibility
requirements are met, together with information demonstrating that the
service delivery process and its monitoring ensure conformity.
Harmonised standards may be applied in whole or in part. Authorities may
request a copy. Status: primary.

**Disproportionate burden.** Operators may claim it, must evaluate it in
conditions set by decree, and must be able to produce the evaluation on
request. L412-13 adds that an operator receiving public or private
funding from sources other than its own resources for the purpose of
improving the accessibility of that product or service cannot invoke it.
Status: primary. Useful when a prospect raises burden as a reason to do
nothing: it is a documented, evidenced filing, not an absence of action.
Also worth knowing before recommending any subsidy route to a client,
since taking the money closes that door.

---

## 7. Operating rule: we report, we do not conclude

Underlying legal basis in `docs/operator-obligations.md` section 2. The
rule that binds report templates and outreach:

Permitted:
- reproducing the criteria as the texts set them out
- stating registry facts for this company: headcount band, NAF, SIREN,
  sector, and whether the two exemption conditions appear met on that
  data
- describing the current state of the case law including the split
- recommending that scope be confirmed by a lawyer

Not permitted:
- "you are subject to the EAA" or any equivalent conclusion
- "you must do X by date Y"
- any statement of what a sanction would be in this client's case
- any scope statement presented as settled

The distinction is between informing and advising, and it is thinner
than it looks, which is why the wording lives in template code rather
than in a prompt.

---

## 8. Statistics

No population or prevalence figure is approved. Table empty. Rejected:
the claim that 3 to 4 percent of French sites are accessible.
Vendor-sourced, methodology unstated, and commercially counterproductive
since it implies non-conformity is unremarkable.

---

## 9. Remaining verification

- microenterprise threshold wording in the decree text itself
- astreinte and récidive figures under route 1
- confirmation that EN 301 549 is the only applicable harmonised standard
- the transitional provisions and the 2030 date, section 3
- the Caen and Lille ordonnances themselves rather than press summaries
- outcome of Créteil, 22 September 2026

None of these block a first sale. Each blocks a specific sentence, and
until it is resolved that sentence is simply not written.

---

## 10. Corrections log

1. **Declaration trio attributed to the EAA.** It is article 47. An
   entire commercial argument was built on it before this was caught.
2. **RGAA given as the EAA referential.** It is EN 301 549.
3. **Case law described as settled in our favour.** Lille went the other
   way five weeks before Caen and is under appeal.
4. **EUR 50,000 treated as a regime 2 figure** while simultaneously
   flagging others for misquoting it.
5. **Scope determination treated as a product feature** before the
   perimeter of legal advice was checked.
6. **Hotels treated as harder than they are, twice.** First pass called
   it disputed on one source. Second pass raised it to secondary but
   still hedged the practical guidance toward caution. Hotels sit on the
   same footing as ordinary e-commerce and should be treated that way in
   outreach and in the report, not held to a stricter standard than the
   evidence supports.
7. **AI Act fix overcorrected.** An earlier version of this file
   recommended hand-writing the entire benchmark study to avoid article
   50(4). The actual requirement is a one-line disclosure, not a change
   of authorship, and the LLM report and outreach pipelines were never
   in scope for 50(4) at all since they are private, single-recipient
   documents. See `docs/operator-obligations.md` section 3.

Common shape: a commercial source stated something convenient, others
repeated it, and agreement between sources that copy each other is not
corroboration.
