# Changelog

## 0.1.4

- `auth login` now auto-opens the browser to the approval page (still prints the
  URL as a fallback for headless/SSH sessions).
- Docs: corrected login command to `juzpost auth login` throughout the README.

## 0.1.2

- Send `contentLength` with upload presign requests — the JuzPost API now
  requires it and enforces per-content-type size limits before issuing a URL.

## 0.1.1

- Rewrote the README for discoverability: detailed usage, smart-scheduling
  explainer, use cases, FAQ, and SEO keywords (social media scheduling,
  TikTok/YouTube Shorts scheduler, content calendar, automation).
- Expanded npm `keywords`; added `homepage`.
- Parse both API error shapes (`{ error: { message } }` and `{ error: "string" }`).

## 0.1.0

- First public release.
- Commands: `login`/`logout`/`whoami`, `account status`, `accounts`, `groups`,
  `workspace`, `posts list|create|schedule`, and smart `schedule`
  (`--group`/`--min-per-day`/`--dry-run`).
- Cursor pagination, `--json` output, device-code auth, presigned media upload.
