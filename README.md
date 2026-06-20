# juzpost-cli — Social Media Scheduling from the Terminal

[![npm version](https://img.shields.io/npm/v/juzpost-cli.svg)](https://www.npmjs.com/package/juzpost-cli)
[![npm downloads](https://img.shields.io/npm/dm/juzpost-cli.svg)](https://www.npmjs.com/package/juzpost-cli)
[![license](https://img.shields.io/npm/l/juzpost-cli.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/juzpost-cli.svg)](https://nodejs.org)

**Schedule and auto-post short-form videos to TikTok, YouTube Shorts, Instagram, and more — straight from the command line.** `juzpost-cli` is a fast, scriptable **social media scheduling** tool for creators, agencies, and developers who want to **schedule posts**, run a **content calendar**, and **cross-post** clips without ever leaving the terminal.

It's the command-line client for [JuzPost](https://www.juzpost.com) — a **social media scheduler** built for short-form video. If you've used Buffer, Hootsuite, Later, SocialBee, or Postiz and wished for a **CLI-first, automatable** workflow, this is for you.

```bash
npm install -g juzpost-cli
juzpost login
juzpost schedule --group "all-channels" --min-per-day 2
```

---

## Why juzpost-cli?

- 🖥️ **CLI-first social media scheduler** — schedule, post, and manage content from your terminal or scripts. No dashboard clicking.
- 🎯 **Smart scheduling** — pick an account group and a minimum posts-per-day, and it spreads your drafts across the best preset times in your timezone automatically.
- 🔁 **Cross-platform posting** — push one video to many accounts (TikTok, YouTube Shorts, Instagram, X) in a single command.
- 🤖 **Built for automation** — pair it with a clipping pipeline, CI, or cron to **auto-post** on a content calendar. Pipe `--json` into anything.
- 🔐 **Secure, revocable auth** — browser-based device-code login; tokens are revocable from your dashboard anytime.
- 📦 **Tiny & dependency-light** — one runtime dependency, native `fetch`, Node 18+.

A scriptable, open-source-friendly alternative to clicking around a social media management dashboard.

---

## Installation

```bash
# global (recommended — gives you the `juzpost` command)
npm install -g juzpost-cli

# or run once without installing
npx juzpost-cli --help
```

Requires **Node.js 18+** and a free [JuzPost](https://www.juzpost.com) account.

---

## Quick start

```bash
# 1. Log in (opens your browser to approve — no password, no API key to paste)
juzpost login

# 2. See your connected accounts, groups, and workspace
juzpost accounts
juzpost groups
juzpost workspace

# 3. Create a draft from a video file
juzpost posts create --file ./clip.mp4 \
  --title "ASMR rain sounds for deep sleep 🌧️" \
  --hashtags asmr sleep rain relaxing satisfying

# 4. Smart-schedule every draft across a group at 2 posts/day
juzpost schedule --group "all-channels" --min-per-day 2

# Preview the plan first, schedule nothing:
juzpost schedule --group "all-channels" --min-per-day 2 --dry-run
```

---

## Commands

| Command | What it does |
|---|---|
| `juzpost login` / `logout` / `whoami` | Device-code login, sign out, show identity |
| `juzpost account status` | Plan + entitlements |
| `juzpost accounts [--platform --group-id]` | List connected social accounts |
| `juzpost groups [--name]` | List channel groups (account presets) |
| `juzpost workspace` | Timezone + default posting times |
| `juzpost posts list [--status --from --to]` | List posts (drafts, scheduled, posted) |
| `juzpost posts create [--file --title --hashtags …]` | Upload media + create a draft |
| `juzpost posts schedule <id> --account <id…> [--at]` | Schedule one post |
| `juzpost schedule --group --min-per-day [--dry-run]` | **Smart-schedule** drafts across a group |

Every list command supports cursor pagination (`--limit`, `--cursor`, `--all`), sorting (`--sort`, `--order`), and `--json` for scripting.

```bash
juzpost posts list --status scheduled --json | jq '.data[].title'
```

---

## How smart scheduling works

The headline `juzpost schedule` command turns a pile of drafts into a posting **content calendar** automatically:

1. **Resolve a group** → the social accounts you want to post to.
2. **Read your timezone + preset times** from your workspace settings.
3. **Spread the drafts across days** to hit your `--min-per-day` cadence, picking the best preset slots (DST-aware) and skipping any time already in the past.
4. **Schedule each post** to every account in the group.

```bash
# 10 drafts, 3 per day, starting tomorrow, only on these times:
juzpost schedule --group "shorts" --min-per-day 3 --times 09:30 14:00 19:00
```

---

## Use cases

- **Creators** — batch a week of TikToks and YouTube Shorts in one command.
- **Clipping pages & agencies** — auto-post clips on a fixed cadence across many accounts.
- **Repurposing pipelines** — wire it after a VOD-to-shorts step to schedule the output (`--json` makes it pipe-friendly).
- **Developers** — script your social media scheduling in CI, cron, or a Makefile instead of a SaaS dashboard.

---

## Configuration

- Auth token is stored at `~/.config/juzpost/config.json` (mode `0600`, never logged).
- Override the API base URL with `--base <url>` or the `JUZPOST_URL` env var.
- Revoke a CLI token anytime from your JuzPost dashboard settings (hard delete → instant 401).

---

## FAQ

**How do I schedule social media posts from the terminal?**
Install `juzpost-cli`, run `juzpost login`, create drafts with `juzpost posts create`, then `juzpost schedule --group <name> --min-per-day <n>`.

**Which platforms are supported?**
Short-form video destinations connected to your JuzPost workspace — TikTok, YouTube Shorts, Instagram, and X.

**Is it free / open source?**
The CLI is MIT-licensed and open source. It connects to your JuzPost account.

**Can I automate posting (auto-post / cron)?**
Yes — it's built for it. Use it in scripts, CI, or cron; `--json` output and exit codes make it automation-friendly.

**How is this different from Buffer / Hootsuite / Later?**
Those are dashboard-first. `juzpost-cli` is CLI-first and scriptable — designed for terminal workflows and automation around short-form video.

---

## Status

`v0.1.x` — early release. The command surface is stable and built to the JuzPost API. See [JuzPost](https://www.juzpost.com) for account setup and API details.

## License

[MIT](./LICENSE) © Jiiva Durai

---

<sub>**Keywords:** social media scheduling · social media scheduler · schedule social media posts · TikTok scheduler · YouTube Shorts scheduler · Instagram scheduler · auto-post · content calendar · cross-platform posting · bulk scheduling · social media automation · CLI social media scheduler · open source scheduler · Buffer alternative · Hootsuite alternative · Postiz alternative · short-form video scheduler.</sub>
