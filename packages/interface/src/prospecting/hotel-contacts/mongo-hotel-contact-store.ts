/**
 * The Mongo implementation of plan 007's contact port. Thin by design: every
 * decision lives in discover-contacts.ts and @odysseus/core, and this file only
 * says which collection answers which question.
 */

import type { Connection } from 'mongoose';
import {
  createHotelQualificationModel,
  findSuppressedDomains,
  isSuppressed,
  listCohortMembersToContact,
  recordHotelContacts,
  type CohortMemberToContact,
  type RecordHotelContactInput,
} from '@odysseus/store';
import type { HotelContactStorePort } from './discover-contacts.js';

export interface MongoHotelContactStoreOptions {
  scoringVersion: string;
  contactVersion: string;
  qualificationVersion: string;
  recontact: boolean;
}

export function createMongoHotelContactStore(
  connection: Connection,
  options: MongoHotelContactStoreOptions,
): HotelContactStorePort {
  return {
    listMembers: (listOptions): Promise<CohortMemberToContact[]> =>
      listCohortMembersToContact(connection, {
        scoringVersion: options.scoringVersion,
        contactVersion: options.contactVersion,
        recontact: options.recontact,
        ...listOptions,
      }),

    findSuppressedDomains: (domains) => findSuppressedDomains(connection, domains),

    isSuppressed: (domain, address) => isSuppressed(connection, domain, address),

    knownMentionsLegalesUrl: async (candidateId): Promise<string | null> => {
      const qualification = await createHotelQualificationModel(connection)
        .findOne({ qualificationVersion: options.qualificationVersion, candidateId })
        .select({ siteFacts: 1 })
        .lean<{ siteFacts?: { mentionsLegalesUrl?: string | null } }>();
      return qualification?.siteFacts?.mentionsLegalesUrl ?? null;
    },

    record: (inputs: readonly RecordHotelContactInput[]) => recordHotelContacts(connection, inputs),
  };
}
