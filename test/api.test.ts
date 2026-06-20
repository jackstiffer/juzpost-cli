// Mocked-fetch tests for the API client + cursor-follow. No live backend.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point config at a temp dir with a token so auth'd calls work.
const cfgHome = mkdtempSync(join(tmpdir(), 'juzpost-api-'));
process.env.XDG_CONFIG_HOME = cfgHome;
mkdirSync(join(cfgHome, 'juzpost'), { recursive: true });
writeFileSync(join(cfgHome, 'juzpost', 'config.json'), JSON.stringify({ baseUrl: 'https://api.test', token: 't0ken' }));

const { api, apiListAll, ApiError } = await import('../src/api.ts');

type FetchArgs = { url: string; init: RequestInit };
let calls: FetchArgs[] = [];
let responder: (a: FetchArgs) => { status: number; body: unknown };

beforeEach(() => {
  calls = [];
  globalThis.fetch = (async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const { status, body } = responder({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
});

test('sends Bearer token + content-type', async () => {
  responder = () => ({ status: 200, body: { ok: true } });
  await api('/api/cli/v1/me');
  const h = calls[0].init.headers as Record<string, string>;
  assert.equal(h.authorization, 'Bearer t0ken');
  assert.equal(h['content-type'], 'application/json');
});

test('throws ApiError with status on non-2xx', async () => {
  responder = () => ({ status: 402, body: { error: 'Plan required' } });
  await assert.rejects(api('/api/cli/v1/schedule', { method: 'POST', body: {} }), (e: unknown) => {
    assert.ok(e instanceof ApiError);
    assert.equal((e as InstanceType<typeof ApiError>).status, 402);
    return true;
  });
});

test('apiListAll follows nextCursor until hasMore=false', async () => {
  const pages: Record<string, { data: unknown[]; pagination: { limit: number; nextCursor: string | null; hasMore: boolean } }> = {
    '': { data: [{ id: 1 }, { id: 2 }], pagination: { limit: 2, nextCursor: 'c1', hasMore: true } },
    c1: { data: [{ id: 3 }], pagination: { limit: 2, nextCursor: null, hasMore: false } },
  };
  responder = ({ url }) => {
    const cursor = new URL(url).searchParams.get('cursor') ?? '';
    return { status: 200, body: pages[cursor] };
  };
  const all = await apiListAll('/api/cli/v1/posts', { limit: 2 });
  assert.deepEqual(all, [{ id: 1 }, { id: 2 }, { id: 3 }]);
  assert.equal(calls.length, 2);
});
