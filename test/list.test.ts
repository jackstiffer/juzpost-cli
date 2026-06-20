// List helper tests — option→query mapping and page vs --all, mocked fetch.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cfgHome = mkdtempSync(join(tmpdir(), 'juzpost-list-'));
process.env.XDG_CONFIG_HOME = cfgHome;
mkdirSync(join(cfgHome, 'juzpost'), { recursive: true });
writeFileSync(join(cfgHome, 'juzpost', 'config.json'), JSON.stringify({ baseUrl: 'https://api.test', token: 't' }));

const { toParams, runList } = await import('../src/list.ts');

test('toParams maps list flags + whitelisted filters, ignores unknown', () => {
  const p = toParams({ limit: '50', sort: 'createdAt', order: 'asc', status: 'draft', bogus: 'x' }, ['status', 'accountId']);
  assert.deepEqual(p, { limit: 50, sort: 'createdAt', order: 'asc', status: 'draft' });
});

let lastUrl = '';
beforeEach(() => {
  globalThis.fetch = (async (input: string | URL) => {
    lastUrl = String(input);
    const cursor = new URL(lastUrl).searchParams.get('cursor') ?? '';
    const pages: Record<string, unknown> = {
      '': { data: [{ id: 1 }], pagination: { limit: 1, nextCursor: 'c1', hasMore: true } },
      c1: { data: [{ id: 2 }], pagination: { limit: 1, nextCursor: null, hasMore: false } },
    };
    return new Response(JSON.stringify(pages[cursor]), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
});

test('runList (single page) returns first page + cursor', async () => {
  const r = await runList('/api/cli/v1/posts', { limit: '1', status: 'draft' }, ['status']);
  assert.deepEqual(r, { data: [{ id: 1 }], nextCursor: 'c1', hasMore: true });
  assert.match(lastUrl, /status=draft/);
  assert.match(lastUrl, /limit=1/);
});

test('runList --all follows cursors to the end', async () => {
  const r = await runList('/api/cli/v1/posts', { all: true }, []);
  assert.deepEqual(r, { data: [{ id: 1 }, { id: 2 }], nextCursor: null, hasMore: false });
});
