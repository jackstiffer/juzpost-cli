#!/usr/bin/env node
// JuzPost CLI — command tree mirrors the Higgsfield CLI shape (subcommand groups,
// global --json, --wait-style polling). Talks to the token-only /api/cli/v1/* namespace.
// ponytail: handlers are wired but most backend endpoints are NOT built yet — they will
// 404 until the JuzPost `/api/cli/v1/*` milestone lands. Each TODO marks the missing route.
import { Command } from 'commander';
import { api, ApiError } from './api.js';
import { saveConfig, clearToken, loadConfig } from './config.js';
import { render } from './output.js';

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

// ── auth ─────────────────────────────────────────────────────────────────────
const auth = program.command('auth').description('Login, logout, identity');

auth
  .command('login')
  .description('Browser device-code login; stores a revocable CLI token')
  .action(async () => {
    // TODO(api): POST /api/cli/v1/auth/start -> { deviceCode, verifyUrl, interval }
    //            then poll POST /api/cli/v1/auth/token { deviceCode } -> { token }
    // Single login method by design — no paste-token path. Manual tokens stay in the dashboard.
    const start = await api<{ deviceCode: string; verifyUrl: string; interval?: number }>(
      '/api/cli/v1/auth/start',
      { method: 'POST', auth: false },
    );
    console.log(`Open this URL in your browser to approve:\n  ${start.verifyUrl}\n`);
    const token = await pollForToken(start.deviceCode, start.interval ?? 3);
    saveConfig({ token });
    out('Logged in. Token stored (revoke anytime in JuzPost settings).');
  });

auth
  .command('logout')
  .description('Delete the stored token locally')
  .action(() => {
    clearToken();
    out('Logged out. (To revoke server-side, delete the token in JuzPost settings.)');
  });

auth
  .command('whoami')
  .description('Show the identity behind the stored token')
  .action(async () => {
    if (!loadConfig().token) return out('Not logged in.');
    out(await api('/api/cli/v1/me')); // TODO(api): GET /api/cli/v1/me
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

// ── accounts / workspace (reuse existing service fns behind token guard) ───────
program
  .command('accounts')
  .description('List connected social accounts')
  .action(async () => {
    out(await api('/api/cli/v1/accounts')); // reuse: GET /api/v1/accounts service fn
  });

program
  .command('workspace')
  .description('Show workspace timezone + default times')
  .action(async () => {
    out(await api('/api/cli/v1/workspace')); // reuse: GET /api/workspace service fn
  });

// ── posts ──────────────────────────────────────────────────────────────────────
program
  .command('posts')
  .description('List posts')
  .option('--status <status>', 'filter: draft | scheduled | posted')
  .option('--sort <field>', 'sort field, e.g. publishAt', 'publishAt')
  .action(async (opts) => {
    // TODO(api): GET /api/cli/v1/posts?status=&sort=  (NEW — no list route exists today)
    out(await api('/api/cli/v1/posts', { query: { status: opts.status, sort: opts.sort } }));
  });

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

async function pollForToken(deviceCode: string, intervalSec: number): Promise<string> {
  // ponytail: naive fixed-interval poll, ~5min cap. Good enough for an interactive login.
  for (let i = 0; i < Math.ceil(300 / intervalSec); i++) {
    await new Promise((r) => setTimeout(r, intervalSec * 1000));
    try {
      const r = await api<{ token: string }>('/api/cli/v1/auth/token', {
        method: 'POST',
        auth: false,
        body: { deviceCode },
      });
      if (r.token) return r.token;
    } catch (e) {
      if (e instanceof ApiError && e.status === 428) continue; // pending approval
      throw e;
    }
  }
  throw new Error('Login timed out waiting for browser approval.');
}

program.parseAsync().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`Error: ${msg}`);
  process.exitCode = e instanceof ApiError && e.status >= 400 && e.status < 500 ? 1 : 3;
});
