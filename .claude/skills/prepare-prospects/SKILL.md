---
name: prepare-prospects
description: "Explicit preparation of new hotel prospects: draw independent hotels of the requested star ratings from the Atout France directory, read each hotel's own website for its SIREN, legal name, trading name, phone and best contact email, check the SIREN in the public company register, then add the prospects in production with those details filled in. Never scans."
argument-hint: "<count> <stars> [<count> <stars> ...]   e.g. 4 5, or 3 5 4 4 3 3"
disable-model-invocation: true
---

# Prepare prospects

Invoking this skill is the operator's request to add prospects to the
production dashboard. That write is the whole point, so do it without asking.
Nothing else is written: **never launch a scan**, never draft or send outreach,
never edit an existing prospect.

## Arguments

`$ARGUMENTS` is read as pairs of `<count> <stars>`:

- `4 5` is four 5-star hotels.
- `3 5 4 4 3 3` is three 5-star, four 4-star and three 3-star hotels.
- A lone number with no star rating is a count to split evenly across 3, 4
  and 5 stars.

## Scripts

Run them from the repository root. They read the dashboard password from the
repository `.env` (read-only) and never print it. Keep working files
(candidate lists, the final JSON) in the session scratchpad, never in the
repository.

| Script | Does | Writes |
| --- | --- | --- |
| `scripts/candidates.mjs <stars> <count>` | Random unlinked independent directory entries, with known groups, out-of-scope territories, hotels under 10 rooms and domains already held by a prospect (archived included) removed. Prints about three per hotel wanted. | nothing |
| `scripts/probe-site.mjs <url>` | Home page plus up to five linked legal, contact and privacy pages: checksum-valid SIRENs, emails ranked (own domain first, then the role-address order from `packages/core/src/prospecting/role-address.ts`), phones, legal-notice excerpts. Bot user agent, robots.txt, 2 s pacing. | nothing |
| `scripts/registry.mjs <siren>...` or `--name "<words>" <postcode>` | Public company register lookup (recherche-entreprises.api.gouv.fr). | nothing |
| `scripts/add-prospects.mjs <file.json>` | Adds the directory entries as prospects, then fills each one. | production |

The scripts import the core package's built output, so if `packages/core/dist`
is missing run `pnpm --filter @odysseus/core build` first.

## Workflow

1. **Draw candidates.** Run `candidates.mjs` for each star rating. Also drop,
   by judgement, any name that is plainly a chain, a group's collection or a
   hotel run from a group's site (the website URL is a group domain, for
   example). Report each skip with its reason.
2. **Read the sites.** Run `probe-site.mjs` on the candidates, several at once
   since they are different sites. Where the probe misses something the page
   plainly has (a legal notice rendered by JavaScript, a contact page with an
   unusual link), read that page directly with the same user agent.
3. **Check every SIREN.** Run `registry.mjs` on the SIRENs found. Legal
   notices also list the web agency's and the host's SIRENs, so keep the one
   the register shows as a hotel or restaurant (NAF 55.xx or 56.xx) in the
   hotel's town, active. When the site shows no SIREN, look the company up by
   the legal name the site gives, or by the hotel's name and postcode, and
   accept a match only when the name and town agree.
4. **Keep a candidate only when all of these hold:**
   - the site is reachable and is the hotel's own site;
   - one SIREN is confirmed, active, in the hotel's town;
   - an email is published on the hotel's own domain;
   - the hotel is in France or the EU (the overseas departments and
     Saint-Martin are in scope; see trade-off 112).
   Move to the next candidate until each star rating has its count. If the
   drawn candidates run out, draw again.
5. **Write the prospects file** in the scratchpad, following the conventions
   below, and run `add-prospects.mjs` on it.
6. **Report** a table: stars, name, legal name, trading name, SIREN, phone,
   email. Then list what needs the operator's eye (below) and the candidates
   skipped with the reason. Remind the operator that no scan was launched.

## Field conventions

These match the prospects the operator edited by hand.

- **Name.** `Hôtel <brand>` in title case with French accents: `Hôtel Le
  Placide`, `Hôtel Belles Rives`. When the brand already says what it is,
  keep it as is: `Clarance Hôtel`, `L'Hôtel Particulier`, `Château de
  Codignat`, `Mas de la Fouque`, `Atlantic Hôtel & Spa`. Drop the town the
  directory appends (`CLARANCE HÔTEL LILLE` becomes `Clarance Hôtel`).
- **Trading name.** The brand as the site writes it, without `Hôtel` unless
  the site always uses it: `Le Placide`, `Belles Rives`, `Le Clos des Arts`,
  but `Hôtel Le Cheval Blanc`, `Atrium Hôtel`.
- **Legal name.** The company name exactly as the register has it, in
  capitals: `B.R ESTENE`, `SOCIETE HOTELIERE AVE`, `SARL HP ARLES`.
- **SIREN.** Nine digits, no spaces.
- **Phone.** The hotel's reception number from its own site, French format
  in pairs: `04 93 61 02 79`. Not a fax, not the web agency's number. Leave it
  out when the site has none.
- **Email.** One address, on the hotel's own domain. Prefer the role address
  highest in this order: `direction`, `commercial`, `contact`, `info`,
  `sales`, `hello`, `bonjour`, `reception`, `accueil`, `reservations`,
  `reservation` (`docs/rules/prospect-qualification.md` section 6). A generic
  address outside the list that names no person (`clarance@`, `hotel@`) is
  acceptable when no listed one exists. Never pick an address that names a
  person, and never one on another domain (a group, a web agency, a DPO
  provider).
- **Sector.** `Hôtel` (the script sets it).

## Needs the operator's eye

Say so in the report whenever:

- the SIREN came from the register and is not printed on the site;
- the register's legal name differs from the one on the site (a renamed or
  acronym company: the site says `SHAVE`, the register `SOCIETE HOTELIERE
  AVE`);
- the email is not in the role-address list;
- the register shows the company under a restaurant or events activity rather
  than a hotel one.
