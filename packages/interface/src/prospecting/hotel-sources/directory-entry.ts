import {
  normalizeDeclaredWebsite,
  websiteKindForResolution,
  type DirectoryEntry,
  type HotelSourceRecord,
} from '@odysseus/core';

function absoluteWebsite(raw: string): string {
  return /^https?:\/\//iu.test(raw) ? raw : `https://${raw}`;
}

export function directoryEntryFromHotelSource(record: HotelSourceRecord): DirectoryEntry {
  const website = record.declaredWebsite ? normalizeDeclaredWebsite(record.declaredWebsite) : null;
  const websiteUrl =
    record.declaredWebsite && website?.kind !== 'unusable'
      ? absoluteWebsite(record.declaredWebsite)
      : undefined;
  const registrableDomain =
    website && website.kind !== 'unusable' ? website.registrableDomain : undefined;
  const websiteKind =
    website === null || website.kind === 'unusable' ? 'unknown' : websiteKindForResolution(website);
  const now = new Date();
  const postcode = record.postcode;
  const digits = postcode?.replace(/\D/g, '');
  const department =
    digits && digits.length >= 2
      ? digits.startsWith('20')
        ? digits.startsWith('200')
          ? '2A'
          : '2B'
        : digits.slice(0, 2)
      : undefined;
  return {
    directoryId: `atout-france:${record.sourceId}`,
    sector: 'hotel',
    name: record.name,
    address: record.address,
    postcode,
    commune: record.commune,
    department,
    websiteUrl,
    registrableDomain,
    websiteKind,
    stars: record.starRating,
    rooms: record.roomCount,
    capacity: record.capacity,
    groupStatus: 'unknown',
    sourceRefs: [{ source: record.source, sourceId: record.sourceId }],
    createdAt: now,
    updatedAt: now,
  };
}
