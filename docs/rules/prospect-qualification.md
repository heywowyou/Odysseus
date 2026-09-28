# Prospect qualification

> **Plan 047 amendment (2026-09-15).** This document's candidate,
> qualification, selection, and 90-day-retention language describes the
> superseded hotel funnel. The durable product record is now a `prospect` and
> the Atout France source is a directory. Facets inform the operator but do
> not block adding or scanning a prospect; only suppression, valid URLs, and
> crawl politeness/safety checks block actions. A prospect remains until the
> operator deletes it, with an inactivity flag after the operational review
> period. Attached scan, draft, and preview artifacts keep their own retention
> rules until the Plan 047 cascade deletes them with the prospect. Origin
> recording and role-address-only discovery remain mandatory.

> **Territory amendment (2026-09-23, trade-off 112).** Odysseus audits
> businesses in France and the EU only. Hotels in French territories outside
> the EU (Saint-Pierre-et-Miquelon, Saint-Barthélemy, Wallis-et-Futuna, French
> Polynesia, New Caledonia, TAAF) are left out of the directory import and
> refused at scan launch. The overseas departments and Saint-Martin stay in
> scope.

Where prospect data comes from, which contact addresses may be used, and how
prospect data is stored and retained. Written 2026-08-15 for milestone 9a;
the qualification funnel it first described is archived (section 1).

---

## 1. The retired funnel

Sections 1 and 3 to 5 of this document (domain-first funnel direction,
qualification predicate, sector targeting, stages and cost) described the
hotel-candidate funnel plan 047 retired on 2026-09-15. They moved to
`docs/archive/prospect-qualification-funnel.md` (issue #526) and are not
current rules. Section numbers 2, 6 and 7 are kept, since other documents
cite them.

---

## 2. Sources, verified 2026-08-15

**Domain list. AFNIC open data, `opendata.afnic.fr`, Licence Ouverte.**

Note that the data.gouv.fr mirror of this dataset is a 128 KB aggregate
indicators file, not the domain list. The domain-level file is on
AFNIC's own portal.

The relevant file is **Fichier A, "Noms de domaine en point fr"**,
distributed as a ZIP containing one CSV. Roughly 4.2 million active
domains, around 0.45 GB uncompressed. Semicolon separated,
**ISO-8859-1 encoded**, which matters given the accent bug already seen
in Sirene headcount band strings: decode explicitly rather than assuming
UTF-8. Header row present. Historic columns include domain name,
registrar country and department and city and name, subdomain,
**titulaire type**, titulaire country, titulaire department, IDN flag,
creation date, and WHOIS withdrawal date. A populated withdrawal date
means the domain no longer exists, so filter on it.

Personne physique holder data is restricted; address-level fields are
published only for ORG holders. Convenient, since the personne morale
subset is exactly the target.

**Open question, resolved 2026-08-16.** AFNIC's own holder-data
processing notice describes a richer dataset including SIREN,
enterprise category, NAF rev2 labels joined from the Sirene database,
and domain usage data (HTTP status, real-website versus parking-page
classification, redirection). Verified against AFNIC's own published
material that this is not purchasable by Odysseus at any price:

- That richer dataset is AFNIC's **Data Space / `.FR Performance`**
  tool, and it is restricted to accredited `.fr` registrars, scoped to
  each registrar's own portfolio. Odysseus is not a registrar, and even
  an accredited one only sees domains it sold, never the national pool.
- **SQUAW** (daily bulk WHOIS access) is a dead end on two independent
  grounds. Eligibility requires a legal entity that has existed at
  least three years with three years of filed accounts on record.
  Separately, its licence's "utilisations interdites" clause explicitly
  forbids using the list to identify future commercial targets or build
  outreach lists, which is this exact use case. It also does not carry
  the SIREN/NAF/parking-page enrichment anyway, only WHOIS holder data.
  (Confirmed against AFNIC's own SQUAW tariff sheet, 10 000 EUR/year
  flat fee, dated 2015 but the eligibility and prohibited-use terms are
  structural, not a price that might have moved.)

So the free Fichier A open data is what 9a builds against, and it
carries none of the enrichment: domain name, registrar geo/name,
subdomain, holder type, holder geo, IDN flag, creation date, WHOIS
withdrawal date only, no SIREN, no NAF, no enterprise category, no
parking-page classification. There is no paid shortcut to weigh against
building; the fallback plan in section 5 (mentions légales fetch, SIREN
extraction, local Sirene join, a hand-built parking-page filter) is not
optional, it is the whole milestone.

**Company data.** Sirene stock file from data.gouv.fr, held locally
rather than queried through the API. Fields used: `siren`,
`activitePrincipale`, `trancheEffectifs`, `denomination`,
`etatAdministratif`. The existing Sirene API integration stays for
single lookups during a paid audit. Two paths, one shape of record, and
the entity layer should not need to know which produced it.

**Not used.** Paid enrichment providers, scraped director names, scraped
personal addresses. Excluded on retention grounds: none are needed once
the SIREN join works, and each adds personal data requiring
justification.

---

## 6. Contact addresses

**Role addresses only:** `contact@`, `info@`, `commercial@` and
equivalents on the company's own domain. Named individual addresses
(`prenom.nom@`) are not collected, stored or used, even when publicly
displayed.

**Free-mail domains excluded.** Gmail, Outlook, Hotmail, Yahoo, Orange,
Free and equivalents are treated as personal addresses. B2B opt-out
prospecting covers professional addresses; a personal mailbox used for
business does not qualify and would need consent. Exclude at
qualification, not at draft time.

**The allowlist, in preference order.** Amended 2026-08-28 on operator
approval, for the milestone 9c hotel campaign:

`direction`, `commercial`, `contact`, `info`, `sales`, `hello`, `bonjour`,
`reception`, `accueil`, `reservations`, `reservation`.

The order is not cosmetic. A hotel routinely publishes several of these on one
page, and which one is chosen decides who reads the message: `direction@` is a
decision maker, while `reservation@` is frequently an automated booking-engine
inbox and `accueil@` reaches a front desk. The last four were added for the
hotel campaign and deliberately rank below every address that reaches somebody
who can act on an audit. `packages/core/src/prospecting/role-address.ts` holds
the list; `discoverRoleContact` beside it returns the best-ranked address
published, never the first encountered, and can return nothing else - a named
local part has no path through it. Widening this list again is a new contact
version, never an edit in place.

**A subdomain of the company's own registrable domain counts as its own
domain.** `contact@mail.exemple.fr` is the company's mailbox for a company at
`exemple.fr`. Registrable domains come from the public suffix list, never from
counting labels.

**Mail-domain checks, and their limit.** The existence of an MX record may be
read through a DNS resolver. It is a fact about the *domain* and never proof
that a mailbox exists. SMTP probing, catch-all classification and third-party
verification vendors remain prohibited. A resolver failure is recorded as
unknown and never as "no mail service": a timeout is not evidence about a
business.

**No contact before selection.** Written for the retired scoring cohort:
addresses were discovered only for hotels a cohort had selected. Plan 047
removed the cohort. Contacts now come with their recorded origin from the
directory import, from the operator, or from a role address the prospect's
own scan read on its site, which the operator chooses to add.

**These three rules govern automated discovery only.** Plan 045 slice 1.6
adds a separate, manual override: the operator may type in an address for
a hotel already linked to an audit, including a named person or a
free-mail domain, when nothing usable was discovered. It does not widen
the allowlist, the discovery domains, or the no-contact-before-selection
rule above; a manually entered address still requires its own honest
origin disclosure (`docs/rules/outreach-rules.md` section 7) and, for a
free-mail domain, the operator's attestation
(`docs/rules/operator-obligations.md` section 5).

---

## 7. Storage and retention

**Prospect record:** domain, SIREN, denomination, NAF,
trancheEffectifs, qualification result and timestamp, scan job
reference, brokenness score, outreach state, contact address, **data
origin** (which source produced the address and the company data).

Origin is stored because RGPD article 14 requires disclosing where the
data came from at first contact, and the disclosure has to be accurate
per prospect rather than a boilerplate guess.

**Suppression list.** Separate collection, permanent, never subject to
the 90 day deletion. Domain and address hashes only, with date and
reason. An opt-out must survive deletion of everything else about that
prospect, or the deletion policy silently resurrects them.

**Retention.** The published policy at `odysseusaudit.com/bot` is 90
days, applying to prospect records and all prospecting scan artefacts
including screenshots. Enforced at database level, not by a manual pass.
Until that enforcement exists, prospecting does not run at volume.
Scanning thousands of third parties while breaching our own published
policy would make the bot page a liability rather than a credibility
signal.

Enforced since issue #538 (trade-off 125) by the daily sweep
(`packages/interface/src/retention/prospect-expiry.ts`), switched on per
deployment with `ODYSSEUS_PROSPECT_EXPIRY=on` after a production dry run
(`deploy/runbook.md` section 7D). The clock is the prospect's last activity:
the latest of its record's activity date, its newest event (scan, outreach
touch, reply, operator edit) and its newest audit. An expired prospect is
deleted whole, audits and screenshots included; its suppression entries stay.
A prospect that became a client or is in a live commercial exchange (`won`,
`call`, `quoted`, or any delivered audit) is not prospecting data and is
exempt.

**Outreach threads and drafts.** An outreach thread expires 90 days after its
last activity (a state change or a confirmed send), not after it was opened,
so a sequence still running is never cut off (issue #553). A draft row keeps
its 90 days from creation, but its copy in the mailbox does not expire with
it: the daily retention sweep withdraws a draft from the mailbox a week
before its row would expire and keeps the row as a pending deletion until the
mailbox confirms, so an unsent first email never leaves an untracked draft
behind.

**Plan 071 reference-link attribution.** The optional private mapping from a
Touch-1 reference-link token hash to its prospect, thread and draft follows
the same 90-day boundary from draft creation. It stores no raw public token;
the public receipt contains only the hash, request time and reference release
version. Suppression disables future attribution immediately, and permanent
prospect deletion removes the mapping before its TTL. The redirect remains
usable after attribution expires and always lands on the canonical reference
PDF.

Aggregate benchmark figures derived from expired records may be
retained, since they are no longer about an identifiable business. The
individual findings behind them are not.
