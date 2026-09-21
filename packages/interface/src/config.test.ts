import { OUTREACH_CONTACT } from '@odysseus/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getDeployMetadata,
  getMailboxSenderAddress,
  getReferenceAuditBucketAccessKeyId,
  getReferenceAuditBucketName,
  getReferenceAuditBucketSecretAccessKey,
  isReferenceAuditBucketConfigured,
} from './config.js';

describe('getMailboxSenderAddress', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the outreach contact address when the setting matches it', () => {
    vi.stubEnv('ODYSSEUS_MAILBOX_SENDER_ADDRESS', OUTREACH_CONTACT.address);
    expect(getMailboxSenderAddress()).toBe(OUTREACH_CONTACT.address);
  });

  it('accepts a difference in case or surrounding space only', () => {
    vi.stubEnv('ODYSSEUS_MAILBOX_SENDER_ADDRESS', ` ${OUTREACH_CONTACT.address.toUpperCase()} `);
    expect(getMailboxSenderAddress()).toBe(OUTREACH_CONTACT.address);
  });

  it('refuses any other address, naming the expected one and never the configured one', () => {
    vi.stubEnv('ODYSSEUS_MAILBOX_SENDER_ADDRESS', 'someone-else@example.test');
    expect(() => getMailboxSenderAddress()).toThrow(OUTREACH_CONTACT.address);
    expect(() => getMailboxSenderAddress()).not.toThrow('someone-else');
  });
});

describe('getDeployMetadata', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reports the configured build revision, built-at stamp, and environment', () => {
    vi.stubEnv('ODYSSEUS_BUILD_ID', 'deadbee');
    vi.stubEnv('ODYSSEUS_BUILT_AT', '2026-09-13T20:01:07Z');
    vi.stubEnv('NODE_ENV', 'production');

    expect(getDeployMetadata()).toEqual({
      revision: 'deadbee',
      builtAt: '2026-09-13T20:01:07Z',
      environment: 'production',
    });
  });

  it('degrades to a null builtAt and a development environment when unstamped', () => {
    vi.stubEnv('ODYSSEUS_BUILT_AT', '');
    vi.stubEnv('NODE_ENV', '');

    const metadata = getDeployMetadata();

    expect(metadata.builtAt).toBeNull();
    expect(metadata.environment).toBe('development');
  });

  it('never exposes fields beyond the allowlisted revision, builtAt, and environment', () => {
    expect(Object.keys(getDeployMetadata()).sort()).toEqual(['builtAt', 'environment', 'revision']);
  });
});

describe('reference audit bucket configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers dedicated reference credentials when they are set', () => {
    vi.stubEnv('ODYSSEUS_REFERENCE_AUDIT_BUCKET_NAME', 'reference-bucket');
    vi.stubEnv('ODYSSEUS_REFERENCE_AUDIT_BUCKET_ACCESS_KEY_ID', 'reference-key');
    vi.stubEnv('ODYSSEUS_REFERENCE_AUDIT_BUCKET_SECRET_ACCESS_KEY', 'reference-secret');
    vi.stubEnv('ODYSSEUS_PREVIEW_BUCKET_NAME', 'preview-bucket');
    vi.stubEnv('ODYSSEUS_PREVIEW_BUCKET_ACCESS_KEY_ID', 'preview-key');
    vi.stubEnv('ODYSSEUS_PREVIEW_BUCKET_SECRET_KEY', 'preview-secret');

    expect(getReferenceAuditBucketName()).toBe('reference-bucket');
    expect(getReferenceAuditBucketAccessKeyId()).toBe('reference-key');
    expect(getReferenceAuditBucketSecretAccessKey()).toBe('reference-secret');
    expect(isReferenceAuditBucketConfigured()).toBe(true);
  });

  it('publishes into the preview bucket when no dedicated bucket exists', () => {
    vi.stubEnv('ODYSSEUS_PREVIEW_BUCKET_NAME', 'preview-bucket');
    vi.stubEnv('ODYSSEUS_PREVIEW_BUCKET_ACCESS_KEY_ID', 'preview-key');
    vi.stubEnv('ODYSSEUS_PREVIEW_BUCKET_SECRET_KEY', 'preview-secret');

    expect(getReferenceAuditBucketName()).toBe('preview-bucket');
    expect(getReferenceAuditBucketAccessKeyId()).toBe('preview-key');
    expect(getReferenceAuditBucketSecretAccessKey()).toBe('preview-secret');
    expect(isReferenceAuditBucketConfigured()).toBe(true);
  });

  it('stays unconfigured when neither bucket is set', () => {
    vi.stubEnv('ODYSSEUS_REFERENCE_AUDIT_BUCKET_NAME', '');
    vi.stubEnv('ODYSSEUS_REFERENCE_AUDIT_BUCKET_ACCESS_KEY_ID', '');
    vi.stubEnv('ODYSSEUS_REFERENCE_AUDIT_BUCKET_SECRET_ACCESS_KEY', '');
    vi.stubEnv('ODYSSEUS_PREVIEW_BUCKET_NAME', '');
    vi.stubEnv('ODYSSEUS_PREVIEW_BUCKET_ACCESS_KEY_ID', '');
    vi.stubEnv('ODYSSEUS_PREVIEW_BUCKET_SECRET_KEY', '');

    expect(isReferenceAuditBucketConfigured()).toBe(false);
  });
});
