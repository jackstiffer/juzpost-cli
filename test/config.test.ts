// One runnable check: the token store round-trips and clearToken removes only the token.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), 'juzpost-test-'));
const { loadConfig, saveConfig, clearToken, baseUrl } = await import('../src/config.ts');

test('save + load round-trips', () => {
  saveConfig({ baseUrl: 'https://example.test', token: 'abc123' });
  const c = loadConfig();
  assert.equal(c.baseUrl, 'https://example.test');
  assert.equal(c.token, 'abc123');
});

test('clearToken drops the token but keeps baseUrl', () => {
  clearToken();
  const c = loadConfig();
  assert.equal(c.token, undefined);
  assert.equal(c.baseUrl, 'https://example.test');
});

test('baseUrl falls back to prod default when unset', () => {
  saveConfig({ baseUrl: undefined });
  delete process.env.JUZPOST_URL;
  assert.equal(baseUrl(), 'https://www.juzpost.com');
});
