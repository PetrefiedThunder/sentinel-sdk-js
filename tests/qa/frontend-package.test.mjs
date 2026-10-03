import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('FE-004: clean source packaging builds importable runtime and declaration exports', { timeout: 120_000 }, () => {
  const temporary = mkdtempSync(join(tmpdir(), 'sentinel-package-'));
  const source = join(temporary, 'source');
  const consumer = join(temporary, 'consumer');
  mkdirSync(source);
  mkdirSync(consumer);
  for (const file of ['src', 'tsconfig.json', 'package.json', 'README.md', 'LICENSE']) {
    cpSync(join(root, file), join(source, file), { recursive: true });
  }
  assert.equal(existsSync(join(source, 'dist')), false);

  // Borrow only installed compiler dependencies, never the checkout's dist.
  mkdirSync(join(source, 'node_modules', '.bin'), { recursive: true });
  mkdirSync(join(source, 'node_modules', '@types'), { recursive: true });
  for (const dependency of ['typescript', '@types/node', 'undici-types']) {
    symlinkSync(join(root, 'node_modules', dependency), join(source, 'node_modules', dependency), 'junction');
  }
  symlinkSync(join(root, 'node_modules', 'typescript', 'bin', 'tsc'), join(source, 'node_modules', '.bin', 'tsc'));

  function run(command, args, cwd) {
    const result = spawnSync(command, args, {
      cwd, encoding: 'utf8', timeout: 90_000,
      env: { ...process.env, npm_config_offline: 'true', npm_config_audit: 'false', npm_config_fund: 'false', npm_config_cache: join(temporary, 'cache') },
    });
    assert.equal(result.status, 0, result.error?.message ?? result.stdout + result.stderr);
    return result.stdout;
  }

  run('npm', ['pack', '--offline', '--pack-destination', temporary], source);
  const tarballs = readdirSync(temporary).filter((name) => name.endsWith('.tgz'));
  assert.equal(tarballs.length, 1);
  run('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', join(temporary, tarballs[0])], consumer);
  const installed = join(consumer, 'node_modules', 'sentinel-oversight');
  const manifest = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));
  for (const [subpath, entry] of Object.entries(manifest.exports)) {
    assert.ok(existsSync(join(installed, entry.import)), `Missing runtime export: ${subpath}`);
    assert.ok(existsSync(join(installed, entry.types)), `Missing declaration export: ${subpath}`);
    const specifier = 'sentinel-oversight' + (subpath === '.' ? '' : subpath.slice(1));
    run(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(specifier)})`], consumer);
  }
});
