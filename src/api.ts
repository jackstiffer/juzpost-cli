// Thin HTTP client for the token-only /api/cli/v1/* namespace.
// ponytail: native fetch (Node 22), no axios. Token from config, Bearer auth.
import { baseUrl, loadConfig } from './config.js';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Opts = { method?: string; body?: unknown; query?: Record<string, string | number | undefined>; auth?: boolean };

export async function api<T = unknown>(path: string, opts: Opts = {}): Promise<T> {
  const { method = 'GET', body, query, auth = true } = opts;
  const url = new URL(path.replace(/^\//, ''), baseUrl().replace(/\/?$/, '/'));
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (auth) {
    const token = loadConfig().token;
    if (!token) throw new ApiError(401, 'Not logged in. Run `juzpost auth login`.');
    headers.authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  const data = text ? safeJson(text) : undefined;
  if (!res.ok) {
    const msg = (data as { error?: string })?.error || res.statusText || 'request failed';
    throw new ApiError(res.status, `${msg} (HTTP ${res.status})`);
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

// ── Cursor pagination (spec §3) ───────────────────────────────────────────────
export type Page<T> = { data: T[]; pagination: { limit: number; nextCursor: string | null; hasMore: boolean } };
export type ListParams = { limit?: number; cursor?: string; sort?: string; order?: 'asc' | 'desc' } & Record<
  string,
  string | number | undefined
>;

/** Fetch a single page of a list endpoint. */
export function apiList<T = unknown>(path: string, params: ListParams = {}): Promise<Page<T>> {
  return api<Page<T>>(path, { query: params });
}

/**
 * Follow `nextCursor` until exhausted or `max` rows collected.
 * ponytail: hard cap (default 1000) so a runaway server can't loop us forever.
 */
export async function apiListAll<T = unknown>(path: string, params: ListParams = {}, max = 1000): Promise<T[]> {
  const out: T[] = [];
  let cursor = params.cursor;
  do {
    const page = await apiList<T>(path, { ...params, cursor });
    out.push(...page.data);
    cursor = page.pagination.hasMore ? page.pagination.nextCursor ?? undefined : undefined;
  } while (cursor && out.length < max);
  return out.slice(0, max);
}
