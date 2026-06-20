// Output rendering: --json (pretty JSON) or a human table for list data.
// ponytail: hand-rolled fixed-width table, no cli-table dep — values are short.

export function render(data: unknown, json: boolean): string {
  if (json) return JSON.stringify(data, null, 2);
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) return data.length ? table(data) : '(none)';
  return JSON.stringify(data, null, 2); // single object → JSON is the clearest plain view
}

/** Render an array of flat objects as an aligned table. Columns = keys of the first row. */
export function table(rows: unknown[], columns?: string[]): string {
  const objs = rows.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object');
  if (!objs.length) return '(none)';
  const cols = columns ?? Object.keys(objs[0]);
  const cell = (v: unknown) =>
    v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  const widths = cols.map((c) => Math.max(c.length, ...objs.map((o) => cell(o[c]).length)));
  const line = (cells: string[]) => cells.map((s, i) => s.padEnd(widths[i])).join('  ').trimEnd();
  return [line(cols), line(cols.map((_, i) => '-'.repeat(widths[i]))), ...objs.map((o) => line(cols.map((c) => cell(o[c]))))].join(
    '\n',
  );
}
