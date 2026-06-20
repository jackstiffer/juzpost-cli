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
| `auth login` / `logout` / `whoami` | device-code login, identity | NEW |
| `account status` | plan + paid-tier entitlements | NEW (`/me`) |
| `accounts` | list connected social accounts | reuse |
| `workspace` | timezone + default times | reuse |
| `posts --status --sort` | list posts | NEW (list route) |
| `schedule --group --min-per-day` | spread drafts across days | NEW + reuse `/posts/schedule` |

Config lives at `$XDG_CONFIG_HOME/juzpost/config.json` (`~/.config/juzpost`).
Override base url with `--base <url>` or `JUZPOST_URL`.
