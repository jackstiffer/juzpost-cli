// Media upload: presign → PUT raw bytes to R2 → return the workspace-scoped key.
// The PUT goes to the signed URL directly (absolute, no auth header — the signature IS the auth).
import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { api, ApiError } from './api.js';

const CONTENT_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

export function contentTypeFor(file: string): string {
  return CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

/** Upload a local file to R2 via presign+PUT; returns the resolved (workspace-scoped) key. */
export async function uploadMedia(filePath: string, opts: { relativeKey?: string } = {}): Promise<string> {
  const contentType = contentTypeFor(filePath);
  const relativeKey = opts.relativeKey ?? `media/${basename(filePath)}`;

  const bytes = readFileSync(filePath);
  const { signedUrl, resolvedKey } = await api<{ signedUrl: string; resolvedKey: string }>(
    '/api/cli/v1/storage/presign',
    { method: 'POST', body: { relativeKey, contentType, operation: 'upload', contentLength: bytes.length } },
  );

  const res = await fetch(signedUrl, { method: 'PUT', headers: { 'content-type': contentType }, body: bytes });
  if (!res.ok) throw new ApiError(res.status, `R2 upload failed (HTTP ${res.status})`);

  return resolvedKey;
}
