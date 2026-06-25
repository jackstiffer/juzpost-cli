#!/usr/bin/env node
// JuzPost CLI — command tree mirrors the Higgsfield CLI shape (subcommand groups,
// global --json, --wait-style polling). Talks to the token-only /api/cli/v1/* namespace.
// Backend endpoints live in the JuzPost repo's /api/cli/v1/* namespace.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { Command } from 'commander';
import { api, ApiError } from './api.js';
import { saveConfig } from './config.js';
import { render } from './output.js';
import * as auth from './auth.js';
import { runList, type ListResult } from './list.js';
import { uploadMedia } from './upload.js';

// Single source of truth for the version — ../package.json (resolves from both dist/ and src/).
const { version } = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8'));

const program = new Command();
program
  .name('juzpost')
  .description('Schedule clips to JuzPost from the terminal')
  .version(version)
  .option('--json', 'print raw JSON responses')
  .option('--base <url>', 'override API base url (persists to config)');

// --base is sugar for persisting baseUrl before any command runs.
program.hook('preAction', (thisCmd) => {
  const base = thisCmd.opts().base as string | undefined;
  if (base) saveConfig({ baseUrl: base });
});

const out = (data: unknown) => console.log(render(data, !!program.opts().json));

// Best-effort browser open via the native platform opener. Detached + errors ignored
// so headless/SSH sessions fall back to the printed URL instead of crashing login.
const openBrowser = (url: string) => {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  try {
    spawn(cmd, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref();
  } catch {
    // ignore — the URL is printed regardless
  }
};

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
      onPrompt: (url) => {
        openBrowser(url);
        console.log(`Opening your browser to approve… if it doesn't open, visit:\n  ${url}\n`);
      },
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

// ── posts (group: list | create | schedule) ──────────────────────────────────
const posts = program.command('posts').description('List, create, and schedule posts');

withListOpts(
  posts
    .command('list')
    .description('List posts')
    .option('--status <s>', 'filter: draft | scheduled | posted | failed')
    .option('--account-id <id>', 'filter: posts targeting this account')
    .option('--from <date>', 'filter: ISO date lower bound')
    .option('--to <date>', 'filter: ISO date upper bound'),
).action(async (opts) => printList(await runList('/api/cli/v1/posts', opts, ['status', 'accountId', 'from', 'to'])));

posts
  .command('create')
  .description('Create a draft post (optionally uploading media)')
  .option('--file <path>', 'media file to upload (presign → R2)')
  .option('--content <text>', 'post body / caption')
  .option('--title <title>', 'title')
  .option('--description <desc>', 'description')
  .option('--hashtags <tag...>', 'hashtags (no # prefix)')
  .option('--type <type>', 'text | image | video | story')
  .option('--cover-key <key>', 'R2 key of an already-uploaded cover')
  .action(async (opts) => {
    const mediaUrls = opts.file ? [await uploadMedia(opts.file)] : undefined;
    const res = await api<{ id: string }>('/api/cli/v1/posts', {
      method: 'POST',
      body: {
        content: opts.content,
        mediaUrls,
        title: opts.title,
        description: opts.description,
        hashtags: opts.hashtags,
        type: opts.type,
        coverR2Key: opts.coverKey,
      },
    });
    out(res);
  });

posts
  .command('schedule <postId>')
  .description('Schedule one draft (low-level)')
  .requiredOption('--account <id...>', 'social account id(s), 1–10')
  .option('--at <iso>', 'publish time, ISO 8601 UTC; omit = post now')
  .action(async (postId, opts) => {
    const res = await api(`/api/cli/v1/posts/${postId}/schedule`, {
      method: 'POST',
      body: { publishAt: opts.at, socialAccountIds: opts.account },
    });
    out(res);
  });

// ── schedule (the headline) ───────────────────────────────────────────────────
program
  .command('schedule')
  .description('Smart-schedule draft posts across a group at preset times')
  .requiredOption('--group <name>', 'account group (channel group) name')
  .requiredOption('--min-per-day <n>', 'minimum posts per day', (v) => parseInt(v, 10))
  .option('--post-id <id...>', 'specific draft post id(s); default = all drafts')
  .option('--start-date <date>', 'first day to schedule (ISO date); default = tomorrow')
  .option('--times <hh:mm...>', 'override workspace default times')
  .option('--dry-run', 'compute and print the plan without scheduling')
  .action(async (opts) => {
    const res = await api<{ scheduled?: unknown[]; skipped?: unknown[]; plan?: unknown }>('/api/cli/v1/schedule', {
      method: 'POST',
      body: {
        group: opts.group,
        minPerDay: opts.minPerDay,
        postIds: opts.postId,
        startDate: opts.startDate,
        times: opts.times,
        dryRun: opts.dryRun,
      },
    });
    if (program.opts().json) return out(res);
    if (opts.dryRun) console.log('DRY RUN — nothing scheduled\n');
    if (res.plan) console.log(render(res.plan, false) + '\n');
    console.log(render(res.scheduled ?? [], false));
    if (res.skipped?.length) console.log('\nSkipped:\n' + render(res.skipped, false));
  });

program.parseAsync().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`Error: ${msg}`);
  process.exitCode = e instanceof ApiError && e.status >= 400 && e.status < 500 ? 1 : 3;
});
