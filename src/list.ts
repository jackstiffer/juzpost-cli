// Shared plumbing for list commands: map commander options → ListParams and run a
// single cursor page (default) or follow all pages (--all). Normalizes both to one shape.
import { apiList, apiListAll, type ListParams } from './api.js';

export type ListOpts = {
  limit?: string;
  cursor?: string;
  sort?: string;
  order?: string;
  all?: boolean;
} & Record<string, unknown>;

export type ListResult = { data: unknown[]; nextCursor: string | null; hasMore: boolean };

export function toParams(opts: ListOpts, filterKeys: string[]): ListParams {
  const p: ListParams = {};
  if (opts.limit) p.limit = parseInt(opts.limit, 10);
  if (opts.cursor) p.cursor = opts.cursor;
  if (opts.sort) p.sort = opts.sort;
  if (opts.order) p.order = opts.order as 'asc' | 'desc';
  for (const k of filterKeys) {
    const v = opts[k];
    if (v != null) p[k] = v as string | number;
  }
  return p;
}

export async function runList(path: string, opts: ListOpts, filterKeys: string[] = []): Promise<ListResult> {
  const params = toParams(opts, filterKeys);
  if (opts.all) {
    return { data: await apiListAll(path, params), nextCursor: null, hasMore: false };
  }
  const page = await apiList(path, params);
  return { data: page.data, nextCursor: page.pagination.nextCursor, hasMore: page.pagination.hasMore };
}
