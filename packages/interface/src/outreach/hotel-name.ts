/**
 * How a hotel's catalogue name is written inside an outreach email.
 *
 * The catalogue stores names in capitals ("HÔTEL DE LA CITÉ CARCASSONNE",
 * "HÔTEL LES TEMPLIERS"), which printed as-is reads as a database row, not a
 * letter. `formatHotelName` recases it the way French writes a proper name:
 * words capitalised, prepositions and the articles they govern lowercase
 * ("Hôtel de la Poste"), an article that opens a name kept capital ("Hôtel Les
 * Templiers"), hyphenated place names cased per part ("Montceau-les-Mines").
 *
 * `frenchOfHotel` then supplies the article French requires after "de": "le site
 * de l'Hôtel des Tilleuls", "du Domaine", "de la Villa", never "de Hôtel". A
 * wrong article is the most visible sign an email was generated, which is
 * exactly why this is code rather than a best guess at send time.
 *
 * Brand names (B&B, Mgallery) will not always come out as their owners write
 * them; every draft is read before it is sent, and a bad one is edited there.
 */

/** Lowercase inside a name, never as its first word. */
const PREPOSITIONS = new Set([
  'de',
  'du',
  'des',
  'et',
  'en',
  'sur',
  'sous',
  'à',
  'au',
  'aux',
  'près',
  'lès',
  'lez',
]);
/** Articles: lowercase after a preposition ("de la"), capital otherwise
 *  ("Hôtel La Bâtisse", where the article opens a name). */
const ARTICLES = new Set(['le', 'la', 'les']);

function capitalise(word: string): string {
  return word.charAt(0).toLocaleUpperCase('fr') + word.slice(1);
}

function casePart(part: string, lowerIt: boolean): string {
  const lower = part.toLocaleLowerCase('fr');
  // Elided article or preposition: d'Elsa, l'Hippodrome, L'Hippodrome.
  const elided = /^([dl])(['’])(.+)$/u.exec(lower);
  if (elided !== null) {
    const [, letter = '', mark = '', rest = ''] = elided;
    return `${lowerIt ? letter : letter.toLocaleUpperCase('fr')}${mark}${capitalise(rest)}`;
  }
  return lowerIt ? lower : capitalise(lower);
}

export function formatHotelName(raw: string): string {
  const words = raw
    .trim()
    .split(/\s+/u)
    .filter((word) => word !== '');
  let previous = '';
  return words
    .map((word, index) => {
      // Hyphenated names case each part, with inner small words lowercase:
      // Saint-Jean, Montceau-les-Mines.
      const parts = word.split('-');
      const cased = parts.map((part, partIndex) => {
        const lower = part.toLocaleLowerCase('fr');
        const first = index === 0 && partIndex === 0;
        const inner = partIndex > 0;
        let lowerIt = false;
        if (!first && PREPOSITIONS.has(lower)) lowerIt = true;
        if (!first && ARTICLES.has(lower) && (inner || PREPOSITIONS.has(previous))) lowerIt = true;
        if (!first && /^d['’]/u.test(lower)) lowerIt = true;
        if (!first && /^l['’]/u.test(lower) && PREPOSITIONS.has(previous)) lowerIt = true;
        return casePart(part, lowerIt);
      });
      previous = word.toLocaleLowerCase('fr');
      return cased.join('-');
    })
    .join(' ');
}

/** First words that take "de l'", "du", "de la" or "des" before the name. */
const ELIDED_NOUNS = new Set([
  'hôtel',
  'hotel',
  'auberge',
  'hostellerie',
  'hôtellerie',
  'ermitage',
  'orangerie',
  'oustau',
  'abbaye',
]);
const MASCULINE_NOUNS = new Set([
  'domaine',
  'château',
  'chateau',
  'manoir',
  'mas',
  'relais',
  'clos',
  'moulin',
  'prieuré',
  'logis',
  'chalet',
  'grand',
  'couvent',
]);
const FEMININE_NOUNS = new Set([
  'villa',
  'maison',
  'résidence',
  'residence',
  'bastide',
  'ferme',
  'demeure',
  'chaumière',
  'closerie',
  'grange',
  'chartreuse',
]);

/** "de" plus a formatted hotel name, with the article French requires. */
export function frenchOfHotel(name: string): string {
  const lower = name.toLocaleLowerCase('fr');
  if (lower.startsWith('le ')) return `du ${name.slice(3)}`;
  if (lower.startsWith('les ')) return `des ${name.slice(4)}`;
  if (lower.startsWith('la ')) return `de la ${name.slice(3)}`;
  if (/^l['’]/u.test(lower)) return `de l'${name.slice(2)}`;
  const first = lower.split(/[\s'’-]/u)[0] ?? '';
  if (ELIDED_NOUNS.has(first)) return `de l'${name}`;
  if (MASCULINE_NOUNS.has(first)) return `du ${name}`;
  if (FEMININE_NOUNS.has(first)) return `de la ${name}`;
  if (first === 'chambres') return `des ${name}`;
  return `de ${name}`;
}
