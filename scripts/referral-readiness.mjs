// Test the exact uploaded build against the pinned platform in an isolated ledger.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.PAS_REFERRAL_DIST) throw new Error('PAS_REFERRAL_DIST must be the build uploaded by this deployment');
const dist = resolve(process.env.PAS_REFERRAL_DIST);
const { revision } = JSON.parse(readFileSync(join(root, 'scripts/referral-platform.json'), 'utf8'));
if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('A full platform revision is required');
const temp = mkdtempSync(join(tmpdir(), 'dating-readiness-'));
const platform = join(temp, 'platform');
const run = (cmd, args, cwd = platform, env = process.env) => execFileSync(cmd, args, { cwd, env, stdio: 'inherit' });
try {
  run('git', ['clone', '--branch', 'main', '--single-branch', 'https://github.com/proappstore-online/platform.git', platform], temp);
  run('git', ['reset', '--hard', revision]); // only this disposable clone's main
  run('pnpm', ['install', '--frozen-lockfile']);
  run('pnpm', ['--filter', '@proappstore/build-core', '--filter', '@proappstore/compliance', '--filter', '@proappstore/qa-spec', 'build']);
  run('pnpm', ['--filter', '@proappstore/backend', 'prebuild']);
  run('pnpm', ['exec', 'playwright', 'install', '--with-deps', 'chromium', 'webkit']);
  run(process.execPath, ['scripts/test-referral-browser.mjs'], platform, { ...process.env, PAS_REFERRAL_APP: 'dating', PAS_REFERRAL_DIST: dist, PAS_REFERRAL_ARTIFACTS: join(root, 'artifacts/referral-readiness') });
} finally { rmSync(temp, { recursive: true, force: true }); }
