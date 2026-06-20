# juzpost-cli

CLI for [JuzPost](https://www.juzpost.com) — login and smart-schedule clips from the terminal.
Shells out from the ASMR clipper: `queue draft → juzpost schedule --group <name> --min-per-day <N>`.

> **Skeleton.** Command tree is wired; backend endpoints under `/api/cli/v1/*` are not built
> yet (see the prerequisite milestone in the JuzPost repo). Commands will 404 until they land.

## Setup

```bash
npm install
npm run dev -- --help     # run from source (Node 22 type-stripping via tsx)
npm test                  # config store self-check
npm run build && node dist/index.js --help
```

## Auth model

- `juzpost auth login` — browser device-code flow; stores a revocable CLI token.
  Single login method by design (no paste-token path).
- Tokens are tagged (`type=cli` + browser/device) and **revocable in JuzPost settings**
  (hard delete → next request 401). Manual API keys stay in the dashboard, unchanged.
- The CLI only talks to the **token-only** `/api/cli/v1/*` namespace.

## Commands (skeleton)

| Command | Purpose | Backend |
|---|---|---|
| `auth login` / `logout [--revoke]` / `whoami` | device-code login, identity | NEW |
| `account status` | plan + paid-tier entitlements | NEW (`/me`) |
| `accounts [--platform/--group-id]` | list connected social accounts | reuse |
| `groups [--name]` | list channel groups (account presets) | reuse |
| `workspace` | timezone + default times | reuse |
| `posts list [--status/--account-id/--from/--to]` | list posts (cursor pagination) | NEW (list route) |
| `posts create [--file/--content/--title/--hashtags…]` | upload media + create draft | NEW |
| `posts schedule <id> --account [--at]` | schedule one draft (low-level) | reuse `/posts/:id/schedule` |
| `schedule --group --min-per-day [--dry-run]` | smart-spread drafts across days | NEW + reuse `/posts/schedule` |

List commands share `--limit/--cursor/--sort/--order/--all` (cursor pagination, spec §3).

Config lives at `$XDG_CONFIG_HOME/juzpost/config.json` (`~/.config/juzpost`).
Override base url with `--base <url>` or `JUZPOST_URL`.
