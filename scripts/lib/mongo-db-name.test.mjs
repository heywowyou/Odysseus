import { afterEach, describe, expect, it } from 'vitest';
import { resolveMongoDbName as storeRule } from '../../packages/store/src/connection.ts';
import { resolveMongoDbName } from './mongo-db-name.mjs';

const saved = process.env['MONGODB_DB_NAME'];

afterEach(() => {
  if (saved === undefined) delete process.env['MONGODB_DB_NAME'];
  else process.env['MONGODB_DB_NAME'] = saved;
});

describe('the scripts resolve the database as the store does (issue #524)', () => {
  it.each([
    ['mongodb://h:27017/audits', 'env-db'],
    ['mongodb://h:27017/audits?retryWrites=true', 'env-db'],
    ['mongodb+srv://u:p@cluster.example/?retryWrites=true', 'env-db'],
    ['mongodb+srv://u:p@cluster.example/', ''],
    ['mongodb://h1:27017,h2:27017/', undefined],
  ])('%s with MONGODB_DB_NAME=%s', (uri, envValue) => {
    if (envValue === undefined) delete process.env['MONGODB_DB_NAME'];
    else process.env['MONGODB_DB_NAME'] = envValue;
    expect(resolveMongoDbName(uri, process.env)).toBe(storeRule(uri));
  });

  it('names no database rather than falling back to the driver default', () => {
    expect(resolveMongoDbName('mongodb+srv://cluster.example/', {})).toBeUndefined();
  });
});
