# Project: juzpost-cli

## What This Is

A standalone Node/TypeScript CLI that drives [JuzPost](https://www.juzpost.com) from the
terminal. It is the headless companion to the ASMR clipper: after the clipper cuts a vertical
clip, the CLI logs in, uploads media, creates a draft, and **smart-schedules** it across an
account group — `queue draft → juzpost schedule --group <name> --min-per-day <N>`.

It is a **thin HTTP client** over JuzPost's **token-only `/api/cli/v1/*`** namespace (auth by a
revocable device-code login token). The command structure mirrors the Higgsfield CLI
(subcommand groups, `--json`, polling). No business logic lives here that the server owns —
scheduling math, entitlement checks, and storage accounting are server-side.

**Runtime:** Node ≥22 (native TS type-stripping; `tsx` for dev, `tsc` for build).
**Deps:** `commander` only (HTTP via native `fetch`, token store via `node:fs`).

## Core Value

One command turns a finished clip into a scheduled, multi-account post — no dashboard clicks,
no manual timing. The CLI is the automation surface; the dashboard remains for review/edits.

## Contract

The API contract is fully specified in **`docs/api-spec.md`** (cursor pagination, presign +
storage registry, device-code auth, smart-schedule algorithm). The CLI is built **to that
spec**; the JuzPost-side `/api/cli/v1/*` endpoints are a **separate prerequisite** in the
JuzPost repo (`.planning/todos/pending/cli-api-v1-namespace.md` there) and do not exist yet.

> **Build/test strategy:** the CLI is built and unit-tested against the contract with **mocked
> `fetch`** (no live backend). End-to-end wiring waits on the JuzPost API milestone.

## Constraints
- $0 tooling; mirror the clipper's CLI-first, inspectable ethos.
- Token is a secret at rest (config file `0600`); never logged.
- Single login method (device-code); manual API tokens stay in the dashboard, unused by the CLI.
