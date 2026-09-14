import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { probeMongoAvailability } from '../test-support.js';
import { upsertHotelCandidates } from '../hotel-candidates.js';
import { recordHotelQualifications } from '../hotel-qualifications.js';
import { createHotelCandidateModel } from '../schemas/hotel-candidate.schema.js';
import { createHotelQualificationModel } from '../schemas/hotel-qualification.schema.js';
import { createPrescanModel } from '../schemas/prescan.schema.js';
import { createHotelScoreModel } from '../schemas/score.schema.js';
import { createHotelContactModel } from '../schemas/hotel-contact.schema.js';
import { createOutreachThreadModel } from '../schemas/outreach-thread.schema.js';
import { createOutreachDraftModel } from '../schemas/outreach-draft.schema.js';
import { createOutreachOutcomeModel } from '../schemas/outreach-outcome.schema.js';
import { createOutreachPreviewModel } from '../schemas/outreach-preview.schema.js';
import { createHotelScoreCohortModel } from '../schemas/score-cohort.schema.js';
import { createWaveRosterEntryModel } from '../schemas/wave-roster.schema.js';
import { addWaveRosterEntry } from '../wave-roster.js';
import { listOperatorProspects, type OperatorProspectQueue } from './prospect-list.js';
import {
  candidateInput,
  CURRENT_VERSIONS,
  expectSafeShape,
  qualificationInput,
  QUALIFICATION_VERSION,
  RESOLUTION_VERSION,
  SCORING_VERSION,
  seedFullFunnel,
} from './test-fixtures.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) await connection.close();
});

describe.skipIf(!mongoAvailable)('operator views', () => {
  beforeEach(async () => {
    if (!connection) return;
    await createHotelCandidateModel(connection).deleteMany({});
    await createHotelQualificationModel(connection).deleteMany({});
    await createPrescanModel(connection).deleteMany({});
    await createHotelScoreModel(connection).deleteMany({});
    await createHotelContactModel(connection).deleteMany({});
    await createOutreachThreadModel(connection).deleteMany({});
    await createOutreachDraftModel(connection).deleteMany({});
    await createOutreachOutcomeModel(connection).deleteMany({});
    await createOutreachPreviewModel(connection).deleteMany({});
    await createHotelScoreCohortModel(connection).deleteMany({});
    await createWaveRosterEntryModel(connection).deleteMany({});
  });

  describe('listOperatorProspects', () => {
    it('paginates deterministically and covers every row exactly once across offset windows', async () => {
      if (!connection) return;
      const inputs = Array.from({ length: 25 }, () => candidateInput());
      await upsertHotelCandidates(connection!, inputs);

      const collected: string[] = [];
      for (const offset of [0, 10, 20, 30]) {
        const page = await listOperatorProspects(
          connection!,
          {
            resolutionVersion: RESOLUTION_VERSION,
            limit: 10,
            offset,
          },
          CURRENT_VERSIONS,
        );
        expect(page.limit).toBe(10);
        expect(page.offset).toBe(offset);
        expect(page.total).toBe(25);
        collected.push(...page.rows.map((row) => row.candidateId));
        expect(page.rows.length).toBe(offset < 25 ? Math.min(10, 25 - offset) : 0);
      }
      expect(collected).toHaveLength(25);
      expect(new Set(collected).size).toBe(25);
      // Sorted set: walking again collects the same ids in the same order.
      const secondWalk: string[] = [];
      for (const offset of [0, 10, 20]) {
        const page = await listOperatorProspects(
          connection!,
          {
            resolutionVersion: RESOLUTION_VERSION,
            limit: 10,
            offset,
          },
          CURRENT_VERSIONS,
        );
        secondWalk.push(...page.rows.map((row) => row.candidateId));
      }
      expect(secondWalk).toEqual(collected.slice(0, 30));
    }, 15_000);

    it('returns identical order for the same query and applies the default and hard cap', async () => {
      if (!connection) return;
      const inputs = Array.from({ length: 5 }, () => candidateInput());
      await upsertHotelCandidates(connection!, inputs);

      const first = await listOperatorProspects(
        connection!,
        {
          resolutionVersion: RESOLUTION_VERSION,
        },
        CURRENT_VERSIONS,
      );
      const second = await listOperatorProspects(
        connection!,
        {
          resolutionVersion: RESOLUTION_VERSION,
        },
        CURRENT_VERSIONS,
      );
      expect(first.rows.map((row) => row.candidateId)).toEqual(
        second.rows.map((row) => row.candidateId),
      );
      // Default limit is 50; the hard cap clamps a larger request.
      expect(first.limit).toBe(50);

      const capped = await listOperatorProspects(
        connection!,
        {
          resolutionVersion: RESOLUTION_VERSION,
          limit: 500,
        },
        CURRENT_VERSIONS,
      );
      expect(capped.limit).toBe(200);
    });

    it('keeps same-named candidates stable through the unique id tiebreaker', async () => {
      if (!connection) return;
      const shared = 'Hôtel du Leman';
      const inputs = Array.from({ length: 3 }, () =>
        candidateInput({ name: shared, normalizedName: 'hotel du leman' }),
      );
      await upsertHotelCandidates(connection!, inputs);

      const page = await listOperatorProspects(
        connection!,
        {
          resolutionVersion: RESOLUTION_VERSION,
        },
        CURRENT_VERSIONS,
      );
      expect(page.rows.map((row) => row.name)).toEqual([shared, shared, shared]);
      const ids = page.rows.map((row) => row.candidateId);
      expect(new Set(ids).size).toBe(3);
      expect(ids).toEqual([...ids].sort((a, b) => (a < b ? -1 : 1)));
    });

    it('filters every operator queue', async () => {
      if (!connection) return;
      const join = candidateInput({
        identityStatus: 'needs-review',
        review: { state: 'pending', queuedReason: 'siret-disagreement' },
      });
      const parked = candidateInput();
      const rejected = candidateInput();
      const engaged = candidateInput();
      const grouped = candidateInput({
        groupStatus: 'group-member',
        groupDomain: 'groupe-exemple.fr',
        groupSize: 12,
      });
      const plain = candidateInput();
      await upsertHotelCandidates(connection!, [join, parked, rejected, engaged, grouped, plain]);

      await recordHotelQualifications(connection!, [
        qualificationInput(parked.candidateId, { outcome: 'parked' }),
        qualificationInput(rejected.candidateId, {
          outcome: 'rejected',
          reasons: ['dns-unresolved'],
        }),
        qualificationInput(engaged.candidateId, {
          outcome: 'already-engaged',
          reasons: ['accessibility-statement-published'],
        }),
      ]);

      const members = async (queue: OperatorProspectQueue) => {
        const page = await listOperatorProspects(
          connection!,
          {
            resolutionVersion: RESOLUTION_VERSION,
            queue,
          },
          CURRENT_VERSIONS,
        );
        return page.rows.map((row) => row.candidateId).sort();
      };

      await expect(members('join-review')).resolves.toEqual([join.candidateId]);
      await expect(members('parked')).resolves.toEqual([parked.candidateId]);
      await expect(members('rejected')).resolves.toEqual([rejected.candidateId]);
      await expect(members('already-engaged')).resolves.toEqual([engaged.candidateId]);
      await expect(members('groups')).resolves.toEqual([grouped.candidateId]);

      // Plain field filters refine the same query surface.
      const pendingReview = await listOperatorProspects(
        connection!,
        {
          resolutionVersion: RESOLUTION_VERSION,
          reviewState: 'pending',
        },
        CURRENT_VERSIONS,
      );
      expect(pendingReview.rows.map((row) => row.candidateId)).toEqual([join.candidateId]);

      const notEvaluated = await listOperatorProspects(
        connection!,
        {
          resolutionVersion: RESOLUTION_VERSION,
          qualificationOutcome: 'not-evaluated',
        },
        CURRENT_VERSIONS,
      );
      expect(notEvaluated.rows.map((row) => row.candidateId).sort()).toEqual(
        [join.candidateId, grouped.candidateId, plain.candidateId].sort(),
      );
    });

    it('carries qualification reason codes, score totals, contact, thread, and outcome per row', async () => {
      if (!connection) return;
      const candidateId = 'cand-funnel-row';
      await seedFullFunnel(connection!, candidateId);
      const parkedId = 'cand-parked-row';
      await upsertHotelCandidates(connection!, [candidateInput({ candidateId: parkedId })]);
      await recordHotelQualifications(connection!, [qualificationInput(parkedId)]);

      const page = await listOperatorProspects(
        connection!,
        {
          resolutionVersion: RESOLUTION_VERSION,
          limit: 10,
          offset: 0,
        },
        CURRENT_VERSIONS,
      );
      const funnelRow = page.rows.find((row) => row.candidateId === candidateId);
      expect(funnelRow).toBeDefined();
      expect(funnelRow?.qualificationOutcome).toBe('qualified');
      expect(funnelRow?.qualificationReasons).toEqual([]);
      expect(funnelRow?.qualificationFreshness.state).toBe('current');
      expect(funnelRow?.prescanStatus).toBe('complete');
      expect(funnelRow?.scoringVersion).toBe(SCORING_VERSION);
      expect(funnelRow?.scoreFreshness.state).toBe('current');
      expect(funnelRow?.brokennessTotal).toBe(42);
      expect(funnelRow?.abilityTotal).toBe(65);
      expect(funnelRow?.contactState).toBe('found');
      expect(funnelRow?.threadState).toBe('open');
      expect(funnelRow?.outcome).toBe('reply-positive');
      expectSafeShape(funnelRow);

      const parkedRow = page.rows.find((row) => row.candidateId === parkedId);
      expect(parkedRow?.qualificationOutcome).toBe('parked');
      expect(parkedRow?.qualificationReasons).toEqual(['below-three-stars']);
      expect(parkedRow?.scoringVersion).toBeNull();
      expect(parkedRow?.contactState).toBeNull();
    });

    // Issue #217 item 8: list and detail projections must agree about
    // current/stale score state, so a sort or filter on the list never
    // treats an old generation's score as current.
    it('agrees with the detail view that a row is stale, not current, at an older pipeline version', async () => {
      if (!connection) return;
      const candidateId = 'cand-funnel-stale-row';
      await seedFullFunnel(connection!, candidateId);

      const staleVersions = { ...CURRENT_VERSIONS, qualificationVersion: 'qv-2' };
      const page = await listOperatorProspects(
        connection!,
        { resolutionVersion: RESOLUTION_VERSION, limit: 10, offset: 0 },
        staleVersions,
      );

      const row = page.rows.find((r) => r.candidateId === candidateId);
      expect(row?.qualificationFreshness).toMatchObject({
        state: 'stale',
        version: QUALIFICATION_VERSION,
        currentVersion: 'qv-2',
      });
      // Never silently converted to numeric zero: the historical score
      // total stays visible even though its stage-freshness is untouched
      // here (only qualification was made stale).
      expect(row?.brokennessTotal).toBe(42);
      expect(row?.scoreFreshness.state).toBe('current');
    });

    it('marks a score stale when the prescan generation it was derived from is stale', async () => {
      if (!connection) return;
      const candidateId = 'cand-funnel-stale-score-row';
      await seedFullFunnel(connection!, candidateId);

      const staleVersions = { ...CURRENT_VERSIONS, prescanVersion: 'v4' };
      const page = await listOperatorProspects(
        connection!,
        { resolutionVersion: RESOLUTION_VERSION, limit: 10, offset: 0 },
        staleVersions,
      );

      const row = page.rows.find((r) => r.candidateId === candidateId);
      expect(row?.scoreFreshness).toMatchObject({
        state: 'stale',
        currentVersion: SCORING_VERSION,
      });
    });

    it('finds candidates by name case- and accent-insensitively in both directions', async () => {
      if (!connection) return;
      const accented = candidateInput({
        name: 'Hôtel Belvédère',
        normalizedName: 'hotel belvedere',
      });
      const plain = candidateInput({
        name: 'Hotel Saint Clair',
        normalizedName: 'hotel saint clair',
      });
      await upsertHotelCandidates(connection!, [accented, plain]);

      const byUnaccentedQuery = await listOperatorProspects(
        connection!,
        {
          resolutionVersion: RESOLUTION_VERSION,
          search: 'belvedere',
        },
        CURRENT_VERSIONS,
      );
      expect(byUnaccentedQuery.rows.map((row) => row.candidateId)).toEqual([accented.candidateId]);

      const byAccentedQuery = await listOperatorProspects(
        connection!,
        {
          resolutionVersion: RESOLUTION_VERSION,
          search: 'Hôtel',
        },
        CURRENT_VERSIONS,
      );
      expect(byAccentedQuery.rows.map((row) => row.candidateId).sort()).toEqual(
        [accented.candidateId, plain.candidateId].sort(),
      );
    });

    it('finds candidates by commune, postcode, and candidate id', async () => {
      if (!connection) return;
      const byCommune = candidateInput({ commune: 'Chamonix-Mont-Blanc' });
      const byPostcode = candidateInput({ postcode: '74400' });
      const byId = candidateInput({ candidateId: 'cand-siren-42810' });
      await upsertHotelCandidates(connection!, [byCommune, byPostcode, byId]);

      const communeHit = await listOperatorProspects(
        connection!,
        {
          resolutionVersion: RESOLUTION_VERSION,
          search: 'chamonix',
        },
        CURRENT_VERSIONS,
      );
      expect(communeHit.rows.map((row) => row.candidateId)).toEqual([byCommune.candidateId]);

      const postcodeHit = await listOperatorProspects(
        connection!,
        {
          resolutionVersion: RESOLUTION_VERSION,
          search: '74400',
        },
        CURRENT_VERSIONS,
      );
      expect(postcodeHit.rows.map((row) => row.candidateId)).toEqual([byPostcode.candidateId]);

      const idHit = await listOperatorProspects(
        connection!,
        {
          resolutionVersion: RESOLUTION_VERSION,
          search: '42810',
        },
        CURRENT_VERSIONS,
      );
      expect(idHit.rows.map((row) => row.candidateId)).toEqual([byId.candidateId]);
    });

    it('matches regex special characters literally', async () => {
      if (!connection) return;
      const plus = candidateInput({ name: 'A+B Hôtel', normalizedName: 'a+b hotel' });
      const parens = candidateInput({ name: 'Le Panier (Bis)', normalizedName: 'le panier bis' });
      await upsertHotelCandidates(connection!, [plus, parens]);

      const plusHit = await listOperatorProspects(
        connection!,
        {
          resolutionVersion: RESOLUTION_VERSION,
          search: 'a+b',
        },
        CURRENT_VERSIONS,
      );
      expect(plusHit.rows.map((row) => row.candidateId)).toEqual([plus.candidateId]);

      const parensHit = await listOperatorProspects(
        connection!,
        {
          resolutionVersion: RESOLUTION_VERSION,
          search: '(bis)',
        },
        CURRENT_VERSIONS,
      );
      expect(parensHit.rows.map((row) => row.candidateId)).toEqual([parens.candidateId]);
    });

    it('returns an empty page when nothing matches and treats a blank query as no constraint', async () => {
      if (!connection) return;
      const seeded = candidateInput();
      await upsertHotelCandidates(connection!, [seeded]);

      const noHit = await listOperatorProspects(
        connection!,
        {
          resolutionVersion: RESOLUTION_VERSION,
          search: 'zzzzquarante-deux',
        },
        CURRENT_VERSIONS,
      );
      expect(noHit.rows).toEqual([]);
      expect(noHit.total).toBe(0);

      const blank = await listOperatorProspects(
        connection!,
        {
          resolutionVersion: RESOLUTION_VERSION,
          search: '   ',
        },
        CURRENT_VERSIONS,
      );
      expect(blank.total).toBe(1);
      expect(blank.rows.map((row) => row.candidateId)).toEqual([seeded.candidateId]);
    });

    it('combines the search with the other filters', async () => {
      if (!connection) return;
      const shared = 'Hôtel Belvédère';
      const parked = candidateInput({ name: shared, normalizedName: 'hotel belvedere' });
      const pending = candidateInput({
        name: shared,
        normalizedName: 'hotel belvedere',
        identityStatus: 'needs-review',
        review: { state: 'pending', queuedReason: 'siret-disagreement' },
      });
      await upsertHotelCandidates(connection!, [parked, pending]);
      await recordHotelQualifications(connection!, [qualificationInput(parked.candidateId)]);

      const page = await listOperatorProspects(
        connection!,
        {
          resolutionVersion: RESOLUTION_VERSION,
          search: 'belvedere',
          queue: 'parked',
        },
        CURRENT_VERSIONS,
      );
      expect(page.total).toBe(1);
      expect(page.rows.map((row) => row.candidateId)).toEqual([parked.candidateId]);
    });

    it('stamps inSelection from an approved cohort, and reports the page facts', async () => {
      if (!connection) return;
      const selected = candidateInput();
      const notSelected = candidateInput();
      await upsertHotelCandidates(connection!, [selected, notSelected]);

      await createHotelScoreCohortModel(connection!).create({
        cohortId: 'cohort-b1',
        scoringVersion: SCORING_VERSION,
        selectionRuleVersion: 'half-ability-decile-brokenness-v1',
        approved: true,
        populationSize: 2,
        abilityCutoff: 60,
        brokennessCutoff: 40,
        selectedCount: 1,
        members: [
          {
            candidateId: selected.candidateId,
            scoreId: 'score-1',
            rank: 1,
            state: 'selected',
            reason: 'top-brokenness-decile',
          },
        ],
        notSelectedByReason: { 'below-ability-cutoff': 1 },
        computedAt: new Date('2026-09-08T00:00:00.000Z'),
        createdAt: new Date('2026-09-08T00:00:00.000Z'),
        expiresAt: new Date(Date.now() + 86_400_000),
      });

      const page = await listOperatorProspects(
        connection!,
        {
          resolutionVersion: RESOLUTION_VERSION,
        },
        CURRENT_VERSIONS,
      );
      const byId = new Map(page.rows.map((row) => [row.candidateId, row]));
      expect(byId.get(selected.candidateId)).toMatchObject({
        inSelection: true,
        selectionSource: 'cohort',
        selectionRank: 1,
      });
      expect(byId.get(notSelected.candidateId)).toMatchObject({
        inSelection: false,
        selectionSource: null,
        selectionRank: null,
      });
      expect(page.selection).toMatchObject({
        cohortId: 'cohort-b1',
        populationSize: 2,
        selectedCount: 1,
        abilityCutoff: 60,
        brokennessCutoff: 40,
      });
      expect(page.selectedCount).toBe(1);
    });

    it('a hotel selected only in an unapproved cohort is not in selection until it is also on the roster', async () => {
      if (!connection) return;
      const candidate = candidateInput();
      await upsertHotelCandidates(connection!, [candidate]);
      await createHotelScoreCohortModel(connection!).create({
        cohortId: 'cohort-unapproved',
        scoringVersion: SCORING_VERSION,
        selectionRuleVersion: 'half-ability-decile-brokenness-v1',
        approved: false,
        populationSize: 1,
        abilityCutoff: null,
        brokennessCutoff: null,
        selectedCount: 1,
        members: [
          {
            candidateId: candidate.candidateId,
            scoreId: 'score-1',
            rank: 1,
            state: 'selected',
            reason: 'top-brokenness-decile',
          },
        ],
        notSelectedByReason: {},
        computedAt: new Date(),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
      });

      const beforeRoster = await listOperatorProspects(
        connection!,
        {
          resolutionVersion: RESOLUTION_VERSION,
          inSelection: true,
        },
        CURRENT_VERSIONS,
      );
      expect(beforeRoster.rows).toEqual([]);

      await addWaveRosterEntry(connection!, {
        wave: 'wave-1',
        candidateId: candidate.candidateId,
        rank: 8,
        scoringVersion: SCORING_VERSION,
        actor: 'operator',
      });

      const afterRoster = await listOperatorProspects(
        connection!,
        {
          resolutionVersion: RESOLUTION_VERSION,
          inSelection: true,
        },
        CURRENT_VERSIONS,
      );
      expect(afterRoster.rows.map((row) => row.candidateId)).toEqual([candidate.candidateId]);
      expect(afterRoster.rows[0]).toMatchObject({
        selectionSource: 'wave-roster',
        selectionRank: 8,
      });
    });

    it('the inSelection filter narrows to exactly the selected set, in either direction', async () => {
      if (!connection) return;
      const selected = candidateInput();
      const other = candidateInput();
      await upsertHotelCandidates(connection!, [selected, other]);
      await createHotelScoreCohortModel(connection!).create({
        cohortId: 'cohort-filter',
        scoringVersion: SCORING_VERSION,
        selectionRuleVersion: 'half-ability-decile-brokenness-v1',
        approved: true,
        populationSize: 2,
        abilityCutoff: null,
        brokennessCutoff: null,
        selectedCount: 1,
        members: [
          {
            candidateId: selected.candidateId,
            scoreId: 'score-1',
            rank: 1,
            state: 'selected',
            reason: 'top-brokenness-decile',
          },
        ],
        notSelectedByReason: {},
        computedAt: new Date(),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
      });

      const onlySelected = await listOperatorProspects(
        connection!,
        {
          resolutionVersion: RESOLUTION_VERSION,
          inSelection: true,
        },
        CURRENT_VERSIONS,
      );
      expect(onlySelected.rows.map((row) => row.candidateId)).toEqual([selected.candidateId]);

      const onlyRest = await listOperatorProspects(
        connection!,
        {
          resolutionVersion: RESOLUTION_VERSION,
          inSelection: false,
        },
        CURRENT_VERSIONS,
      );
      expect(onlyRest.rows.map((row) => row.candidateId)).toEqual([other.candidateId]);
    });

    it('catalogueTotal states the whole catalogue size, ignoring the selection filter', async () => {
      if (!connection) return;
      const selected = candidateInput();
      const other = candidateInput();
      await upsertHotelCandidates(connection!, [selected, other]);
      await createHotelScoreCohortModel(connection!).create({
        cohortId: 'cohort-catalogue-total',
        scoringVersion: SCORING_VERSION,
        selectionRuleVersion: 'half-ability-decile-brokenness-v1',
        approved: true,
        populationSize: 2,
        abilityCutoff: null,
        brokennessCutoff: null,
        selectedCount: 1,
        members: [
          {
            candidateId: selected.candidateId,
            scoreId: 'score-1',
            rank: 1,
            state: 'selected',
            reason: 'top-brokenness-decile',
          },
        ],
        notSelectedByReason: {},
        computedAt: new Date(),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
      });

      const filtered = await listOperatorProspects(
        connection!,
        {
          resolutionVersion: RESOLUTION_VERSION,
          inSelection: true,
        },
        CURRENT_VERSIONS,
      );
      expect(filtered.total).toBe(1);
      expect(filtered.catalogueTotal).toBe(2);
    });
  });
});
