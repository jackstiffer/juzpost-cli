#!/usr/bin/env node
// JuzPost CLI — command tree mirrors the Higgsfield CLI shape (subcommand groups,
// global --json, --wait-style polling). Talks to the token-only /api/cli/v1/* namespace.
// ponytail: handlers are wired but most backend endpoints are NOT built yet — they will
// 404 until the JuzPost `/api/cli/v1/*` milestone lands. Each TODO marks the missing route.
import { Command } from 'commander';
import { api, ApiError } from './api.js';
import { saveConfig } from './config.js';
import { render } from './output.js';
import * as auth from './auth.js';
import { runList, type ListResult } from './list.js';

const program = new Command();
program
  .name('juzpost')
  .description('Schedule clips to JuzPost from the terminal')
  .version('0.0.1')
  .option('--json', 'print raw JSON responses')
  .option('--base <url>', 'override API base url (persists to config)');

// --base is sugar for persisting baseUrl before any command runs.
program.hook('preAction', (thisCmd) => {
  const base = thisCmd.opts().base as string | undefined;
  if (base) saveConfig({ baseUrl: base });
});

const out = (data: unknown) => console.log(render(data, !!program.opts().json));

// Attach the shared cursor-pagination flags to a list command.
const withListOpts = (c: Command) =>
  c
    .option('--limit <n>', 'page size (1–100)')
    .option('--cursor <c>', 'pagination cursor from a previous page')
    .option('--sort <field>', 'sort field')
    .option('--order <dir>', 'asc | desc')
    .option('--all', 'follow cursors and return everything');

const printList = (r: ListResult) => {
  if (program.opts().json) return console.log(JSON.stringify(r, null, 2));
  console.log(render(r.data, false));
  if (r.hasMore && r.nextCursor) console.log(`\n… more — pass --cursor ${r.nextCursor} (or --all)`);
};

// ── auth ─────────────────────────────────────────────────────────────────────
const authCmd = program.command('auth').description('Login, logout, identity');

authCmd
  .command('login')
  .description('Browser device-code login; stores a revocable CLI token')
  .option('--device-name <name>', 'label this token in JuzPost settings')
  .action(async (opts) => {
    // Single login method by design — no paste-token path. Manual tokens stay in the dashboard.
    await auth.login({
      deviceName: opts.deviceName,
      onPrompt: (url) => console.log(`Open this URL in your browser to approve:\n  ${url}\n`),
    });
    out('Logged in. Token stored (revoke anytime in JuzPost settings).');
  });

authCmd
  .command('logout')
  .description('Clear the stored token locally')
  .option('--revoke', 'also hard-delete the token server-side')
  .action(async (opts) => {
    await auth.logout({ revoke: opts.revoke });
    out(opts.revoke ? 'Logged out and token revoked.' : 'Logged out (token still valid server-side until deleted in settings).');
  });

authCmd
  .command('whoami')
  .description('Show the identity behind the stored token')
  .action(async () => {
    const me = auth.whoami();
    out(me === null ? 'Not logged in.' : await me);
  });

// ── account ──────────────────────────────────────────────────────────────────
program
  .command('account')
  .description('Plan, entitlements, status')
  .command('status')
  .description('Show plan + paid-tier entitlements')
  .action(async () => {
    out(await api('/api/cli/v1/me')); // TODO(api): GET /api/cli/v1/me (plan + entitlement gate)
  });

// ── accounts (list) ───────────────────────────────────────────────────────────
withListOpts(
  program
    .command('accounts')
    .description('List connected social accounts')
    .option('--platform <p>', 'filter: tiktok | youtube | instagram | x')
    .option('--group-id <id>', 'filter: only accounts in this channel group'),
).action(async (opts) => printList(await runList('/api/cli/v1/accounts', opts, ['platform', 'groupId'])));

// ── groups (list) ─────────────────────────────────────────────────────────────
withListOpts(
  program
    .command('groups')
    .description('List channel groups (account presets)')
    .option('--name <q>', 'filter: name contains'),
).action(async (opts) => printList(await runList('/api/cli/v1/groups', opts, ['name'])));

// ── workspace (single object) ─────────────────────────────────────────────────
program
  .command('workspace')
  .description('Show workspace timezone + default times')
  .action(async () => out(await api('/api/cli/v1/workspace')));

// ── posts (list) ──────────────────────────────────────────────────────────────
withListOpts(
  program
    .command('posts')
    .description('List posts')
    .option('--status <s>', 'filter: draft | scheduled | posted | failed')
    .option('--account-id <id>', 'filter: posts targeting this account')
    .option('--from <date>', 'filter: ISO date lower bound')
    .option('--to <date>', 'filter: ISO date upper bound'),
).action(async (opts) => printList(await runList('/api/cli/v1/posts', opts, ['status', 'accountId', 'from', 'to'])));

// ── schedule (the point of the whole thing) ────────────────────────────────────
program
  .command('schedule')
  .description('Smart-schedule draft posts across a group')
  .requiredOption('--group <name>', 'account group (channel group) name')
  .requiredOption('--min-per-day <n>', 'minimum posts per day', (v) => parseInt(v, 10))
  .option('--post-id <id...>', 'specific draft post id(s); default = all drafts')
  .action(async (opts) => {
    // TODO(api): resolve group->accountIds + workspace tz/defaultTimes, spread across days
    // to satisfy min-per-day, then call the existing /posts/schedule service per post.
    out(
      await api('/api/cli/v1/schedule', {
        method: 'POST',
        body: { group: opts.group, minPerDay: opts.minPerDay, postIds: opts.postId },
      }),
    );
  });

program.parseAsync().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`Error: ${msg}`);
  process.exitCode = e instanceof ApiError && e.status >= 400 && e.status < 500 ? 1 : 3;
});
