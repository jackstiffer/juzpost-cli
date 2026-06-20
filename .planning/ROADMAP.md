# Roadmap: juzpost-cli

## Milestones

- 🟡 **v0.1 CLI MVP** — Phases 1–4 (planned 2026-06-20)

## Phases

<details open>
<summary>🟡 v0.1 CLI MVP (Phases 1–4) — PLANNED 2026-06-20</summary>

Build the CLI to the `docs/api-spec.md` contract. Each phase is independently unit-testable
with mocked `fetch`; end-to-end wiring waits on the JuzPost `/api/cli/v1/*` milestone.

- [x] **Phase 1: Core foundation** — finalize token/config store, `fetch` client (Bearer auth,
  query/body, error→exit-code), the cursor-pagination + table/JSON output helpers, the command
  tree (`--json`/`--base`), and packaging (`build`/`bin`/`test`). Mocked-fetch test harness.
- [x] **Phase 2: Auth** — `login` (device-code: start → poll `auth/token` with `428` pending /
  `410` expired / timeout), `logout` (+ `--revoke` → `DELETE /auth/token`), `whoami`. Token
  persistence + clear error states.
- [x] **Phase 3: Read commands** — `account status`, `accounts`, `groups`, `workspace`, `posts`
  (cursor pagination via `--limit`/`--cursor`/`--all`; filters `--status`, sort `--sort`).
  Human table output + `--json`.
- [ ] **Phase 4: Upload, create & schedule** — presign → PUT media → `posts create`; the
  headline `schedule` (`--group`, `--min-per-day`, `--dry-run`) + per-post
  `posts <id> schedule`. Renders the returned schedule plan.

</details>
