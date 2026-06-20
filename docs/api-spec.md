# JuzPost CLI API — `/api/cli/v1/*`

End-to-end contract for the **token-only** namespace the `juzpost` CLI talks to.
Implemented in the JuzPost Next.js app; reuses existing service functions behind a
token guard. **Draft status: for review** — see [Open questions](#open-questions).

- **Base URL:** `https://www.juzpost.com` (override: `--base` / `JUZPOST_URL`)
- **Namespace:** `/api/cli/v1` (versioned; breaking changes → `/v2`)
- **Auth:** `Authorization: Bearer <token>` on every route except `auth/start` + `auth/token`
- **Encoding:** request/response `application/json; charset=utf-8` (files go to R2, not through the API — see [File uploads](#file-uploads))

---

## 1. Auth model

The CLI authenticates with a **revocable login token** minted by a browser device-code
flow. Tokens are rows in JuzPost's existing `api_keys` table (bcrypt-hashed, prefix-indexed),
tagged `type='cli'` + device info, and **revocable by hard-delete in dashboard settings**.
There is **no paste-token path** — `juzpost login` is the only way in.

### Header
```
Authorization: Bearer jp_live_8f3c…          # the 32-char raw token
```
- Verified per-request via `verifyApiKey` (`lib/auth/api-key.ts`): prefix lookup → bcrypt compare → `{ userId, workspaceId }`.
- Scope (workspace) is always resolved **from the token**, never from the request body.
- Missing/invalid/revoked → `401`. Token grants **only** `/api/cli/v1/*` (the existing `/api/v1/*` routes become session-only).

### Token lifecycle
| Event | Mechanism |
|---|---|
| Mint | device-code flow (§3) → new `api_keys` row, `type='cli'`, `deviceInfo=<user-agent>` |
| Use | `Authorization: Bearer`; `lastUsedAt` updated fire-and-forget |
| Revoke | hard `DELETE` of the row in dashboard settings → next request `401` |
| Local logout | `juzpost auth logout` clears the local file only (server row untouched unless `--revoke`) |

---

## 2. Conventions

### Error envelope
All non-2xx responses:
```json
{ "error": { "code": "forbidden", "message": "Plan does not include scheduling.", "details": {} } }
```
| HTTP | `code` | When |
|---|---|---|
| 400 | `bad_request` | malformed body / failed validation (`details` = zod issues) |
| 401 | `unauthorized` | missing/invalid/revoked token |
| 402 | `payment_required` | entitlement gate failed (plan lacks `schedule`/`publish`/`api`) |
| 403 | `forbidden` | token valid but not allowed for this resource |
| 404 | `not_found` | resource missing or not in caller's workspace (no cross-tenant leak) |
| 409 | `conflict` | state race (e.g. post already scheduled) |
| 422 | `unprocessable` | semantically invalid (e.g. `minPerDay` > available preset slots) |
| 428 | `pending` | device-code not yet approved (poll again) |
| 429 | `rate_limited` | back off; `Retry-After` header set |
| 500 | `internal` | unexpected |

### Types
- **Timestamps:** ISO 8601 UTC, e.g. `2026-06-21T18:30:00.000Z`.
- **IDs:** string UUIDv4.
- **Money/credits:** n/a here.
- **Success envelope:** single resources return the object directly; collections return a [paginated envelope](#3-pagination-sorting-filtering).

---

## 3. Pagination, sorting, filtering

List endpoints use **cursor (keyset) pagination** — stable under concurrent inserts and
no deep-offset table scan.

### Query params (shared)
| Param | Type | Default | Notes |
|---|---|---|---|
| `limit` | int | `20` | 1–100; clamped, not rejected |
| `cursor` | string | — | opaque token from the previous response's `nextCursor`; omit for the first page |
| `sort` | string | per-endpoint | must be in the endpoint's sortable-field whitelist |
| `order` | `asc`\|`desc` | `desc` | |
| _filters_ | — | — | endpoint-specific (documented per route) |

### Response envelope
```json
{
  "data": [ /* array of resources */ ],
  "pagination": { "limit": 20, "nextCursor": "eyJzIjoiMjAyNi0wNi0yMSIsImlkIjoicG9zdF8xMiJ9", "hasMore": true }
}
```
- `nextCursor` is `null` when `hasMore` is `false`. Pass it back **verbatim** — it's opaque
  (base64 of the last row's `{ sortValue, id }`); do not parse or construct it client-side.
- Keyset needs a stable tiebreaker: **every sort appends `id` as the final key** internally,
  so `(sortValue, id)` is unique even when `sortValue` ties.
- Changing `sort`/`order`/filters invalidates a cursor → `400 bad_request` (`code: "invalid_cursor"`).
- No `total` (cursor pagination omits it by design; counting defeats the point). A separate
  `count` field can be added per-endpoint later if a use case needs it.
- Invalid `sort` field → `400`.

---

## 4. File uploads

Files (clip `.mp4`, optional cover image) **never transit the JSON API** — they go
straight to R2 via a presigned URL. Three steps:

```
1. POST /api/cli/v1/storage/presign   → { signedUrl, resolvedKey }
2. PUT  <signedUrl>  (raw bytes, Content-Type, NO auth header)   → 200
3. reference `resolvedKey` as mediaUrls[] / coverR2Key when creating the post
```
- Keys are forced under `uploads/{workspaceId}/…` server-side (IDOR guard); `..` rejected.
- Presigned URL default TTL 900s (15 min). Large clips: allow up to 120s PUT timeout client-side.

### Security model (presign) — how it's locked

Two separate things; only the first is reachable without credentials:

**The presign endpoint is auth-gated.** No valid token → `401`. The target key is forced to
`uploads/{workspaceId}/…` with `workspaceId` taken from the **verified token, never the body**
(`T-09-19`), plus charset whitelist + `..` reject (`403`). → **no cross-tenant IDOR**: your
token can never presign into another workspace's space.

**The returned signed URL *is* a bearer capability** — by design (S3/R2 SigV4). Whoever holds
that exact URL within its TTL can PUT to that **one key**; the PUT carries no auth header, the
signature is the auth. But the grant is deliberately narrow:

| Property | Bound to |
|---|---|
| Object | exactly one key (`uploads/{ws}/…/clip_NN.mp4`) |
| Operation | PUT upload only — cannot read, list, or delete |
| Content-Type | pinned in the signature (`PutObjectCommand` ContentType) |
| Lifetime | TTL (default 900s, recommend 300s for CLI) |
| Escalation | none — not other keys, not other workspaces |

So a leaked URL = "overwrite that one object for a few minutes," nothing more. Signed URLs are
never logged (`T-09-17`/`T-09-12`); HTTPS only.

**Residual gap + hardening (recommended):** the signer pins Content-Type but **not
Content-Length** — a URL holder could upload an oversized/garbage object to that key.
- **HARDEN-1:** pin a `content-length-range` (presigned POST policy) or enforce an R2 max object size.
- **HARDEN-2:** post-upload server-side validation — `HEAD` the object (size + content-type) before the key may be referenced by a post.
- **HARDEN-3:** shorten default TTL to 300s for CLI presigns.
- Note: same-key overwrite is **intentional** for the clipper (idempotent re-runs, keys namespaced by `video_id`) — not treated as a vuln, but it means a compromised *workspace* token could overwrite its own media. Revoke (delete the token) is the kill switch.

### Abuse & quota — CHOSEN MODEL: presign + DB upload registry + sweep (Option B)

Distinct from a leaked URL: a **legitimate paying token** can call presign unlimited times and
PUT 1000 files, using R2 as a free bucket. Today this is unmetered, unlimited, invisible (no
usage tracking, rate limit, or cleanup). **Tag-based lifecycle was ruled out** — R2 has no
object tags (`PutObjectTagging` unimplemented) and lifecycle filters by **prefix only**. Chosen
control = a **DB upload registry** (the truest form of "TTL, then clear on post" — a sweep
replaces R2's missing per-object TTL; no byte-copy, no dual-storage cost).

**Storage-wide, source-agnostic.** The registry is a property of **R2 writes, not the CLI
namespace** — it covers **web/dashboard uploads, CLI uploads, and server-side `uploadToR2`**
alike. Quota is per-workspace, so partial coverage = trivially bypassed (upload via the web
instead); web uploads orphan exactly like CLI ones. Instrumentation lives in the **shared
storage layer**, so STORE-1 also touches the existing browser `/api/v1/storage/presign` flow.

**`uploads` table (new):** `{ id, workspaceId, key, byteSize, contentType, source, createdAt, claimedAt, postId }`
— `source ∈ {cli, web, server}` for observability only; accounting/sweep/quota are workspace-wide, source-agnostic.

1. **STORE-1 — Register on every write.** Each presign (browser **and** CLI) and each
   server-side `uploadToR2` inserts an `uploads` row (`claimedAt=null`). Direct-to-R2 PUT stays
   as-is (no staging prefix, no copy).
2. **STORE-2 — Validate + account.** After PUT, server `HEAD`s the object (HARDEN-2): record
   real `byteSize`/`contentType`; reject oversized/garbage. Sum of `byteSize` per workspace = usage.
3. **STORE-3 — Claim on use.** When a post references the key (create/schedule), set
   `claimedAt` + `postId`. Claimed objects persist.
4. **STORE-4 — Sweep orphans.** Cron deletes the R2 object + row where `claimedAt IS NULL AND
   createdAt < now − N h` (N≈24–48). Hoarding can't survive the window.
5. **STORE-5 — Rate-limit presign** per token/workspace (e.g. 20/min, 500/day) → `429` + `Retry-After`.
6. **STORE-6 — Quota.** Workspace usage (STORE-2 sum) vs a `storageBytes` cap added to the plan
   `caps` (`lib/plans`); over quota → `402`. **The registry sum is the detection/alert signal.**

> Deferred (later, ~90% case): auto-delete *claimed* storage after 30 days. The registry's
> `createdAt`/`claimedAt` already carry the data for that sweep when implemented.
> See [Open questions](#open-questions) #7.

---

## 5. Endpoints

### 5.1 Auth & identity

#### `POST /api/cli/v1/auth/start`  · _no auth_
Begin device-code login.
```jsonc
// request
{ "deviceName": "jiiva-macbook"  /* optional label; server also records User-Agent */ }
// 200
{
  "deviceCode": "dc_3f…",        // secret, CLI keeps it to poll
  "userCode": "WXYZ-1234",       // shown to user, typed/confirmed in browser
  "verifyUrl": "https://www.juzpost.com/cli/approve?code=WXYZ-1234",
  "expiresIn": 600,              // seconds
  "interval": 3                  // min seconds between polls
}
```

#### `POST /api/cli/v1/auth/token`  · _no auth_
Poll until the user approves in the browser.
```jsonc
// request
{ "deviceCode": "dc_3f…" }
// 200 (approved — token returned ONCE)
{ "token": "jp_live_8f3c…", "tokenPrefix": "jp_live_", "type": "cli" }
// 428 pending  | 410 gone (expired)  | 429 rate_limited (slow down)
```

#### Browser approval page (dashboard, session-auth) — _not in this namespace, but required_
`GET /cli/approve?code=WXYZ-1234` → user (logged in) confirms device + label →
mints the `api_keys` row (`type='cli'`, `deviceInfo`) and marks the device code approved.

#### `GET /api/cli/v1/me`
Identity, workspace, plan, entitlements, and the calling token's metadata.
```jsonc
// 200
{
  "user": { "id": "u_…", "email": "jack@…" },
  "workspace": { "id": "w_…", "name": "DeeVee", "timezone": "America/New_York", "defaultTimes": ["09:30","14:00","18:00"] },
  "plan": { "name": "max", "status": "active" },
  "entitlements": { "api": true, "schedule": true, "publish": true },
  "token": { "prefix": "jp_live_", "type": "cli", "createdAt": "…", "lastUsedAt": "…" }
}
```

#### `DELETE /api/cli/v1/auth/token`  _(optional — self-revoke)_
Deletes the calling token's own row. Powers `juzpost auth logout --revoke`. → `204`.

---

### 5.2 Workspace

#### `GET /api/cli/v1/workspace`
The token's workspace (single object — token is workspace-scoped). Reuses `/api/workspace` service fn.
```jsonc
{ "id": "w_…", "name": "DeeVee", "timezone": "America/New_York", "defaultTimes": ["09:30","14:00","18:00"] }
```

---

### 5.3 Accounts

#### `GET /api/cli/v1/accounts`  · _list_
Connected social accounts. Reuses `GET /api/v1/accounts` service fn. **Tokens never serialized.**

| Filter | Type | Notes |
|---|---|---|
| `platform` | `tiktok`\|`youtube`\|`instagram`\|`x` | exact |
| `groupId` | uuid | only accounts in this channel group |

Sortable: `name`, `platform`, `connectedAt`.
```jsonc
// data[] element
{ "id": "sa_…", "name": "asmr.clips", "platform": "tiktok", "avatarUrl": "https://…", "metadata": {} }
```

---

### 5.4 Channel groups (account presets)

#### `GET /api/cli/v1/groups`  · _list_
Named account presets. Reuses `lib/dashboard/preset-queries.ts`. Resolves `--group <name>` for scheduling.

| Filter | Type | Notes |
|---|---|---|
| `name` | string | case-insensitive contains |

Sortable: `name`, `createdAt`.
```jsonc
// data[] element
{ "id": "cg_…", "name": "all-tiktok", "accountCount": 3, "accountIds": ["sa_a","sa_b","sa_c"], "createdAt": "…" }
```

#### `GET /api/cli/v1/groups/:id`
Single group with full member list. → `404` if not in workspace.

---

### 5.5 Storage

#### `POST /api/cli/v1/storage/presign`
Reuses `POST /api/v1/storage/presign`.
```jsonc
// request
{ "relativeKey": "clips/{videoId}/clip_03.mp4", "contentType": "video/mp4", "operation": "upload", "expiresInSeconds": 900 }
// 200
{ "signedUrl": "https://r2…/signed?…", "resolvedKey": "uploads/{workspaceId}/clips/{videoId}/clip_03.mp4", "expiresIn": 900 }
```
`operation: "download"` presigns a GET for an existing key (e.g. to inspect a media file).

---

### 5.6 Posts

#### `POST /api/cli/v1/posts`  · _create draft_
Reuses the queue service (draft only — **no `scheduledFor` here**, scheduling is a separate call).
```jsonc
// request
{
  "content": "🎧 …",                       // ≤2200 chars
  "mediaUrls": ["uploads/{ws}/clips/…/clip_03.mp4"],  // R2 resolvedKeys
  "type": "video",                          // text|image|video|story (default video)
  "title": "ASMR ear tapping for sleep",
  "description": "…\n🎥 Credit: …",
  "hashtags": ["asmr","sleep","tapping","tingles","relaxing","satisfying"],
  "coverR2Key": "uploads/{ws}/covers/…png", // optional
  "coverTimestampMs": 1840                   // optional
}
// 201
{ "id": "post_…" }
```

#### `GET /api/cli/v1/posts`  · _list_
| Filter | Type | Notes |
|---|---|---|
| `status` | `draft`\|`scheduled`\|`posted`\|`failed` | exact |
| `accountId` | uuid | posts targeting this account |
| `from` / `to` | ISO date | range over `publishAt` (scheduled) or `createdAt` |

Sortable: `createdAt`, `updatedAt`, `publishAt`.
```jsonc
// data[] element
{ "id":"post_…","status":"scheduled","title":"…","content":"…","mediaUrls":["…"],
  "publishAt":"2026-06-21T18:30:00.000Z","socialAccountIds":["sa_a"],"createdAt":"…" }
```

#### `GET /api/cli/v1/posts/:id`
Full post incl. `metadata`, `coverR2Key`, per-account `postPlatforms`. → `404` if cross-workspace.

#### `PATCH /api/cli/v1/posts/:id`  · _update draft_
Reuses PATCH queue. All fields optional; `mediaUrls: null` clears media. Draft-only (409 if already scheduled).

#### `DELETE /api/cli/v1/posts/:id`  _(optional)_
Delete a draft → `204`. 409 if scheduled/posted.

---

### 5.7 Schedule

#### `POST /api/cli/v1/posts/:id/schedule`  · _low-level, one post_
Thin pass-through to the existing `POST /api/v1/posts/schedule` service (full parity).
```jsonc
// request
{
  "publishAt": "2026-06-21T18:30:00.000Z",   // omit = "post now"
  "socialAccountIds": ["sa_a","sa_b"],        // 1–10, deduped
  "platformOverrides": { "sa_a": { "title": "…", "hashtags": ["…"] } },   // optional
  "publishAtOverrides": { "sa_b": "2026-06-21T19:00:00.000Z" },           // optional, ≥5m future
  "tiktokSettings": { "sa_a": { "deliveryMode": "direct_post", "privacyLevel": "PUBLIC_TO_EVERYONE" } } // optional
}
// 200
{ "success": true, "results": [ { "socialAccountId":"sa_a","status":"scheduled" }, … ] }
```
Gated: `schedule` (future) or `publish` (now) + `api` entitlement → `402` if missing.
Validation: `publishAt` ≥5m and ≤~6mo future; CAS `draft→scheduled` → `409` on race.

#### `POST /api/cli/v1/schedule`  · _smart-schedule (the headline)_
Resolves a group, reads workspace tz + presets, spreads drafts across days, schedules each.
```jsonc
// request
{
  "group": "all-tiktok",        // OR "socialAccountIds": ["sa_a",…]
  "minPerDay": 2,
  "postIds": ["post_1","post_2","…"],   // optional; default = all current drafts in workspace
  "startDate": "2026-06-21",            // optional; default = tomorrow (workspace tz)
  "times": ["09:30","18:00"],           // optional; default = workspace.defaultTimes
  "dryRun": false                       // true = return the plan, schedule nothing
}
// 200
{
  "scheduled": [
    { "postId":"post_1","publishAt":"2026-06-21T13:30:00.000Z","accountIds":["sa_a","sa_b"],"status":"scheduled" },
    { "postId":"post_2","publishAt":"2026-06-21T22:00:00.000Z","accountIds":["sa_a","sa_b"],"status":"scheduled" }
  ],
  "skipped": [ { "postId":"post_9","reason":"not a draft" } ],
  "plan": { "timezone":"America/New_York","perDay":2,"days":2,"slotsUsed":["09:30","18:00"] }
}
```

**Spreading algorithm (server-side):**
1. Resolve `group` → `accountIds` (or use provided `socialAccountIds`); read `workspace.timezone` + `times` (default `defaultTimes`).
2. Order `postIds` (drafts only; non-drafts → `skipped`).
3. Walk days from `startDate`; per day assign up to `len(times)` posts at those **wall-clock** times in the workspace tz, converted to UTC. Enforce ≥ `minPerDay`/day; drop any slot already in the past (or <5m out).
4. Each post → **all** resolved `accountIds` (cross-post). Call the per-post schedule service for each.
5. **422** if `minPerDay > len(times)` (not enough preset slots — message: "add default times or lower min-per-day").
6. `dryRun:true` → compute + return `plan`/`scheduled` shape but **persist nothing**.

> Best-time = round-robin the preset `times` (workspace `defaultTimes`). No analytics — see
> the deferred data-driven-best-time seed in the clipper planning.

---

## 6. Entitlement gating

Wrap `lib/entitlements/gate.ts` in a CLI-friendly check. Every mutating call asserts the
`api` capability; schedule/publish additionally assert `schedule`/`publish`. Failure → `402`
with `details.required` listing the missing capability. `GET /me` surfaces the flags so the
CLI can fail fast before a doomed schedule call.

---

## 7. Idempotency

- `schedule` is idempotent server-side (deterministic Cloudflare Workflow id + create-batch dedup) — safe to retry.
- Optional `Idempotency-Key: <uuid>` header on `POST /posts` and `POST /schedule` to dedupe accidental double-submits (store key→result for 24h).

---

## 8. Schema & UI changes (JuzPost repo)

1. **`api_keys` migration:** add `type TEXT NOT NULL DEFAULT 'manual'` (`'cli'|'manual'`),
   `device_info TEXT` (user-agent), `name TEXT NULL`. Backfill existing → `'manual'`.
2. **Settings UI:** the keys card lists `type` chip + `device_info` + `lastUsedAt`; revoke = delete (existing).
3. **`/cli/approve` page:** session-auth confirm screen for the device-code flow.
4. **De-dual-auth:** strip `verifyApiKey` from the 4 existing `/api/v1/*` routes → session-only.

---

## Open questions
1. **Device-code vs. simpler:** confirm browser device-code (vs. e.g. a one-time `/cli/approve` that emits the token directly). Assumed device-code.
2. **Cross-post vs. per-account spread:** smart-schedule currently sends each post to **all** group accounts at one time. Alternative: distribute *different* posts to *different* accounts. Confirm.
3. **`minPerDay > slots`:** hard `422`, or auto-generate extra evenly-spaced times? Assumed `422`.
4. **Token expiry:** CLI tokens non-expiring (revoke-only), or TTL (e.g. 90d)? Assumed non-expiring.
5. **Self-revoke endpoint:** include `DELETE /auth/token`, or dashboard-only? Assumed included (optional).
6. **Media cleanup:** does deleting a draft delete its R2 objects? (existing queue PATCH already deletes stale covers.)
7. **Storage controls — RESOLVED → Option B** (presign + `uploads` registry + sweep + rate-limit + quota; tag-based ruled out, no copy/dual-storage). Remaining sub-decisions: sweep age `N` (24 vs 48h); v1 scope = registry + sweep + rate-limit now, quota cap (STORE-6) now or later; the 30-day claimed-deletion sweep is explicitly deferred.
