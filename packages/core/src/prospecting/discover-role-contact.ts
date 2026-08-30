/**
 * The pure contact decision for milestone 9c plan 007: given the text of the
 * few pages a hotel publishes, which single professional address may this
 * campaign write to, and if none, why not.
 *
 * Two properties matter more than the parsing.
 *
 * **A named address is never captured, rather than captured and filtered.**
 * The allowlist in role-address.ts is the only way a local part can leave this
 * function, so `prenom.nom@` has no code path to a return value at all. That is
 * the strongest available form of docs/rules/prospect-qualification.md section 6's
 * "not collected, stored or used", and it is why this returns a `localPart`
 * from the allowlist rather than an arbitrary string.
 *
 * **Absence is typed, not null.** A hotel with no usable address must park
 * carrying a reason an operator can read, because the four reasons mean
 * completely different things: a site publishing only `jean@` has a contact the
 * campaign may not use, a site publishing only `hotel@gmail.com` has no
 * professional mailbox, a site publishing only its agency's address has an
 * intermediary, and a site publishing nothing may simply render its footer in
 * JavaScript. Collapsing those four into `null` throws away the only
 * information that tells them apart.
 *
 * Best-published rather than first-encountered: a hotel routinely lists several
 * role addresses on one page, and role-address.ts's order decides who actually
 * reads the email.
 */

import { parse } from 'tldts';
import { isFreeMailDomain } from './free-mail-domains.js';
import { roleAddressRank } from './role-address.js';

/** Which page a text came from. Carried through to the stored contact so a
 *  person can check the claim against the page that made it. */
export type ContactSourceKind = 'homepage' | 'mentions-legales' | 'contact-page';

export interface ContactTextSource {
  kind: ContactSourceKind;
  /** The URL actually fetched, kept as provenance. */
  url: string;
  /** Visible text of the page. */
  text: string;
  /** `mailto:` targets found in the markup. Scanned as well as the text,
   *  because a site whose footer renders the address as an icon link publishes
   *  it only here. */
  mailtoTargets?: readonly string[];
}

export type RoleContactRejectionReason =
  /** Addresses were published, but only on a domain the hotel does not own -
   *  typically a web agency or a tourist office. */
  | 'off-domain-only'
  /** Only a consumer mailbox. Section 6 excludes these at qualification, not at
   *  draft time. */
  | 'free-mail-only'
  /** The hotel publishes addresses on its own domain, but every one of them is
   *  a person rather than a role. */
  | 'named-local-parts-only';

export type RoleContactDiscovery =
  | {
      outcome: 'found';
      address: string;
      localPart: string;
      domain: string;
      /** Position in role-address.ts's preference order, lower is better.
       *  Stored so a later pass can see the campaign is writing to reception@
       *  without re-deriving why. */
      preferenceRank: number;
      source: ContactSourceKind;
      sourceUrl: string;
    }
  | { outcome: 'absent'; reason: 'no-address-published' }
  | { outcome: 'rejected'; reason: RoleContactRejectionReason };

/** Bracketed obfuscation only. A bare " at " is deliberately not decoded: real
 *  French hotel prose says "contact at" often enough that decoding it would
 *  invent addresses, and inventing one here would put a stranger's mailbox into
 *  an outreach campaign. */
const AT_OBFUSCATION_PATTERN = /\s*[[({]\s*(?:at|@|a|arobase)\s*[\])}]\s*/giu;
const DOT_OBFUSCATION_PATTERN = /\s*[[({]\s*(?:dot|point)\s*[\])}]\s*/giu;
const AT_ENTITY_PATTERN = /&#(?:64|x40);/giu;

const EMAIL_PATTERN = /\b([a-z0-9._%+-]+)@([a-z0-9.-]+\.[a-z]{2,})\b/giu;

function deobfuscate(text: string): string {
  return text
    .replace(AT_ENTITY_PATTERN, '@')
    .replace(AT_OBFUSCATION_PATTERN, '@')
    .replace(DOT_OBFUSCATION_PATTERN, '.');
}

/** eTLD+1 from tldts with the private section enabled, per the rule that no
 *  registrable domain in this codebase is ever derived by counting labels. */
function registrableDomainOf(host: string): string | null {
  const parsed = parse(`https://${host}`, { allowPrivateDomains: true });
  return parsed.domain === null ? null : parsed.domain.toLowerCase().replace(/\.$/u, '');
}

/** A `mailto:` target reduced to the address itself, dropping any query string
 *  such as `?subject=`. */
function addressFromMailto(target: string): string | null {
  const withoutScheme = target.replace(/^mailto:/iu, '').split('?')[0] ?? '';
  const decoded = (() => {
    try {
      return decodeURIComponent(withoutScheme);
    } catch {
      return withoutScheme;
    }
  })();
  const trimmed = decoded.trim();
  return trimmed === '' ? null : trimmed;
}

interface SeenAddress {
  localPart: string;
  domain: string;
  source: ContactSourceKind;
  sourceUrl: string;
}

function collectAddresses(source: ContactTextSource): SeenAddress[] {
  const haystacks = [deobfuscate(source.text)];
  for (const target of source.mailtoTargets ?? []) {
    const address = addressFromMailto(target);
    if (address !== null) haystacks.push(address);
  }

  const seen: SeenAddress[] = [];
  for (const haystack of haystacks) {
    for (const match of haystack.matchAll(EMAIL_PATTERN)) {
      const localPart = match[1]?.toLowerCase();
      const domain = match[2]?.toLowerCase().replace(/\.$/u, '');
      if (localPart === undefined || domain === undefined) continue;
      seen.push({ localPart, domain, source: source.kind, sourceUrl: source.url });
    }
  }
  return seen;
}

/**
 * @param sources Pages to read, in the order they should break a tie.
 * @param ownDomain The hotel's own registrable domain. An address is on the
 *   hotel's own domain when its host resolves to this same registrable domain,
 *   so `www.` and a mail subdomain both qualify, and nothing else does.
 */
export function discoverRoleContact(
  sources: readonly ContactTextSource[],
  ownDomain: string,
): RoleContactDiscovery {
  const ownRegistrable = registrableDomainOf(ownDomain.trim().toLowerCase());

  let best: (SeenAddress & { rank: number }) | null = null;
  let sawOwnDomainNamed = false;
  let sawFreeMail = false;
  let sawOffDomain = false;

  for (const source of sources) {
    for (const address of collectAddresses(source)) {
      if (isFreeMailDomain(address.domain)) {
        sawFreeMail = true;
        continue;
      }

      const registrable = registrableDomainOf(address.domain);
      if (ownRegistrable === null || registrable === null || registrable !== ownRegistrable) {
        sawOffDomain = true;
        continue;
      }

      const rank = roleAddressRank(address.localPart);
      if (rank === null) {
        sawOwnDomainNamed = true;
        continue;
      }

      // Strictly better only, so the first source to publish an address of a
      // given rank keeps it. Source order is therefore the tie-break, which is
      // why the caller controls it.
      if (best === null || rank < best.rank) best = { ...address, rank };
    }
  }

  if (best !== null) {
    return {
      outcome: 'found',
      address: `${best.localPart}@${best.domain}`,
      localPart: best.localPart,
      domain: best.domain,
      preferenceRank: best.rank,
      source: best.source,
      sourceUrl: best.sourceUrl,
    };
  }

  // Most specific reason first. A site publishing jean@own-domain has a
  // different problem from one publishing only its agency's address, and the
  // more specific fact is the more useful one to park on.
  if (sawOwnDomainNamed) return { outcome: 'rejected', reason: 'named-local-parts-only' };
  if (sawFreeMail) return { outcome: 'rejected', reason: 'free-mail-only' };
  if (sawOffDomain) return { outcome: 'rejected', reason: 'off-domain-only' };
  return { outcome: 'absent', reason: 'no-address-published' };
}
