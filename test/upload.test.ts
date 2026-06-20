// Upload tests — content-type detection + presign→PUT flow, mocked fetch + temp file.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cfgHome = mkdtempSync(join(tmpdir(), 'juzpost-up-'));
process.env.XDG_CONFIG_HOME = cfgHome;
mkdirSync(join(cfgHome, 'juzpost'), { recursive: true });
writeFileSync(join(cfgHome, 'juzpost', 'config.json'), JSON.stringify({ baseUrl: 'https://api.test', token: 't' }));

const { uploadMedia, contentTypeFor } = await import('../src/upload.ts');

const clip = join(cfgHome, 'clip_03.mp4');
writeFileSync(clip, Buffer.from('fake-mp4-bytes'));

test('contentTypeFor maps known extensions, falls back to octet-stream', () => {
  assert.equal(contentTypeFor('a.mp4'), 'video/mp4');
  assert.equal(contentTypeFor('a.JPG'), 'image/jpeg');
  assert.equal(contentTypeFor('a.bin'), 'application/octet-stream');
});

let reqs: Array<{ url: string; method: string; ct?: string }>;
beforeEach(() => {
  reqs = [];
  globalThis.fetch = (async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const headers = (init.headers ?? {}) as Record<string, string>;
    reqs.push({ url, method: (init.method as string) ?? 'GET', ct: headers['content-type'] });
    if (url.includes('/storage/presign')) {
      return new Response(JSON.stringify({ signedUrl: 'https://r2.test/signed?sig=1', resolvedKey: 'uploads/w/media/clip_03.mp4' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('', { status: 200 }); // the PUT to R2
  }) as typeof fetch;
});

test('uploadMedia presigns then PUTs bytes to the signed URL, returns resolvedKey', async () => {
  const key = await uploadMedia(clip);
  assert.equal(key, 'uploads/w/media/clip_03.mp4');

  const presign = reqs.find((r) => r.url.includes('/storage/presign'))!;
  assert.equal(presign.method, 'POST');

  const put = reqs.find((r) => r.url.startsWith('https://r2.test/signed'))!;
  assert.equal(put.method, 'PUT');
  assert.equal(put.ct, 'video/mp4'); // signed content-type echoed on the PUT
});

test('uploadMedia throws on R2 PUT failure', async () => {
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input);
    if (url.includes('/storage/presign'))
      return new Response(JSON.stringify({ signedUrl: 'https://r2.test/x', resolvedKey: 'k' }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response('', { status: 403 }); // R2 rejects the PUT
  }) as typeof fetch;
  await assert.rejects(uploadMedia(clip), /R2 upload failed/);
});
