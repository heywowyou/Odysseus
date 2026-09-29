// Draws random candidate hotels of one star rating from the Atout France
// directory in the dashboard. Read-only: it creates nothing.
//   node .claude/skills/prepare-prospects/scripts/candidates.mjs <stars> <count>
// Prints about three candidates per hotel wanted, as JSON lines, so that
// sites without the needed details can be skipped.
import { withDashboard } from './lib.mjs';

const stars = Number(process.argv[2]);
const count = Number(process.argv[3]);
if (![1, 2, 3, 4, 5].includes(stars) || !Number.isInteger(count) || count < 1) {
  console.error('usage: candidates.mjs <stars 1-5> <count>');
  process.exit(2);
}

// Chains, groups and collections the directory still marks independent.
const GROUP_NAME =
  /sofitel|mgallery|best western|\bibis\b|mercure|novotel|kyriad|campanile|hilton|marriott|radisson|barriere|oceania|citotel|inter-?hotel|pullman|hyatt|intercontinental|holiday inn|crowne|accor|\bb&b\b|logis|brit hotel|the originals|\bace hotel|premiere classe|fasthotel|adagio|pierre ?& ?vacances|club med|belambra|\bvvf\b|relais du silence|quality|comfort|clarion|ascott|citadines|okko|mama shelter|westin|sheraton|four seasons|mandarin|peninsula|shangri|\britz\b|airelles|evok|tiara|althoff|\bmgm\b|appart'?city|residhome|odalys|lagrange|nemea|zenitude|staycity|motel one|hotel f1|\bb ?signature|handwritten|collection\b.*by/i;
// Territories outside the EU (trade-off 112): Saint-Pierre-et-Miquelon,
// Saint-Barthélemy, Wallis-et-Futuna, French Polynesia, New Caledonia.
const OUT_OF_SCOPE_POSTCODE = /^(975|97133|98)/;
const plain = (value) => value.normalize('NFD').replace(/\p{M}/gu, '');
const shuffle = (items) =>
  items
    .map((item) => [Math.random(), item])
    .sort((a, b) => a[0] - b[0])
    .map(([, item]) => item);

await withDashboard(async (request) => {
  const taken = new Set();
  for (const archived of [false, true]) {
    for (let page = 1; ; page += 1) {
      const result = await request('GET', `/api/prospects?pageSize=200&page=${page}&archived=${archived}`);
      for (const prospect of result.rows)
        for (const website of prospect.websites ?? []) taken.add(website.registrableDomain);
      if (page * result.pageSize >= result.total) break;
    }
  }

  const base = `/api/directory?stars=${stars}&groupStatus=independent&websiteKind=own&pageSize=200`;
  const first = await request('GET', `${base}&page=1`);
  const pages = Math.max(1, Math.ceil(first.total / 200));
  const picked = shuffle([...Array(pages).keys()].map((index) => index + 1)).slice(0, 3);
  const rows = [];
  for (const page of picked) rows.push(...(page === 1 ? first : await request('GET', `${base}&page=${page}`)).rows);

  const eligible = shuffle(
    rows.filter(
      (entry) =>
        entry.websiteUrl &&
        !entry.prospectId &&
        !taken.has(entry.registrableDomain) &&
        !GROUP_NAME.test(plain(entry.name)) &&
        !OUT_OF_SCOPE_POSTCODE.test(entry.postcode ?? '') &&
        (entry.rooms ?? 0) >= 10,
    ),
  );
  console.error(`${stars} stars: ${first.total} in the directory, ${eligible.length} eligible in the sampled pages`);
  for (const entry of eligible.slice(0, count * 3)) {
    console.log(
      JSON.stringify({
        directoryId: entry.directoryId,
        stars: entry.stars,
        name: entry.name,
        commune: entry.commune,
        postcode: entry.postcode,
        rooms: entry.rooms,
        websiteUrl: entry.websiteUrl,
      }),
    );
  }
});
