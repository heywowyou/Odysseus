import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createJobModel, type JobStatus, type JobType } from './schemas/job.schema.js';
import { listActiveJobsForCandidate, planProspectJobLaunch } from './active-jobs.js';
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
  candidateId?: string;
  domain?: string;
  createdAt?: Date;
}): Promise<string> {
  const jobId = input.jobId ?? `active-jobs-${randomUUID()}`;
  await createJobModel(connection!).create({
    jobId,
    type: input.type,
    status: input.status,
    phase: 'queued',
    ...(input.siteUrl !== undefined ? { siteUrl: input.siteUrl } : {}),
    ...(input.urls !== undefined ? { urls: input.urls } : {}),
    options: {
      ...(input.domain !== undefined ? { domain: input.domain } : {}),
      ...(input.candidateId !== undefined ? { outreachCandidateId: input.candidateId } : {}),
    },
    createdAt: input.createdAt ?? new Date(),
    progress: {},
  });
  return jobId;
}

describe.skipIf(!mongoAvailable)('listActiveJobsForCandidate (issue #220)', () => {
  it('lists an active Quick check, Prospecting audit, and Full audit, each mapped to its operator kind', async () => {
    const candidateId = randomUUID();
    const domain = 'active-jobs-quickcheck.fr';
    const prescanId = await seedJob({ type: 'hotel-prescan', status: 'running', domain });
    const outreachId = await seedJob({
      type: 'outreach-full-scan',
      status: 'queued',
      siteUrl: `https://${domain}/`,
      candidateId,
    });
    const fullAuditId = await seedJob({
      type: 'full-audit',
      status: 'running',
      siteUrl: `https://${domain}/`,
      candidateId,
    });

    const active = await listActiveJobsForCandidate(connection!, candidateId, domain);

    expect(active).toHaveLength(3);
    expect(active.map((job) => job.jobId).sort()).toEqual(
      [fullAuditId, outreachId, prescanId].sort(),
    );
    const byId = new Map(active.map((job) => [job.jobId, job]));
    expect(byId.get(prescanId)?.kind).toBe('quick-check');
    expect(byId.get(outreachId)?.kind).toBe('prospecting-audit');
    expect(byId.get(fullAuditId)?.kind).toBe('full-audit');
  });

  it('matches a Light audit job by its urls array touching the candidate domain, not a candidateId', async () => {
    const candidateId = randomUUID();
    const domain = 'active-jobs-lightaudit.fr';
    const lightAuditId = await seedJob({
      type: 'prospecting',
      status: 'running',
      urls: ['https://other-hotel.fr/', `https://www.${domain}/rooms`],
    });

    const active = await listActiveJobsForCandidate(connection!, candidateId, domain);

    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ jobId: lightAuditId, kind: 'light-audit' });
  });

  it('omits completed, failed, and cancelled jobs', async () => {
    const candidateId = randomUUID();
    const domain = 'active-jobs-done.fr';
    await seedJob({ type: 'hotel-prescan', status: 'complete', domain });
    const active = await listActiveJobsForCandidate(connection!, candidateId, domain);
    expect(active).toEqual([]);
  });

  it('returns an empty array for a candidate with no active work', async () => {
    const active = await listActiveJobsForCandidate(
      connection!,
      randomUUID(),
      'active-jobs-quiet.fr',
    );
    expect(active).toEqual([]);
  });
});

describe.skipIf(!mongoAvailable)('planProspectJobLaunch (issue #220)', () => {
  it('refuses a second Quick check for the same candidate while one is already active', async () => {
    const candidateId = randomUUID();
    const domain = 'active-jobs-dup-quickcheck.fr';
    const existing = await seedJob({ type: 'hotel-prescan', status: 'running', domain });

    const decision = await planProspectJobLaunch(connection!, {
      kind: 'quick-check',
      candidateId,
      domain,
    });

    expect(decision).toEqual({ allowed: false, conflictingJobId: existing });
  });

  it('refuses a Full audit while a Prospecting audit is already crawling the same host', async () => {
    const candidateId = randomUUID();
    const domain = 'active-jobs-full-vs-prospecting.fr';
    const existing = await seedJob({
      type: 'outreach-full-scan',
      status: 'running',
      siteUrl: `https://${domain}/`,
      candidateId: randomUUID(),
    });

    const decision = await planProspectJobLaunch(connection!, {
      kind: 'full-audit',
      candidateId,
      domain,
    });

    expect(decision).toEqual({ allowed: false, conflictingJobId: existing });
  });

  it('refuses a Light audit while a Full audit is already crawling the same host', async () => {
    const domain = 'active-jobs-light-vs-full.fr';
    const existing = await seedJob({
      type: 'full-audit',
      status: 'queued',
      siteUrl: `https://www.${domain}/`,
      candidateId: randomUUID(),
    });

    const decision = await planProspectJobLaunch(connection!, {
      kind: 'light-audit',
      candidateId: randomUUID(),
      domain,
    });

    expect(decision).toEqual({ allowed: false, conflictingJobId: existing });
  });

  it('allows a Quick check to run alongside a browser-heavy audit on the same host', async () => {
    const candidateId = randomUUID();
    const domain = 'active-jobs-quickcheck-vs-full.fr';
    await seedJob({
      type: 'full-audit',
      status: 'running',
      siteUrl: `https://${domain}/`,
      candidateId,
    });

    const decision = await planProspectJobLaunch(connection!, {
      kind: 'quick-check',
      candidateId,
      domain,
    });

    expect(decision).toEqual({ allowed: true });
  });

  it('allows two different candidates to both scan a shared/vendor host at once', async () => {
    const domain = 'wixsite.com';
    await seedJob({
      type: 'full-audit',
      status: 'running',
      siteUrl: `https://${domain}/`,
      candidateId: randomUUID(),
    });

    const decision = await planProspectJobLaunch(connection!, {
      kind: 'prospecting-audit',
      candidateId: randomUUID(),
      domain,
    });

    expect(decision).toEqual({ allowed: true });
  });

  it('allows a retry once the conflicting job has completed', async () => {
    const candidateId = randomUUID();
    const domain = 'active-jobs-retry.fr';
    await seedJob({
      type: 'hotel-prescan',
      status: 'complete',
      domain,
    });

    const decision = await planProspectJobLaunch(connection!, {
      kind: 'quick-check',
      candidateId,
      domain,
    });

    expect(decision).toEqual({ allowed: true });
  });

  it('treats www and bare hostnames as the same host for the browser-heavy conflict check', async () => {
    const domain = 'active-jobs-www.fr';
    const existing = await seedJob({
      type: 'outreach-full-scan',
      status: 'running',
      siteUrl: 'https://www.active-jobs-www.fr/',
      candidateId: randomUUID(),
    });

    const decision = await planProspectJobLaunch(connection!, {
      kind: 'full-audit',
      candidateId: randomUUID(),
      domain,
    });

    expect(decision).toEqual({ allowed: false, conflictingJobId: existing });
  });

  it('allows the launch when nothing active touches the candidate or the host', async () => {
    const decision = await planProspectJobLaunch(connection!, {
      kind: 'full-audit',
      candidateId: randomUUID(),
      domain: 'active-jobs-free.fr',
    });
    expect(decision).toEqual({ allowed: true });
  });
});
