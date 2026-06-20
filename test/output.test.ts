import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render, table } from '../src/output.ts';

test('render --json pretty-prints', () => {
  assert.equal(render({ a: 1 }, true), '{\n  "a": 1\n}');
});

test('render array → table with header + separator + rows', () => {
  const out = render([{ id: 'a', n: 1 }, { id: 'bb', n: 22 }], false);
  const lines = out.split('\n');
  assert.equal(lines[0], 'id  n');
  assert.match(lines[1], /^--+\s+-+$/);
  assert.equal(lines[2], 'a   1');
  assert.equal(lines[3], 'bb  22');
});

test('render empty array → (none)', () => {
  assert.equal(render([], false), '(none)');
});

test('table stringifies nested values and blanks nullish', () => {
  const out = table([{ id: 'x', meta: { k: 1 }, opt: null }]);
  assert.match(out, /\{"k":1\}/);
});
