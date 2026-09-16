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
  scanType?: 'quick-check' | 'prospecting-audit';
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

  it('ignores an unlinked internal prospecting batch', async () => {
    const prospectId = randomUUID();
    const domain = 'active-jobs-batch.fr';
    await seedJob({
      type: 'prospecting',
      status: 'running',
      urls: ['https://other.example/', `https://www.${domain}/rooms`],
    });

    const active = await listActiveJobsForProspect(connection!, prospectId, domain);

    expect(active).toEqual([]);
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
    // Issue #383: waiting for a person is not a scan still running.
    await seedJob({
      type: 'full-audit',
      status: 'needs-input',
      siteUrl: `https://${domain}/`,
      prospectId,
    });

    expect(await listActiveJobsForProspect(connection!, prospectId, domain)).toEqual([]);
  });
});

describe.skipIf(!mongoAvailable)('planProspectJobLaunch', () => {
  it('allows a new Full scan while an older one waits for operator input (issue #383)', async () => {
    const prospectId = randomUUID();
    const domain = 'active-jobs-needs-input.fr';
    await seedJob({
      type: 'full-audit',
      status: 'needs-input',
      siteUrl: `https://${domain}/`,
      prospectId,
    });

    await expect(
      planProspectJobLaunch(connection!, { kind: 'full-audit', prospectId, domain }),
    ).resolves.toEqual({ allowed: true });
  });

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

  it('refuses canonical duplicate intent rows as well as legacy aliases', async () => {
    const prospectId = randomUUID();
    const domain = 'active-jobs-canonical-duplicate.fr';
    const existing = await seedJob({
      type: 'quick-check',
      status: 'queued',
      siteUrl: `https://${domain}/`,
      prospectId,
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

  it('refuses a quick check alongside a heavy audit on the same host', async () => {
    const domain = 'active-jobs-quick-with-heavy.fr';
    const existing = await seedJob({
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
    ).resolves.toEqual({ allowed: false, conflictingJobId: existing });
  });

  it('treats bare and www hostnames as the same site', async () => {
    const domain = 'active-jobs-www-conflict.fr';
    const existing = await seedJob({
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
        hostname: `www.${domain}`,
      }),
    ).resolves.toEqual({ allowed: false, conflictingJobId: existing });
  });

  it('refuses a Full scan while a historical prospecting audit for the prospect drains', async () => {
    const prospectId = randomUUID();
    const domain = 'wixsite.com';
    const existing = await seedJob({
      type: 'prospecting-audit',
      status: 'queued',
      siteUrl: `https://drain.wixsite.com/`,
      prospectId,
    });

    await expect(
      planProspectJobLaunch(connection!, { kind: 'full-audit', prospectId, domain }),
    ).resolves.toEqual({ allowed: false, conflictingJobId: existing });
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
        kind: 'full-audit',
        prospectId: randomUUID(),
        domain,
      }),
    ).resolves.toEqual({ allowed: true });
  });

  it('still refuses duplicate work for the same prospect on a shared host', async () => {
    const prospectId = randomUUID();
    const domain = 'wixsite.com';
    const existing = await seedJob({
      type: 'quick-check',
      status: 'running',
      siteUrl: `https://hotel.wixsite.com/`,
      prospectId,
    });

    await expect(
      planProspectJobLaunch(connection!, { kind: 'quick-check', prospectId, domain }),
    ).resolves.toEqual({ allowed: false, conflictingJobId: existing });
  });

  it('uses a conservative host conflict for an unattached shared-host job', async () => {
    const domain = 'wixsite.com';
    const existing = await seedJob({
      type: 'full-audit',
      status: 'running',
      siteUrl: `https://hotel.wixsite.com/`,
    });

    await expect(
      planProspectJobLaunch(connection!, {
        kind: 'quick-check',
        prospectId: randomUUID(),
        domain,
        hostname: 'hotel.wixsite.com',
      }),
    ).resolves.toEqual({ allowed: false, conflictingJobId: existing });
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
