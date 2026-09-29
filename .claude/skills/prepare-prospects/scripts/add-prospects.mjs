// Adds the chosen directory entries as prospects in production, then fills
// each one with the cleaned details. This is the only step that writes.
//   node .claude/skills/prepare-prospects/scripts/add-prospects.mjs <prospects.json>
// The file is an array of:
//   { "directoryId", "name", "legalName", "tradingName", "siren",
//     "phone" (or null), "email" }
// It never scans, drafts or sends anything.
import { readFileSync } from 'node:fs';
import { isValidSiren } from '../../../../packages/core/dist/compliance/siren.js';
import { withDashboard } from './lib.mjs';

const file = process.argv[2];
if (!file) {
  console.error('usage: add-prospects.mjs <prospects.json>');
  process.exit(2);
}
const wanted = JSON.parse(readFileSync(file, 'utf8'));
for (const entry of wanted) {
  for (const key of ['directoryId', 'name', 'legalName', 'tradingName', 'siren', 'email'])
    if (typeof entry[key] !== 'string' || entry[key].trim() === '')
      throw new Error(`${entry.directoryId ?? '?'}: ${key} is missing`);
  if (!isValidSiren(entry.siren)) throw new Error(`${entry.directoryId}: SIREN ${entry.siren} fails the checksum`);
}

await withDashboard(async (request) => {
  const { prospects } = await request('POST', '/api/directory/add', {
    directoryIds: wanted.map((entry) => entry.directoryId),
  });
  for (const entry of wanted) {
    const prospect = prospects.find(
      (candidate) => `${candidate.directoryRef?.source}:${candidate.directoryRef?.sourceId}` === entry.directoryId,
    );
    if (prospect === undefined) {
      console.log(`SKIPPED ${entry.name}: the directory entry is already linked to a prospect`);
      continue;
    }
    const patch = {
      sector: 'Hôtel',
      name: entry.name,
      legalName: entry.legalName,
      tradingName: entry.tradingName,
      siren: entry.siren,
      emails: [{ address: entry.email, origin: 'operator' }],
      ...(entry.phone ? { phone: entry.phone } : {}),
    };
    try {
      const saved = await request('PATCH', `/api/prospects/${prospect.prospectId}`, patch);
      console.log(
        [
          `${saved.hotel?.stars ?? '?'}★`,
          saved.name,
          saved.legalName,
          saved.tradingName,
          saved.siren,
          saved.phone ?? '',
          saved.emails?.map((email) => email.address).join(' '),
          saved.prospectId,
        ].join(' | '),
      );
    } catch (error) {
      console.log(`CREATED BUT NOT FILLED ${entry.name} (${prospect.prospectId}): ${error.message}`);
    }
  }
});
