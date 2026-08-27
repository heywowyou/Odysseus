import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAtoutFranceSource } from './atout-france-reader.js';
import { ingestHotelCatalogue } from './ingest-hotel-catalogue.js';

const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'atout-france-sample.csv',
);

describe('ingestHotelCatalogue', () => {
  it('reports the eligibility split a dry run measured, and writes nothing', async () => {
    const report = await ingestHotelCatalogue({
      source: createAtoutFranceSource({ filePath: fixturePath }),
      ingestRunId: 'run-dry',
      dryRun: true,
    });

    expect(report.dryRun).toBe(true);
    expect(report.inserted).toBe(0);
    expect(report.counters.accepted).toBe(6);
    // 3, 5, 4 and 3 stars are eligible, 1 star is parked low, the unreadable
    // classification is parked unknown rather than treated as either.
    expect(report.eligible).toBe(4);
    expect(report.parkedBelowThreeStars).toBe(1);
    expect(report.parkedUnknownRating).toBe(1);
  });

  it('counts declared websites overall and among eligible rows separately', async () => {
    const report = await ingestHotelCatalogue({
      source: createAtoutFranceSource({ filePath: fixturePath }),
      ingestRunId: 'run-dry',
      dryRun: true,
    });

    // Five of the six accepted hotels declare a website; the one-star hotel
    // does not. All four eligible hotels do.
    expect(report.withDeclaredWebsite).toBe(5);
    expect(report.eligibleWithDeclaredWebsite).toBe(4);
  });

  it('stops at the limit and reports where to resume', async () => {
    const report = await ingestHotelCatalogue({
      source: createAtoutFranceSource({ filePath: fixturePath }),
      ingestRunId: 'run-dry',
      dryRun: true,
      limit: 2,
    });

    expect(report.counters.accepted).toBe(2);
    expect(report.resumeFrom?.filePath).toBe(fixturePath);
    expect(report.resumeFrom?.byteOffset).toBeGreaterThan(0);
  });

  it('reads to the end when no limit is given', async () => {
    const report = await ingestHotelCatalogue({
      source: createAtoutFranceSource({ filePath: fixturePath }),
      ingestRunId: 'run-dry',
      dryRun: true,
    });
    expect(report.resumeFrom).toBeNull();
  });

  it('refuses to run without a connection unless it is a dry run', async () => {
    await expect(
      ingestHotelCatalogue({
        source: createAtoutFranceSource({ filePath: fixturePath }),
        ingestRunId: 'run-live',
      }),
    ).rejects.toThrow(/connection/u);
  });
});
