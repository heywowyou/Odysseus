# Operator obligations

Odysseus's own regulatory position, as distinct from the client's, which
is in `docs/rules/obligation-basis.md`. Written 2026-08-15.

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

**Operating rule** is in `docs/rules/obligation-basis.md` section 7 and binds
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

Odysseus is a **deployer**, not a provider: the model is OpenAI's.
Provider obligations, including machine-readable marking of synthetic
content under 50(2), sit with OpenAI. Deployer obligations under 50(4)
cover deepfakes and **text published to inform the public on matters of
public interest**. This is a narrow category: a document sent privately
to one paying client is not "publishing to inform the public," so it
does not apply by definition, not because of any mitigation we add.

**Assessment by output:**

- **Client audit reports.** Commissioned, private,
  single-recipient deliverables. Not public-interest text. Out of scope
  for 50(4), full stop. **No change to the LLM report pipeline.**
  Continue generating with OpenAI exactly as built.
- **Outreach emails.** Private commercial communication to one prospect.
  Out of scope for the same reason. No change.
- **The benchmark study, milestone 10.** The one document in this
  product that is actually published to the general public. This is the
  only place 50(4) is even plausibly engaged.

**Fix for the study, corrected 2026-08-16.** An earlier version of this
file recommended writing the study by hand to avoid the question
entirely. That is stronger than necessary and not worth the cost of
manually drafting 20-plus pages. **The actual requirement is disclosure,
not authorship.** Generate the study with OpenAI as with everything
else, and add one visible line near the top, not buried in a footer or
the CGU:

> Cette étude a été rédigée avec l'assistance d'un outil d'intelligence
> artificielle, à partir de données de scan automatisées.

That single sentence satisfies 50(4) if it applies, and costs nothing
against the existing pipeline. Hand-writing remains an option if a
fully manual document is wanted for other reasons, but it is not what
this regulation requires.

**Provider data posture.** Keep OpenAI's Data Processing Addendum in the
operator's vendor records. OpenAI states that Chat Completions API customer
content is not used for training by default. The standard abuse-monitoring
retention is 30 days unless the organization qualifies for stricter controls.
EU storage and processing require an eligible organization/project, the
applicable retention-control amendment, and requests to
`https://eu.api.openai.com/v1`; eligible post-5 March 2026 models carry a
10 percent regional-processing uplift. Setting `OPENAI_BASE_URL` alone does not
grant eligibility.

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
personal and are excluded. Full rules in `docs/rules/outreach-rules.md`.

**Telephone. Closed.** Since 11 August 2026 unsolicited telephone
prospecting is prohibited without prior explicit consent or an existing
contractual relationship. Phone is a follow-up channel for people who
have replied, not a prospecting channel. Status: secondary, verify
before any call. This matters more than it looks, because "just call
them" was the obvious fallback if email underperforms, and it no longer
exists.

**Manual free-mail contact, attested override (plan 045 slice 1.6).**
`docs/rules/prospect-qualification.md` section 6 excludes free-mail domains
(Gmail, Outlook and equivalents) from automated discovery because they
read as personal, not professional. When the operator manually enters
such an address for a hotel, the dashboard shows a warning and requires
an explicit attestation before it can be saved:

- Warning (FR): "Cette adresse appartient à un service de messagerie
  grand public (Gmail, Outlook, etc.). Ces adresses sont normalement
  exclues car assimilées à un usage personnel." (EN: "This address
  belongs to a consumer email service (Gmail, Outlook, etc.). These
  addresses are normally excluded as personal.")
- Attestation checkbox (FR): "Je confirme que cette adresse est utilisée
  par cet établissement dans le cadre de son activité professionnelle."
  (EN: "I confirm that this address is used by this business for its
  professional activity.")

The checkbox lets the operator assert a fact about one specific address,
never a legal conclusion about the B2B exception in general. Status:
secondary. Run a `research` pass against current CNIL guidance on B2B
email prospecting before the first real send to an attested free-mail
address; nothing here authorizes sending until that pass has happened.

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
`docs/rules/offer-positioning.md`. Clients are businesses and recover VAT, so
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

---

## 8. Before the first sale

Researched 2026-09-28, when the public terms of sale (`/cgv`,
`packages/site/app/cgv/page.tsx`) were written. Legal facts below are
`secondary` unless marked `primary`; none of this is lawyer-reviewed.

**Registry state, read from the public Sirene record on 2026-09-28.** The
business is registered as an entrepreneur individuel (SIREN 980 766 463,
SIRET 980 766 463 00023) with APE code 74.20Z (photography) and the trade
name "CULT OF AURORA". Sirene shows only the principal activity's code; the
operator confirmed the Cult of Aurora clothing activity is also declared.
Neither the audit activity nor the Odysseus name is declared. The terms therefore say the services are provided by Jules
Fontaine EI, not "under the trade name Odysseus".

| # | Item | Why | Status |
|---|---|---|---|
| 1 | On the guichet unique (INPI), add the web audit activity | Done: filed 2026-09-28 (category 02080902, "A titre indépendant", libérale/BNC) and confirmed by the operator 2026-09-30. No enseigne was added: the establishment carries one trade name and it stays "CULT OF AURORA" (the operator's clothing brand, run from the same micro-entreprise). Odysseus is therefore an unregistered brand name: client documents name the seller "Jules Fontaine EI" and say the Odysseus services are provided by him, never "enseigne Odysseus" or "trade name Odysseus". Because goods (clothing) and services mix in one micro-entreprise, the VAT franchise needs total revenue at or below EUR 85,000 with services at or below EUR 37,500 (section 6) | done |
| 2 | Legal notice page (mentions légales) | LCEN article 1-1 (`primary`): name, domicile, phone, registration number, publication director, host identity. LCEN article 19 adds address, email and phone for any electronic-commerce activity, B2B included. Written 2026-09-28 at `/mentions-legales` with the registered Sirene address (operator choice: no domiciliation) and Vercel as host. **Still missing: the operator's phone number** (operator deciding between a personal and a virtual number) | written; phone deferred by the operator on 2026-09-29 |
| 3 | Professional liability insurance (RC Pro) | Section 7. Online insurers price intellectual-service RC Pro from about EUR 150 to 400 a year. Describe the activity accurately to the insurer: automated technical diagnostic, report with a non-verdict compliance information section | open |
| 4 | Quote template | Must carry: "Jules Fontaine EI" (article R526-27 code de commerce, `primary`), SIRET, address, date, validity, client, site analysed, service, report language, price HT, VAT exemption mention, delivery time, payment terms, late-payment rate and the EUR 40 fee, no early-payment discount, a reference to the terms with the `/cgv` URL **and the terms attached as a PDF**, and a "Bon pour accord" signature line. Cass. com. 7 May 2025: a reference alone is not enough, the client must have had effective access before signing | see "Quote and invoice texts" below; set up in Shine by the operator |
| 5 | Decide the full-audit delivery lead time | Nothing in the repository fixes it. The terms defer it to the quote; the re-audit's 5 business days is the only published lead time | decided 2026-09-30: five business days from payment for both services, published on `/offre` and in the terms |
| 6 | Invoice template and e-invoicing platform | Section 4: reception through a Plateforme Agréée since 1 September 2026. Invoices carry the same identity and payment mentions as the quote | Shine Facture, the business account's invoicing module, is a Plateforme Agréée (since 21 May 2026): activate it in Shine |
| 7 | VAT mention wording | "TVA non applicable, art. 293 B du CGI" until 31 December 2026. From 1 January 2027 the franchise moves to the CIBS (ordonnance 2026-671, reported as article L. 233-3), with the old wording tolerated until 30 June 2028. The public terms cite no article so they do not go stale | update templates in January 2027 |
| 8 | Business bank account and Stripe account in the "Jules Fontaine EI" name | R526-27: a dedicated account must carry the EI denomination. The Stripe link amount is set by hand (trade-off 13): check it reads EUR 990 | check |
| 9 | Prospecting privacy page recipients | `/confidentialite-prospection` lists Scaleway, Vercel and MongoDB Atlas only. Prospect scans run on the Hostinger VPS and full outreach scans are written through OpenAI before a preview is published (trade-off 95), so both are recipients under GDPR article 14 | done 2026-09-30: both named, with what OpenAI receives; visitor data (Vercel request logs, the opt-out limiter's in-memory address) is disclosed on the legal notice |
| 10 | Off-premises contracts with very small businesses | Code de la consommation L221-3 (`primary` article, read via Légifrance search) extends the 14-day withdrawal right to a business of five employees or fewer contracting off-premises outside its main activity. Selling by email is a distance contract and is not concerned. If a quote is ever signed in person, hand over the statutory withdrawal information and form | rule, no action |
| 11 | Lawyer review of the terms | The terms were written from primary texts and practitioner sources, not by a lawyer. Worth one review once revenue exists, together with the scope-section review in section 2 | optional |

**Two choices baked into the terms, change them on the quote if needed:**
payment is due in full on ordering and the report is delivered after
payment, and a client may cancel for a full refund until the report is
delivered.

**No jurisdiction clause, deliberately.** Code de procédure civile article
48 voids a territorial jurisdiction clause unless every party contracted as
a commerçant. The operator is a non-commercial sole trader, so such a
clause would be réputée non écrite.

### Quote and invoice texts

Quotes and invoices are issued from Shine Facture (decided 2026-09-30).
These texts are what the operator pastes into it; the reasons are in the
table above.

- **Issuer name:** "Jules Fontaine EI". The trade name CULT OF AURORA may
  also print; that is lawful, but an Odysseus quote should not carry the
  clothing brand's logo.
- **VAT:** franchise en base, so the document reads "TVA non applicable, art.
  293 B du CGI" until 31 December 2026 (row 7 for 2027).
- **Line:** "Diagnostic technique Odysseus du site [domaine]", quantity 1,
  unit price 990 EUR HT. Re-audit line: "Nouvelle vérification Odysseus du
  site [domaine]", 450 EUR HT. The detailed description:

  > Analyse automatisée de l'ensemble des pages accessibles du site
  > [domaine] : contrôles automatisables liés aux WCAG 2.2 niveau AA et à la
  > norme EN 301 549, comparaison du HTML initial et du rendu JavaScript,
  > signaux techniques liés aux assistants IA, en-têtes de sécurité, mesures
  > de performance sur une sélection de pages. Rapport PDF en [français /
  > anglais] avec priorités et préconisations, remis sous cinq jours ouvrés
  > après réception du paiement. Ceci est un diagnostic technique, pas un
  > audit RGAA : il ne produit pas de taux de conformité officiel et ne peut
  > pas servir de base à une déclaration d'accessibilité.

- **Validity:** 30 days from the quote date.
- **Payment terms:** payable in full on acceptance, by bank transfer or card
  payment link; no early-payment discount.
- **Late-payment rate:** the ECB refinancing rate plus 10 points. For the
  second half of 2026 that is 12.40 % (ECB rate 2.40 % since June 2026);
  the rate resets each 1 January and 1 July.
- **Custom mention (conditions):**

  > Paiement à réception du devis signé. Aucun escompte pour paiement
  > anticipé. En cas de retard de paiement : pénalités au taux de la BCE
  > majoré de 10 points (12,40 % au second semestre 2026) et indemnité
  > forfaitaire pour frais de recouvrement de 40 € (art. L. 441-10 et
  > D. 441-5 du code de commerce). Prestation soumise aux conditions
  > générales de vente jointes à ce devis et consultables sur
  > https://www.odysseusaudit.com/cgv. Bon pour accord (date, nom,
  > signature) :

- **Attachment:** the terms as a PDF (browser print of `/cgv`), attached
  to the quote email every time. A link alone is not enough (Cass. com.
  7 May 2025).
- **Acceptance:** a signed quote or an email that expressly accepts it.

