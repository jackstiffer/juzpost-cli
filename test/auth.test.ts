// Auth flow tests — mocked fetch, no-op sleep (no real poll waits).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), 'juzpost-auth-'));
process.env.JUZPOST_URL = 'https://api.test';
const { login, logout, whoami } = await import('../src/auth.ts');
const { loadConfig, saveConfig } = await import('../src/config.ts');

const noSleep = async () => {};
let queue: Array<{ status: number; body: unknown }>;
let calls: Array<{ url: string; method: string }>;

beforeEach(() => {
  queue = [];
  calls = [];
  globalThis.fetch = (async (input: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(input), method: (init.method as string) ?? 'GET' });
    const next = queue.shift() ?? { status: 200, body: {} };
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
});

test('login: start → pending(428) → token, then stores it', async () => {
  queue = [
    { status: 200, body: { deviceCode: 'dc', verifyUrl: 'https://x/approve', interval: 1, expiresIn: 30 } },
    { status: 428, body: { error: 'pending' } },
    { status: 200, body: { token: 'jp_live_X' } },
  ];
  let prompted = '';
  const r = await login({ sleep: noSleep, onPrompt: (u) => (prompted = u) });
  assert.equal(r.token, 'jp_live_X');
  assert.equal(loadConfig().token, 'jp_live_X');
  assert.equal(prompted, 'https://x/approve');
});

test('login: 410 → clear "expired" error', async () => {
  queue = [
    { status: 200, body: { deviceCode: 'dc', verifyUrl: 'u', interval: 1, expiresIn: 30 } },
    { status: 410, body: { error: 'gone' } },
  ];
  await assert.rejects(login({ sleep: noSleep }), /expired/i);
});

test('login: times out when never approved', async () => {
  queue = [{ status: 200, body: { deviceCode: 'dc', verifyUrl: 'u', interval: 1, expiresIn: 3 } }];
  // all subsequent polls default to {status:200, body:{}} → no token → loop exhausts maxWait
  await assert.rejects(login({ sleep: noSleep, maxWaitSec: 3 }), /timed out/i);
});

test('logout --revoke calls DELETE then clears token', async () => {
  saveConfig({ token: 'jp_live_Y' });
  queue = [{ status: 204, body: {} }];
  await logout({ revoke: true });
  assert.equal(loadConfig().token, undefined);
  assert.equal(calls.at(-1)?.method, 'DELETE');
});

test('whoami returns null when logged out', () => {
  saveConfig({ token: undefined });
  assert.equal(whoami(), null);
});
