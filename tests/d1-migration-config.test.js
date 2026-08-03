import test from 'node:test';
import assert from 'node:assert/strict';

import { createD1MigrationConfig } from '../scripts/create-d1-migration-config.js';

const DATABASE_ID = '11111111-1111-4111-8111-111111111111';

test('createD1MigrationConfig creates a migration-only Wrangler config', () => {
  assert.deepEqual(createD1MigrationConfig(DATABASE_ID), {
    name: 'github-blog-d1-migrations',
    compatibility_date: '2026-07-28',
    d1_databases: [
      {
        binding: 'DB',
        database_name: 'github-blog',
        database_id: DATABASE_ID,
        migrations_dir: 'migrations',
      },
    ],
  });
});

test('createD1MigrationConfig rejects missing or malformed database IDs', () => {
  assert.throws(
    () => createD1MigrationConfig(),
    /CLOUDFLARE_D1_DATABASE_ID must be a valid UUID/
  );
  assert.throws(
    () => createD1MigrationConfig('github-blog'),
    /CLOUDFLARE_D1_DATABASE_ID must be a valid UUID/
  );
});
