import { afterEach, describe, expect, it } from 'vitest';
import { referenceAuditConfigFromEnvironment } from './reference-audit-object';

const keys = [
  'REFERENCE_AUDIT_BUCKET_NAME',
  'REFERENCE_AUDIT_BUCKET_ENDPOINT',
  'REFERENCE_AUDIT_BUCKET_REGION',
  'REFERENCE_AUDIT_BUCKET_ACCESS_KEY_ID',
  'REFERENCE_AUDIT_BUCKET_SECRET_KEY',
  'PREVIEW_BUCKET_NAME',
  'PREVIEW_BUCKET_ENDPOINT',
  'PREVIEW_BUCKET_REGION',
  'PREVIEW_BUCKET_ACCESS_KEY_ID',
  'PREVIEW_BUCKET_SECRET_KEY',
];

afterEach(() => {
  for (const key of keys) delete process.env[key];
});

describe('reference audit reader configuration', () => {
  it('prefers a dedicated reference bucket when one is configured', () => {
    process.env['REFERENCE_AUDIT_BUCKET_NAME'] = 'reference-bucket';
    process.env['REFERENCE_AUDIT_BUCKET_ACCESS_KEY_ID'] = 'reference-key';
    process.env['REFERENCE_AUDIT_BUCKET_SECRET_KEY'] = 'reference-secret';
    process.env['PREVIEW_BUCKET_NAME'] = 'preview-bucket';
    process.env['PREVIEW_BUCKET_ACCESS_KEY_ID'] = 'preview-key';
    process.env['PREVIEW_BUCKET_SECRET_KEY'] = 'preview-secret';

    expect(referenceAuditConfigFromEnvironment()).toMatchObject({
      bucket: 'reference-bucket',
      accessKeyId: 'reference-key',
      secretAccessKey: 'reference-secret',
    });
  });

  it('falls back to the preview bucket so the permanent example needs no second bucket', () => {
    process.env['PREVIEW_BUCKET_NAME'] = 'preview-bucket';
    process.env['PREVIEW_BUCKET_ENDPOINT'] = 'https://s3.nl-ams.scw.cloud';
    process.env['PREVIEW_BUCKET_REGION'] = 'nl-ams';
    process.env['PREVIEW_BUCKET_ACCESS_KEY_ID'] = 'preview-key';
    process.env['PREVIEW_BUCKET_SECRET_KEY'] = 'preview-secret';

    expect(referenceAuditConfigFromEnvironment()).toEqual({
      bucket: 'preview-bucket',
      endpoint: 'https://s3.nl-ams.scw.cloud',
      region: 'nl-ams',
      accessKeyId: 'preview-key',
      secretAccessKey: 'preview-secret',
    });
  });

  it('refuses to guess when neither bucket is configured', () => {
    expect(() => referenceAuditConfigFromEnvironment()).toThrow('PREVIEW_BUCKET_NAME is not set');
  });
});
