# Prospect qualification funnel (retired 2026-09-15)

> Archived from `docs/rules/prospect-qualification.md` (issue #526). Plan 047
> replaced the hotel-candidate funnel below (domain-first qualification,
> sector targeting, scoring cohorts, the prescan and outreach-full-scan cost
> ladder) with the prospect hub: a prospect is added by the operator or the
> directory import, facets inform but do not block, and only suppression,
> valid URLs and crawl politeness and safety block actions. Nothing here is a
> current rule. It is kept as the reasoning behind choices that still echo in
> the code (the SIREN extraction, the headcount reading, the NAF allowlist).

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

## 3. Qualification predicate

Deterministic, no LLM, same architectural rule as `assessObligations()`.
Qualifies when all hold:

1. `etatAdministratif` active
2. `trancheEffectifs` corresponds to 10 salaried persons or more
3. NAF code in the targeted sector set
4. SIREN extracted from the site itself, not inferred
5. Domain not on the suppression list
6. Contact address available and not on a free-mail domain (section 6)

**On the headcount test.** Per `docs/rules/obligation-basis.md` section 3, the
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
an online checkout. Chosen over hotels because accommodation booking was,
at the time, a reading rather than a settled position, and the legal
context should be proven where it is firmest before being tested where
it is not.

**Wave 2, 2026-08-22.** `docs/rules/obligation-basis.md`'s "Hotels and
accommodation" entry was upgraded from `disputed` to `secondary`: a
booking flow concluding a consumer contract online is now read as
generally treated as electronic commerce, corroborated across
independent sources rather than resting on one, and that doc states
hotels are "on comparable legal footing to a standard online shop" for
outreach purposes - the first-wave exclusion was about volume and
framing clarity, not legal weakness (see that doc's "Hotels and
accommodation" entry for the full reasoning). `naf-sector-allowlist.json`
now enables 55.10Z (hôtels) and 55.20Z (hébergement touristique de
courte durée, covering chambres d'hôtes) at `definitional` confidence on
that basis.

Restaurants (56.10A) are listed in the same config but deliberately left
disabled: the accommodation-specific legal reading does not
automatically transfer to a table reservation, which is not generally
the same kind of "contract concluded online" a hotel booking or
e-commerce purchase is. Enable only after that reading gets the same
kind of review hotels received, not by analogy.

---

## 5. Stages and cost

| Stage | Cost per candidate | Runs on |
|---|---|---|
| AFNIC filter | negligible, local | full pool |
| Homepage plus mentions légales fetch, plain HTTP, no browser | one or two requests | filtered pool |
| SIREN extraction | negligible | fetched pages |
| Sirene join | negligible, local | extracted SIREN |
| Prospecting scan, Chromium | seconds to a minute | qualified only |
| LLM outreach draft | one call | worthy only, per `docs/rules/llm-layer-rules.md` §10 |

**Outreach full scan, added 2026-09-11, plan 037.** For the hotel campaign the
browser-cost ladder continues past the prescan: hotel prescan (three pages, no
Lighthouse) for scoring, immutable scoring and cohort selection as the cost
gate, then one **outreach full scan** per selected cohort member the operator
chooses to contact. It runs the paid audit's content-coverage policy over the
whole site, several minutes of Chromium per hotel, and stops before the model
analysis. It is prospecting: started by the operator from a selected prospect,
one at a time, never automatic, and its artifacts stay prospecting evidence
under the published 90-day retention. The rule this file enforces is
unchanged and is what the ladder protects: Chromium capacity is spent only
below the selection line.

The plain HTTP stage must not use Chromium. It fetches two URLs and
parses HTML for a SIREN pattern. Using the browser there would make the
cheap stage as expensive as the expensive one.

Politeness applies to the cheap stage: same per-origin baseline delay,
same user agent identifying `https://odysseusaudit.com/bot`. Two
requests is not an excuse to skip identification.

---
