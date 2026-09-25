# Obligation basis

Canonical source of legal facts about **the client's** position. Feeds
`assessObligations()`, the compliance section of the report, and any
claim made in outreach. Nothing legal may be stated anywhere in the
product unless it appears here with status `primary`.

Odysseus's own regulatory obligations are in
`docs/rules/operator-obligations.md`, which is a separate subject.

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

**Prong A, size.** Art. L412-13 code de la consommation: « Les
entreprises employant moins de dix personnes qui fournissent des services
et dont le chiffre d'affaires annuel n'excède pas deux millions d'euros ou
dont le total du bilan n'excède pas deux millions d'euros sont dispensées
des exigences d'accessibilité ». Same definition as directive art. 3(23).
Status: primary, read in the code text on 2026-09-24.

So a service provider is exempt with fewer than 10 persons AND either
turnover or balance sheet total at or below EUR 2 million. It is in scope
on size with 10 or more persons, or with turnover AND balance sheet total
both above EUR 2 million. Turnover above EUR 2 million alone decides
nothing: no source we use publishes the balance sheet, so
`assessObligations` resolves that case to `undetermined`
(`sme-balance-sheet-unknown`). Exactly EUR 2 million is within the
exemption.

Headcount of 10 or more therefore establishes scope on the size prong
alone. Headcount under 10 does not establish exemption.
`docs/rules/prospect-qualification.md` qualifies on headcount only.

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
position, per section 7's report-not-conclude rule.

**First-wave application.** The first outreach wave targets hotels.
Ruled by the operator on 2026-09-08 and recorded in
`docs/product/first-100-rollout-runbook.md`: this section's practical
effect governs the first wave, superseding the older primary-status
requirement in the 9c milestone note of `docs/decisions/trade-offs.md`.
The argument B facts block may be used with hotel drafts from the first
send, still subject to section 7's report-not-conclude rule.

**A form is not a transactional flow (issue #294, 2026-09-16).**
The deterministic detector's weakest flow signal is a form element whose
action or class matches checkout/cart vocabulary. Real sites match it
with generic contact-form plugins (haaitza.com's Gravity Forms was
reported as the site's "booking engine" on exactly this signal), so a
`checkout-form` match alone never establishes that a contract can be
concluded online. When it is the only flow evidence, the obligation
engine resolves the gate to `likely_in_scope` ("Parcours à confirmer")
with a `transactional-flow-form-only` fact, and no report surface may
name a plugin as a booking engine or state an on-site flow from it.
Payment scripts, named booking engines, confirmed delegated redirects
and booking iframes keep asserting the flow.

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

Underlying legal basis in `docs/rules/operator-obligations.md` section 2. The
rule that binds report templates and outreach:

Permitted:
- reproducing the criteria as the texts set them out
- stating registry facts for this company: headcount band, NAF, SIREN,
  sector, and whether the two exemption conditions appear met on that
  data
- describing the current state of the case law including the split
- reproducing the existing primary-sourced, deterministic EUR 7,500 EAA
  sentence as a general legal reference, in the detailed legal section
  when the report includes the EAA context, and since 2026-09-04
  (issue #57) additionally in the executive section's own
  regulatory-context block under the same in-scope gate. It remains
  grammatically general in both locations, is separated from client
  facts and finding counts, and is never described as this client's
  sanction or exposure
- recommending that scope be confirmed by a lawyer

Not permitted:
- "you are subject to the EAA" or any equivalent conclusion
- "you must do X by date Y"
- any statement of what a sanction would be in this client's case
- any scope statement presented as settled

The general EAA reference is a narrow exception to the presentation rule, not
to the legal-advice rule. It uses `eaaSanctionFigureSentence(...)` unchanged,
appears at most once in each of the two permitted locations (executive
regulatory-context block, detailed legal section) and nowhere else, and
permits no arithmetic, procedural claim, client name, possessive wording,
deadline, or conclusion about whether the amount could apply to this company.
The EUR 50,000 article 47 figure remains prohibited in an EAA context. LCEN
sanctions remain unverified and never render. The 2026-09-04 executive
amendment exists because a reader who stops after the executive pages was
left with no sense that a regulatory regime is involved at all; the executive
block carries the criterion, the unchanged general sentence, and the
lawyer-confirmation recommendation, and adds no client-specific claim the
detailed section does not already make.

The distinction is between informing and advising, and it is thinner
than it looks, which is why the wording lives in template code rather
than in a prompt.

### 7.1 Legal paragraph shape

The report's legal paragraph (`renderLegalCitationParagraph`, spliced from
`packages/core/src/compliance/regimes.ts`) has this shape, since issue #306:

- FR: « Critères publiés pour l'{obligation} ({citation}), dont le contrôle
  relève {de la/du} {autorité}. Faits vérifiés pour cet audit : {faits} »
- EN: "Published criteria for the {obligation} ({citation}), overseen by
  {authority}. Facts verified for this audit: {facts}"

Rules that hold it to one clean sentence per fact:

- The law is cited once, in `legalCitation`. A regime `name` is the
  obligation alone and never carries its own citation.
- The name and the first fact are lowered at their initial where they land
  mid-sentence. An acronym is never lowered.
- English wording describes the law and the authority in English. It keeps
  the official French name only as a parenthetical, for example "France's
  consumer protection authority (DGCCRF, Direction générale de la
  concurrence, de la consommation et de la répression des fraudes)" and
  "French Law No. 2023-171 of 9 March 2023, articles 16 to 19".
- A note printed under the paragraph adds to it (example pages, the
  confirmation step) and never repeats one of its fact sentences.


### 7.2 French wording of the scope labels

A native-speaker review of two delivered reports (2026-09-19) found the
French scope wording translated from English. The following rewrites change
the French only; the legal meaning, the facts cited and the "report, do not
conclude" rule above are unchanged. They are recorded here for operator
sign-off because they touch legal wording:

| Before | After |
| --- | --- |
| « Statut d'obligation » (label) | « Applicabilité de l'obligation » |
| « le statut d'obligation de ce site est traité séparément » | « l'applicabilité des obligations à ce site est traitée séparément » |
| « obligations documentées à l'article D412-49 et suivants » | « obligations définies à l'article D412-49 et suivants » (not « prévues », which the same sentence repeats as « l'amende prévue ») |
| « la section « Cadre réglementaire » rapproche ces critères des faits disponibles » | « … met ces critères en regard des informations disponibles » |
| « faites-le confirmer avant de vous appuyer sur ce statut » | « faites confirmer ce point avant d'en tirer une conclusion sur l'applicabilité de l'obligation » |
| « Les obligations sont donc déjà en vigueur, depuis {durée}, pas à venir. » | « Les obligations sont donc en vigueur depuis {durée} ; il ne s'agit pas d'une échéance à venir. » |
| « parcours transactionnel » (status descriptions) | « parcours de réservation ou d'achat en ligne (« parcours transactionnel ») » on first use |
| « le répertoire indique la tranche d'effectif 00 » | « le répertoire indique un effectif de 0 salarié » (INSEE label, not the code; NN reads « un effectif non renseigné ») |
| out_of_scope status line « soit un effectif et un chiffre d'affaires sous les seuils cités, soit … » when the SME facts resolved it | « D'après le répertoire Sirene, l'effectif et le chiffre d'affaires se situent sous les seuils de l'article L412-13 du code de la consommation : moins de dix personnes employées et un chiffre d'affaires annuel n'excédant pas deux millions d'euros. » Cites the section 3 criterion the old line called « cités » without printing; a comparison of inputs, no exemption verdict. An NN headcount keeps the generic line. |
| out_of_scope status title « Seuil ou parcours non observé » when the SME facts resolved it | « Sous les seuils de taille ». The generic title read as contradicting a card body that names the thresholds. Same condition as the status line above; an NN headcount keeps the generic title. |
| Presentation-section reminder « Certaines obligations d'accessibilité peuvent également concerner votre établissement… » when the SME facts resolved out_of_scope | « D'après le répertoire Sirene, l'effectif et le chiffre d'affaires de votre établissement se situent sous les seuils de taille publiés pour l'obligation d'accessibilité numérique : la section « Cadre réglementaire » décrit ces critères et les faits enregistrés, à faire confirmer par votre conseil juridique. » A comparison of inputs with the counsel deferral kept; no exemption verdict. |

---

## 8. Statistics

No population or prevalence figure is approved. Table empty. Rejected:
the claim that 3 to 4 percent of French sites are accessible.
Vendor-sourced, methodology unstated, and commercially counterproductive
since it implies non-conformity is unremarkable.

---

## 8bis. LCEN identification obligation (mentions légales)

Added 2026-08-24. A separate obligation from everything above, and the
only one in this file that applies to every client without a scope test.

**The requirement.** Article 1-1, I, 2° of loi n° 2004-575 du 21 juin
2004 (LCEN). Verified verbatim against Légifrance
(LEGIARTI000049568614), version in force since 23 May 2024. Status:
`primary`.

> Les personnes dont l'activité est d'éditer un service de communication
> au public en ligne mettent à la disposition du public, dans un standard
> ouvert : [...] 2° S'il s'agit de personnes morales, leur dénomination ou
> leur raison sociale et leur siège social, leur numéro de téléphone et,
> s'il s'agit d'entreprises assujetties aux formalités d'inscription au
> registre du commerce et des sociétés ou au registre national des
> entreprises en tant qu'entreprise du secteur des métiers et de
> l'artisanat, le numéro de leur inscription, leur capital social et
> l'adresse de leur siège social

**Why the article number matters.** Loi n° 2024-449 du 21 mai 2024
(SREN) restructured the LCEN to align it with règlement (UE) 2022/2065.
The identification obligation used to sit in article 6-III, and most
commercial sources online still cite it that way. It does not live there
any more. `packages/core/src/compliance/regimes.ts` carried the stale
`article 6-III et 6-VI-2` citation from the day it was written until
2026-08-24; it was never rendered, which is the only reason a client
never received it. Status of the old citation: superseded, never to be
used.

**Why this one may be stated where EAA scope may not.** Section 7's
"we report, we do not conclude" rule exists because EAA scope turns on
headcount, turnover and sector, and because the courts are split. None
of that applies here: the obligation attaches to editing a professional
online service at all, with no size threshold, no sector list and no
contested case law. Stating the criterion and stating what the scan
observed is therefore a factual report, not a conclusion about whether a
law binds this client. The recommendation to confirm with a lawyer stays,
for the same reason it stays everywhere else.

**Sanctions: not verified, never stated.** The pre-SREN penalty
(one year and EUR 75,000, quintupled for a legal person under art. 121-2
code pénal) was in article 6-VI-2. Where that provision now sits after
the SREN restructuring has NOT been checked against Légifrance, and the
figure was not found in article 1-1 itself. Status: `disputed`, pending
section 9. It must not appear in a report, in outreach, or anywhere else,
which is independently required by section 7 in any case: no sanction
amount is ever stated for a specific client. `regimes.ts`'s
`sanctionCeiling` for this regime is unverified text and has no render
path.

**What the scanner may say.** That the criterion exists, quoted or
paraphrased faithfully; that the scan did not find a SIREN, RCS or TVA
identifier published on the pages it visited; that a scan visits a
limited number of pages and can miss one; and that the client should
confirm with a lawyer. Never that the client is in breach, never a
deadline, never an amount.

**Overseas-domain boundary (manual).** This entry does not currently carry a
verified territorial analysis for New Caledonia or the other French overseas
collectivities and territories. A `.nc`, `.pf`, `.wf`, `.tf`, `.re`, `.yt`,
`.pm`, `.gp`, `.mq`, `.gf`, `.bl` or `.mf` site is therefore not silently
treated as a metropolitan LCEN case. The automated absence rule emits no
finding for those domains, and since 2026-09-23 neither do
`accessibility-statement-missing` and `consent-mechanism-absent`, whose
absence claims rest on the same unverified French and EU regimes (observed
cookies and tracker requests are still reported, as facts); the manual checklist says **« vérifier le régime
applicable »** and the operator records the jurisdiction decision before any
client-facing conclusion. This is a coverage boundary, not a claim that the
obligation does or does not apply there.

---

## 9. Remaining verification

- astreinte and récidive figures under route 1
- confirmation that EN 301 549 is the only applicable harmonised standard
- the transitional provisions and the 2030 date, section 3
- the Caen and Lille ordonnances themselves rather than press summaries
- outcome of Créteil, 22 September 2026
- post-SREN location of the LCEN identification penalty provision
  (old article 6-VI-2), section 8bis

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
   documents. See `docs/rules/operator-obligations.md` section 3.
8. **LCEN cited by its pre-SREN article number, and absent from this
   file entirely.** `regimes.ts` has held a fully written LCEN regime
   citing `article 6-III et 6-VI-2` since it was created. That citation
   was superseded by loi n° 2024-449 du 21 mai 2024, and this file, which
   governs every legal claim in the product, had no LCEN entry at all -
   so the regime was simultaneously unauthorised to state and wrong about
   where the law is. It was saved from reaching a client only by never
   having been wired to a render path. Both fixed 2026-08-24: section
   8bis above, and the citation corrected in code. The general lesson is
   trade-off 23's, again: a fact in code that no test and no doc covers
   drifts silently.

Common shape: a commercial source stated something convenient, others
repeated it, and agreement between sources that copy each other is not
corroboration.
