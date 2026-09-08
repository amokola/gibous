import 'dotenv/config';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Client } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (process.env.RELEASE_GATE_CONFIRM !== 'YES' || !databaseUrl) {
  throw new Error('Set RELEASE_GATE_CONFIRM=YES and DATABASE_URL for backup/restore verification.');
}

const source = 'gibous_release_gate_20260824';
const restore = 'gibous_release_gate_restore_20260824';
const sourceUrl = new URL(databaseUrl);
const adminUrl = new URL(databaseUrl);
const restoreUrl = new URL(databaseUrl);
adminUrl.pathname = '/postgres';
sourceUrl.pathname = `/${source}`;
restoreUrl.pathname = `/${restore}`;

const run = (executable: string, args: string[]) => {
  const result = spawnSync(executable, args, { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${executable} failed with status ${String(result.status)}`);
};

const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'gibous-release-'));
const dumpPath = path.join(temporaryDirectory, 'release.dump');

try {
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${restore}"`);
  await admin.query(`CREATE DATABASE "${restore}"`);
  await admin.end();

  run('pg_dump.exe', ['--format=custom', '--file', dumpPath, '--dbname', sourceUrl.toString()]);
  run('pg_restore.exe', ['--dbname', restoreUrl.toString(), dumpPath]);

  const restored = new Client({ connectionString: restoreUrl.toString() });
  await restored.connect();
  const result = await restored.query(`
    SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM transactions) AS transactions,
      (SELECT COUNT(*) FROM settlements) AS settlements,
      (SELECT COUNT(*) FROM matches) AS matches
  `);
  await restored.end();

  const cleanup = new Client({ connectionString: adminUrl.toString() });
  await cleanup.connect();
  await cleanup.query(`DROP DATABASE "${restore}"`);
  await cleanup.end();

  console.log(JSON.stringify({ gate: 'backup-restore', status: 'VERIFIED', restoredDatabase: restore, counts: result.rows[0] }, null, 2));
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
