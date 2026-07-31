import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const DATABASE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createD1MigrationConfig(databaseId) {
  if (!DATABASE_ID_PATTERN.test(databaseId ?? '')) {
    throw new Error('CLOUDFLARE_D1_DATABASE_ID must be a valid UUID');
  }

  return {
    name: 'github-blog-d1-migrations',
    compatibility_date: '2026-07-28',
    d1_databases: [
      {
        binding: 'DB',
        database_name: 'github-blog',
        database_id: databaseId,
        migrations_dir: 'migrations',
      },
    ],
  };
}

async function main() {
  const outputPath = process.argv[2];
  if (!outputPath) {
    throw new Error('usage: node scripts/create-d1-migration-config.js <output-path>');
  }

  const config = createD1MigrationConfig(process.env.CLOUDFLARE_D1_DATABASE_ID);
  await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
}

const entryPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === entryPath) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
