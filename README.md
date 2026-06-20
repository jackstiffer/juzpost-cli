# juzpost-cli, social media scheduling from the terminal

[![npm version](https://img.shields.io/npm/v/juzpost-cli.svg)](https://www.npmjs.com/package/juzpost-cli)
[![npm downloads](https://img.shields.io/npm/dm/juzpost-cli.svg)](https://www.npmjs.com/package/juzpost-cli)
[![license](https://img.shields.io/npm/l/juzpost-cli.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/juzpost-cli.svg)](https://nodejs.org)

Schedule and auto-post short-form videos to TikTok, YouTube Shorts, Instagram, and X from the command line. `juzpost-cli` is a scriptable social media scheduler for creators, agencies, and developers who want to schedule posts, run a content calendar, and cross-post clips without leaving the terminal.

It's the command-line client for [JuzPost](https://www.juzpost.com), a social media scheduler built for short-form video. If you've used Buffer, Hootsuite, Later, SocialBee, or Postiz and wanted a CLI-first workflow you can automate, this is built for that.

```bash
npm install -g juzpost-cli
juzpost login
juzpost schedule --group "all-channels" --min-per-day 2
```

---

## Why juzpost-cli

- **Runs from your terminal.** Schedule, post, and manage social content with commands or scripts. No dashboard to click through.
- **Schedules automatically.** Pick an account group and a minimum number of posts per day, and it spreads your drafts across the best preset times for your timezone.
- **Posts to many accounts at once.** Push one video to TikTok, YouTube Shorts, Instagram, and X in a single command.
- **Fits into automation.** Run it from cron, CI, or a clipping pipeline to post on a content calendar. Pipe `--json` output into whatever you want.
- **Secure, revocable login.** Browser-based device-code auth. Tokens stay revocable from your dashboard whenever you need.
- **Small footprint.** One runtime dependency, native `fetch`, Node 18 or newer.

---

## Installation

```bash
# global install, gives you the juzpost command
npm install -g juzpost-cli

# or run once without installing
npx juzpost-cli --help
```

You need Node.js 18 or newer and a free [JuzPost](https://www.juzpost.com) account.

---

## Quick start

```bash
# 1. Log in. This opens your browser to approve. No password or API key to paste.
juzpost login

# 2. See your connected accounts, groups, and workspace
juzpost accounts
juzpost groups
juzpost workspace

# 3. Create a draft from a video file
juzpost posts create --file ./clip.mp4 \
  --title "ASMR rain sounds for deep sleep" \
  --hashtags asmr sleep rain relaxing satisfying

# 4. Smart-schedule every draft across a group at 2 posts per day
juzpost schedule --group "all-channels" --min-per-day 2

# Preview the plan first and schedule nothing
juzpost schedule --group "all-channels" --min-per-day 2 --dry-run
```

---

## Commands

| Command | What it does |
|---|---|
| `juzpost login` / `logout` / `whoami` | Device-code login, sign out, show identity |
| `juzpost account status` | Plan and entitlements |
| `juzpost accounts [--platform --group-id]` | List connected social accounts |
| `juzpost groups [--name]` | List channel groups (account presets) |
| `juzpost workspace` | Timezone and default posting times |
| `juzpost posts list [--status --from --to]` | List posts (drafts, scheduled, posted) |
| `juzpost posts create [--file --title --hashtags …]` | Upload media and create a draft |
| `juzpost posts schedule <id> --account <id…> [--at]` | Schedule one post |
| `juzpost schedule --group --min-per-day [--dry-run]` | Smart-schedule drafts across a group |

Every list command supports cursor pagination (`--limit`, `--cursor`, `--all`), sorting (`--sort`, `--order`), and `--json` for scripting.

```bash
juzpost posts list --status scheduled --json | jq '.data[].title'
```

---

## How smart scheduling works

The `juzpost schedule` command turns a pile of drafts into a posting calendar. It works in four steps.

1. Resolve a group into the social accounts you want to post to.
2. Read your timezone and preset times from your workspace settings.
3. Spread the drafts across days to hit your `--min-per-day` cadence. It picks the best preset slots, stays DST-aware, and skips any time already in the past.
4. Schedule each post to every account in the group.

```bash
# 10 drafts, 3 per day, starting tomorrow, only on these times
juzpost schedule --group "shorts" --min-per-day 3 --times 09:30 14:00 19:00
```

---

## Use cases

- **Creators.** Batch a week of TikToks and YouTube Shorts in one command.
- **Clipping pages and agencies.** Auto-post clips on a fixed cadence across many accounts.
- **Repurposing pipelines.** Wire it after a VOD-to-shorts step to schedule the output. The `--json` flag makes it pipe-friendly.
- **Developers.** Script your posting in CI, cron, or a Makefile instead of a SaaS dashboard.

---

## Configuration

- **Token storage.** Your auth token is stored at `~/.config/juzpost/config.json` with mode `0600`. It is never logged.
- **Custom API URL.** Override the base URL with `--base <url>` or the `JUZPOST_URL` environment variable.
- **Revoke anytime.** Remove a CLI token from your JuzPost dashboard settings. A hard delete returns an instant 401.

---

## FAQ

**How do I schedule social media posts from the terminal?**
Install `juzpost-cli`, run `juzpost login`, create drafts with `juzpost posts create`, then run `juzpost schedule --group <name> --min-per-day <n>`.

**Which platforms are supported?**
Short-form video destinations connected to your JuzPost workspace. That covers TikTok, YouTube Shorts, Instagram, and X.

**Is it free and open source?**
The CLI is MIT-licensed and open source. It connects to your JuzPost account.

**Can I automate posting with cron?**
Yes. Use it in scripts, CI, or cron. The `--json` output and exit codes make it automation-friendly.

**How is this different from Buffer, Hootsuite, or Later?**
Those tools are dashboard-first. `juzpost-cli` is CLI-first and scriptable, built for terminal workflows and automation around short-form video.

---

## Status

`v0.1.x` is an early release. The command surface is stable and built against the JuzPost API. See [JuzPost](https://www.juzpost.com) for account setup and API details.

## License

[MIT](./LICENSE) © Jiiva Durai
