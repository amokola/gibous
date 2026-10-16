import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('backup and restore release gate safety', () => {
  it('rejects a non-release-gate database before attempting a connection', () => {
    const result = spawnSync(
      process.execPath,
      [path.resolve('node_modules/tsx/dist/cli.mjs'), path.resolve('scripts/release-gates/backup-restore.ts')],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 10_000,
        env: {
          ...process.env,
          DATABASE_URL: 'postgres://release_test:synthetic@127.0.0.1:1/not_disposable',
          RELEASE_GATE_CONFIRM: 'YES',
        },
      },
    );
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain("Refusing to mutate database 'not_disposable'");
    expect(output).not.toContain('ECONNREFUSED');
  });
});
