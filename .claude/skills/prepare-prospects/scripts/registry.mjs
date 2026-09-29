// Looks companies up in the public French company register
// (recherche-entreprises.api.gouv.fr, no key). Read-only.
//   node .claude/skills/prepare-prospects/scripts/registry.mjs <siren> [<siren> ...]
//   node .claude/skills/prepare-prospects/scripts/registry.mjs --name "<words>" <postcode>
// Prints one line per result: SIREN | registered name | head-office town |
// NAF | state (A active, C ceased) | establishments with their trade names.
import { sleep } from './lib.mjs';

const args = process.argv.slice(2);
const queries =
  args[0] === '--name'
    ? [`q=${encodeURIComponent(args[1] ?? '')}${args[2] ? `&code_postal=${args[2]}` : ''}&per_page=5`]
    : args.map((siren) => `q=${siren.replace(/\D/g, '')}&per_page=1`);
if (queries.length === 0 || (args[0] === '--name' && !args[1])) {
  console.error('usage: registry.mjs <siren> [...] | --name "<words>" [postcode]');
  process.exit(2);
}

for (const query of queries) {
  const response = await fetch(`https://recherche-entreprises.api.gouv.fr/search?${query}`);
  if (!response.ok) {
    console.log(`${query}: HTTP ${response.status}`);
    continue;
  }
  const { results = [] } = await response.json();
  if (results.length === 0) console.log(`${query}: not found`);
  for (const company of results) {
    const establishments = (company.matching_etablissements ?? [])
      .map(
        (establishment) =>
          `${(establishment.liste_enseignes ?? []).join('/')}@${establishment.libelle_commune}` +
          (establishment.etat_administratif === 'F' ? ' (closed)' : ''),
      )
      .join(', ');
    console.log(
      [
        company.siren,
        company.nom_raison_sociale ?? company.nom_complet,
        company.siege?.libelle_commune,
        company.activite_principale,
        company.etat_administratif,
        establishments,
      ].join(' | '),
    );
  }
  await sleep(300);
}
