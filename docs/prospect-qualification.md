# Prospect qualification

How a candidate domain becomes a qualified prospect. Governs milestone
9a. Written 2026-08-15.

Rule this file enforces: **Chromium never runs on an unqualified
domain.** Scanning is the expensive stage and qualification is nearly
free, so qualification comes first. The original prospecting stage
sketch had these in the opposite order.

---

## 1. Funnel direction: domain first

**Registry first** would start from Sirene, filter by sector and
headcount, then find each company's website. Rejected: Sirene has no
website field, so this needs a paid enrichment provider or a
search-engine guess per company.

**Domain first** starts from the domain list, fetches each site cheaply,
extracts the SIREN from the mentions légales, and joins to Sirene
locally. Chosen. LCEN requires the SIREN on the site, and the extractor
already exists in the entity layer from the M6.2 report refactor. The
join is local, so no API rate limit governs throughput.

A site publishing no resolvable SIREN is dropped. Not a gap: either it
is not a French commercial entity, or it is non-compliant in a way we
cannot substantiate, and either way it is not a prospect.

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

**Open question, resolve before writing any 9a code.** AFNIC's own
holder-data processing notice describes a richer dataset including
SIREN for organisations that reported it, enterprise category, NAF rev2
labels joined from the Sirene database, and domain usage data: HTTP
status, real-website versus parking-page classification, and
redirection.

If those fields are in the free open data, this milestone shrinks
enormously: no mentions légales fetch for most domains, no Sirene join
to build, and a parking-page filter removing a large share of dead
domains before any scan. If they sit only in the paid `.FR Performance`
or SQUAW products, price them, because buying may still beat building.
This single answer is the difference between a large milestone and a
small one.

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

## 3. Qualification predicate

Deterministic, no LLM, same architectural rule as `assessObligations()`.
Qualifies when all hold:

1. `etatAdministratif` active
2. `trancheEffectifs` corresponds to 10 salaried persons or more
3. NAF code in the targeted sector set
4. SIREN extracted from the site itself, not inferred
5. Domain not on the suppression list
6. Contact address available and not on a free-mail domain (section 6)

**On the headcount test.** Per `docs/obligation-basis.md` section 3, the
exemption needs fewer than 10 persons AND turnover or balance sheet
under EUR 2M, so 10 or more establishes scope on the size prong alone
and turnover is never needed. The inverse does not hold: a company under
10 employees above EUR 2M is also covered and this filter misses it.

Accepted deliberately. The filter produces no false positives, which is
what matters: contacting a business about an obligation it does not have
is the one error here with reputational cost. The missed segment can
arrive through inbound, where the prospect self-identifies.

Empty or missing `trancheEffectifs` fails the test rather than counting
as unknown-and-worth-scanning.

---

## 4. Sector targeting

NAF to EAA sector mapping is our own inference, not a published
correspondence table. It is a targeting heuristic and may never be shown
to a prospect as the basis of anything.

First wave targets unambiguous electronic commerce: consumer retail with
an online checkout. Chosen over hotels because accommodation booking is
a reading rather than a settled position
(`docs/obligation-basis.md` section 3), and the legal context should be
proven where it is firmest before being tested where it is not.

---

## 5. Stages and cost

| Stage | Cost per candidate | Runs on |
|---|---|---|
| AFNIC filter | negligible, local | full pool |
| Homepage plus mentions légales fetch, plain HTTP, no browser | one or two requests | filtered pool |
| SIREN extraction | negligible | fetched pages |
| Sirene join | negligible, local | extracted SIREN |
| Prospecting scan, Chromium | seconds to a minute | qualified only |
| LLM outreach draft | one call | worthy only, per `docs/llm-layer-rules.md` §10 |

The plain HTTP stage must not use Chromium. It fetches two URLs and
parses HTML for a SIREN pattern. Using the browser there would make the
cheap stage as expensive as the expensive one.

Politeness applies to the cheap stage: same per-origin baseline delay,
same user agent identifying `https://odysseusaudit.com/bot`. Two
requests is not an excuse to skip identification.

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

Aggregate benchmark figures derived from expired records may be
retained, since they are no longer about an identifiable business. The
individual findings behind them are not.
