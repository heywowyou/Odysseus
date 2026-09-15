import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { listActiveJobsForProspect, planProspectJobLaunch } from './active-jobs.js';
import { createJobModel, type JobStatus, type JobType } from './schemas/job.schema.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) await connection.close();
});

const OWN_IDS = /^active-jobs-/;

beforeEach(async () => {
  if (!connection) return;
  await createJobModel(connection).deleteMany({ jobId: OWN_IDS });
});

async function seedJob(input: {
  jobId?: string;
  type: JobType;
  status: JobStatus;
  siteUrl?: string;
  urls?: string[];
  prospectId?: string;
  scanType?: 'quick-check' | 'light-audit' | 'prospecting-audit';
  domain?: string;
  createdAt?: Date;
}): Promise<string> {
  const jobId = input.jobId ?? `active-jobs-${randomUUID()}`;
  await createJobModel(connection!).create({
    jobId,
    type: input.type,
    status: input.status,
    phase: 'queued',
    ...(input.siteUrl === undefined ? {} : { siteUrl: input.siteUrl }),
    ...(input.urls === undefined ? {} : { urls: input.urls }),
    options: {
      ...(input.prospectId === undefined ? {} : { prospectId: input.prospectId }),
      ...(input.scanType === undefined ? {} : { scanType: input.scanType }),
      ...(input.domain === undefined ? {} : { domain: input.domain }),
    },
    createdAt: input.createdAt ?? new Date(),
    progress: {},
  });
  return jobId;
}

describe.skipIf(!mongoAvailable)('listActiveJobsForProspect', () => {
  it('lists active quick, prospecting, and full audits by their operator kind', async () => {
    const prospectId = randomUUID();
    const domain = 'active-jobs-kinds.fr';
    const quickId = await seedJob({
      type: 'prospecting',
      status: 'running',
      urls: [`https://${domain}/`],
      prospectId,
      scanType: 'quick-check',
    });
    const prospectingId = await seedJob({
      type: 'outreach-full-scan',
      status: 'queued',
      siteUrl: `https://${domain}/`,
      prospectId,
      scanType: 'prospecting-audit',
    });
    const fullId = await seedJob({
      type: 'full-audit',
      status: 'running',
      siteUrl: `https://${domain}/`,
      prospectId,
    });

    const active = await listActiveJobsForProspect(connection!, prospectId, domain);

    expect(active).toHaveLength(3);
    expect(active.map((job) => job.jobId).sort()).toEqual([fullId, prospectingId, quickId].sort());
    const byId = new Map(active.map((job) => [job.jobId, job]));
    expect(byId.get(quickId)?.kind).toBe('quick-check');
    expect(byId.get(prospectingId)?.kind).toBe('prospecting-audit');
    expect(byId.get(fullId)?.kind).toBe('full-audit');
  });

  it('matches an unlinked light audit by a URL touching the prospect domain', async () => {
    const prospectId = randomUUID();
    const domain = 'active-jobs-light.fr';
    const lightAuditId = await seedJob({
      type: 'prospecting',
      status: 'running',
      urls: ['https://other.example/', `https://www.${domain}/rooms`],
      scanType: 'light-audit',
    });

    const active = await listActiveJobsForProspect(connection!, prospectId, domain);

    expect(active).toEqual([expect.objectContaining({ jobId: lightAuditId, kind: 'light-audit' })]);
  });

  it('omits terminal jobs and returns an empty array when no work is active', async () => {
    const prospectId = randomUUID();
    const domain = 'active-jobs-terminal.fr';
    await seedJob({
      type: 'full-audit',
      status: 'complete',
      siteUrl: `https://${domain}/`,
      prospectId,
    });

    expect(await listActiveJobsForProspect(connection!, prospectId, domain)).toEqual([]);
  });
});

describe.skipIf(!mongoAvailable)('planProspectJobLaunch', () => {
  it('refuses a second quick check for the same prospect', async () => {
    const prospectId = randomUUID();
    const domain = 'active-jobs-duplicate-quick.fr';
    const existing = await seedJob({
      type: 'prospecting',
      status: 'running',
      urls: [`https://${domain}/`],
      prospectId,
      scanType: 'quick-check',
    });

    await expect(
      planProspectJobLaunch(connection!, { kind: 'quick-check', prospectId, domain }),
    ).resolves.toEqual({ allowed: false, conflictingJobId: existing });
  });

  it('refuses browser-heavy scans that overlap on the same host', async () => {
    const domain = 'active-jobs-heavy-conflict.fr';
    const existing = await seedJob({
      type: 'outreach-full-scan',
      status: 'running',
      siteUrl: `https://www.${domain}/`,
      prospectId: randomUUID(),
      scanType: 'prospecting-audit',
    });

    await expect(
      planProspectJobLaunch(connection!, {
        kind: 'full-audit',
        prospectId: randomUUID(),
        domain,
      }),
    ).resolves.toEqual({ allowed: false, conflictingJobId: existing });
  });

  it('allows quick checks alongside a heavy audit', async () => {
    const domain = 'active-jobs-quick-with-heavy.fr';
    await seedJob({
      type: 'full-audit',
      status: 'running',
      siteUrl: `https://${domain}/`,
      prospectId: randomUUID(),
    });

    await expect(
      planProspectJobLaunch(connection!, {
        kind: 'quick-check',
        prospectId: randomUUID(),
        domain,
      }),
    ).resolves.toEqual({ allowed: true });
  });

  it('allows independent prospects on a shared vendor host', async () => {
    const domain = 'wixsite.com';
    await seedJob({
      type: 'full-audit',
      status: 'running',
      siteUrl: `https://${domain}/`,
      prospectId: randomUUID(),
    });

    await expect(
      planProspectJobLaunch(connection!, {
        kind: 'prospecting-audit',
        prospectId: randomUUID(),
        domain,
      }),
    ).resolves.toEqual({ allowed: true });
  });

  it('allows a retry after the conflicting job is complete', async () => {
    const domain = 'active-jobs-retry.fr';
    await seedJob({
      type: 'full-audit',
      status: 'complete',
      siteUrl: `https://${domain}/`,
      prospectId: randomUUID(),
    });

    await expect(
      planProspectJobLaunch(connection!, {
        kind: 'full-audit',
        prospectId: randomUUID(),
        domain,
      }),
    ).resolves.toEqual({ allowed: true });
  });
});
