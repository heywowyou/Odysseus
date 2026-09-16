import { z } from 'zod';

export const prospectStatusSchema = z.enum([
  'new',
  'audited',
  'contacted',
  'follow-up',
  'replied',
  'call',
  'quoted',
  'won',
  'lost',
  'opted-out',
]);
export type ProspectStatus = z.infer<typeof prospectStatusSchema>;

export const prospectWebsiteKindSchema = z.enum(['own', 'vendor-hosted', 'unknown']);
export type ProspectWebsiteKind = z.infer<typeof prospectWebsiteKindSchema>;

export const prospectEmailOriginSchema = z.enum([
  'atout-france',
  'site-discovery',
  'sirene',
  'operator',
]);
export type ProspectEmailOrigin = z.infer<typeof prospectEmailOriginSchema>;

const originSchema = z.enum(['atout-france', 'site-discovery', 'sirene', 'operator']);
const websiteSchema = z
  .object({
    url: z.string().url(),
    registrableDomain: z.string().min(1),
    kind: prospectWebsiteKindSchema,
    primary: z.boolean(),
  })
  .strict();
const emailSchema = z
  .object({
    address: z.string().email(),
    origin: prospectEmailOriginSchema,
    attestation: z.string().min(1).optional(),
  })
  .strict();
/** A named person at the business and their role there, entered by the
 *  operator. Free text: hotels have no fixed org chart. */
const stakeholderSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    position: z.string().trim().min(1).max(120).optional(),
  })
  .strict();
export type ProspectStakeholder = z.infer<typeof stakeholderSchema>;
const hotelExtrasSchema = z
  .object({
    stars: z.number().int().min(1).max(5).optional(),
    rooms: z.number().int().nonnegative().optional(),
    capacity: z.number().int().nonnegative().optional(),
    groupStatus: z.enum(['independent', 'group-member', 'vendor-hosted', 'unknown']).optional(),
    groupDomain: z.string().min(1).optional(),
  })
  .strict();

export const prospectSchema = z
  .object({
    prospectId: z.string().uuid(),
    sector: z.string().min(1),
    name: z.string().min(1),
    websites: z.array(websiteSchema),
    address: z.string().optional(),
    postcode: z.string().optional(),
    commune: z.string().optional(),
    department: z.string().optional(),
    phone: z.string().optional(),
    emails: z.array(emailSchema),
    stakeholders: z.array(stakeholderSchema).max(50).optional(),
    siren: z.string().optional(),
    siret: z.string().optional(),
    /** Issue #289: prospect-level company identity, independent of any
     *  scan. tradingName is the nom commercial, legalName the dénomination
     *  sociale. Optional and absent on prospects created before the fields
     *  existed; the SIREN itself is normalized and checksum-validated by
     *  the store service on save, not here, so legacy rows with a bad
     *  stored value keep loading and keep being editable. */
    tradingName: z.string().trim().min(1).max(200).optional(),
    legalName: z.string().trim().min(1).max(200).optional(),
    notes: z.string().optional(),
    /** Issue #275: the language client-facing outreach is written in. Absent
     *  means French, the default for French prospects; never the dashboard's
     *  UI language. */
    outreachLanguage: z.enum(['fr', 'en']).optional(),
    status: prospectStatusSchema,
    hotel: hotelExtrasSchema.optional(),
    fieldOrigins: z.record(z.string(), originSchema),
    directoryRef: z
      .object({ source: z.string().min(1), sourceId: z.string().min(1) })
      .strict()
      .optional(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    lastActivityAt: z.coerce.date(),
  })
  .strict();
export type Prospect = z.infer<typeof prospectSchema>;

export const prospectEventTypeSchema = z.enum([
  'status-changed',
  'field-edited',
  'scan-attached',
  'scan-detached',
  'preview-published',
  'draft-created',
  'outcome-recorded',
  'opted-out',
]);
export type ProspectEventType = z.infer<typeof prospectEventTypeSchema>;

export const prospectEventSchema = z
  .object({
    eventId: z.string().uuid(),
    prospectId: z.string().uuid(),
    type: prospectEventTypeSchema,
    payload: z.record(z.string(), z.unknown()),
    actor: z.string().min(1),
    at: z.coerce.date(),
  })
  .strict();
export type ProspectEvent = z.infer<typeof prospectEventSchema>;

export const directoryEntrySchema = z
  .object({
    directoryId: z.string().min(1),
    sector: z.string().min(1),
    name: z.string().min(1),
    address: z.string().optional(),
    postcode: z.string().optional(),
    commune: z.string().optional(),
    department: z.string().optional(),
    phone: z.string().optional(),
    websiteUrl: z.string().url().optional(),
    registrableDomain: z.string().min(1).optional(),
    websiteKind: prospectWebsiteKindSchema,
    stars: z.number().int().min(1).max(5).optional(),
    rooms: z.number().int().nonnegative().optional(),
    capacity: z.number().int().nonnegative().optional(),
    groupStatus: z.enum(['independent', 'group-member', 'vendor-hosted', 'unknown']).optional(),
    groupDomain: z.string().min(1).optional(),
    sourceRefs: z.array(z.object({ source: z.string(), sourceId: z.string() }).strict()),
    prospectId: z.string().uuid().optional(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type DirectoryEntry = z.infer<typeof directoryEntrySchema>;
