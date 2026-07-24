# CI/CD Guide

This document describes Vault's continuous-integration and deployment pipeline:
what each workflow does, the secrets and environment variables it needs, how
releases and deployments happen, and how to troubleshoot failures.

All workflows live in [`.github/workflows/`](../.github/workflows) and every
third-party and first-party GitHub Action is **pinned to a full commit SHA**
(with a human-readable version in a trailing comment) for supply-chain safety.
[Dependabot](../.github/dependabot.yml) keeps those SHAs, npm packages, and
Cargo crates patched.

## Toolchain pinning (reproducibility)

| Tool    | Pin                        | Where                                                                                         |
| ------- | -------------------------- | --------------------------------------------------------------------------------------------- |
| Node.js | `22` (`>=22.18 <23`)       | [`.nvmrc`](../.nvmrc), `engines` in `package.json`                                            |
| npm     | `10.9.3`                   | `packageManager` in `package.json`                                                            |
| Rust    | `1.93.0` + `wasm32v1-none` | [`contracts/vault_market/rust-toolchain.toml`](../contracts/vault_market/rust-toolchain.toml) |

> Node ≥ 22.18 is required because the unit tests run TypeScript directly via
> Node's native type-stripping. Rust ≥ 1.84 is required for the `wasm32v1-none`
> target that `soroban-sdk` 25 mandates (plain `wasm32-unknown-unknown` is
> rejected by the SDK on Rust 1.82+).

## Workflows

### `ci.yml` — pull-request / push gate

Triggered on every push to `main` and every PR. Jobs run in parallel:

| Job                   | Steps                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **lint**              | `npm ci` → `format:check` (Prettier) → `lint` (ESLint) → `typecheck` (frontend `tsc`) → `typecheck:server`             |
| **test**              | `npm ci` → `npm test` (Node test runner, 30 unit tests)                                                                |
| **frontend-build**    | `npm ci` → `npm run build` → uploads `dist` artifact                                                                   |
| **contract-build**    | pinned Rust → `cargo fmt --check` → `cargo clippy -D warnings` → `cargo build --locked` (wasm) → uploads wasm artifact |
| **dependency-review** | PR-only; fails on newly introduced dependencies with High+ severity advisories                                         |

Permissions default to `contents: read`. npm and Cargo caches are enabled
(`actions/setup-node` cache + `Swatinem/rust-cache`).

### `codeql.yml` — static security analysis

CodeQL `security-extended` queries for `javascript-typescript` **and** `actions`
(the workflows themselves), on push, PR, and a weekly schedule. Needs
`security-events: write`.

### `release.yml` — tagged releases

Triggered by pushing a semver tag (`vX.Y.Z`). Rebuilds the frontend bundle and
contract wasm from the tagged commit and publishes a GitHub Release with both
assets attached and auto-generated notes. Only the publish job holds
`contents: write`; it uses the built-in `GITHUB_TOKEN` (no PAT).

```bash
git tag v1.0.0
git push origin v1.0.0
```

### `deploy.yml` — manual deployment

`workflow_dispatch` only — it never runs automatically, so a fresh clone/fork
never deploys or fails without credentials. Choose `all`, `frontend`, or
`resolver`. Any job whose secret is absent **skips gracefully** instead of
failing.

## Required secrets

Configure these under **Settings → Secrets and variables → Actions** (and, for
deploy, in the `production` environment):

| Secret              | Used by           | Purpose                       |
| ------------------- | ----------------- | ----------------------------- |
| `VERCEL_TOKEN`      | deploy (frontend) | Vercel auth token             |
| `VERCEL_ORG_ID`     | deploy (frontend) | Vercel org id                 |
| `VERCEL_PROJECT_ID` | deploy (frontend) | Vercel project id             |
| `RAILWAY_TOKEN`     | deploy (resolver) | Railway project/account token |

CI, CodeQL, and release need **no** custom secrets (only the automatic
`GITHUB_TOKEN`).

## Runtime environment variables

These are **not** CI secrets — they configure the running app/resolver and live
in `.env` (git-ignored) or in the Vercel/Railway dashboards. Full table in the
[README](../README.md#environment-variables). Summary:

- **Frontend (public, `VITE_*`):** `VITE_CONTRACT_ID`,
  `VITE_VAULT_MARKET_CONTRACT_ID`, `VITE_TREASURY_ADDRESS`.
- **Resolver (server-side):** `STELLAR_NETWORK`, `STELLAR_RPC`, `HORIZON_URL`,
  `SDEX_HORIZON_URL`, `RESOLVER_SECRET`, `RESOLVER_ADMIN_TOKEN`,
  `VAULT_MARKET_CONTRACT_ID`, `VAULT_MARKET_ID`, `VAULT_XLM_USDC_MARKET_ID`,
  `XLM_TOKEN_CONTRACT_ID`, `PORT`.

> Never prefix a secret with `VITE_` — those values are bundled into the public
> browser bundle.

## Deployment process

- **Frontend → Vercel.** `vercel.json` pins `framework: vite`,
  `buildCommand: npm run build`, `outputDirectory: dist`, a SPA rewrite for
  `/markets/*`, and hardening headers (HSTS, `X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`). Deploy via the
  `deploy` workflow or Vercel's Git integration.
- **Resolver → Railway.** `railway.json` + `nixpacks.toml` build with Node 22
  and start `npm run start:server`. Deploy via the `deploy` workflow or
  Railway's Git integration.

## Release process

1. Merge to `main` (CI must be green).
2. Bump the version, tag `vX.Y.Z`, and push the tag.
3. `release.yml` builds artifacts and publishes the GitHub Release.
4. (Optional) Run the `deploy` workflow to promote to production.

## Troubleshooting

| Symptom                                                          | Cause / fix                                                                                                                                                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci` fails with `EUSAGE`/lock mismatch                       | `package.json` and `package-lock.json` drifted. Run `npm install`, commit the updated lock.                                                                      |
| Tests fail with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`              | Runner Node < 22.18. The pins force Node 22; check `.nvmrc`/`setup-node`.                                                                                        |
| `format:check` fails                                             | Run `npm run format` locally and commit.                                                                                                                         |
| ESLint fails                                                     | Run `npm run lint:fix`; remaining errors are real. Warnings do not fail CI.                                                                                      |
| Contract build: `can't find crate for std` / `E0463`             | The `wasm32v1-none` target isn't installed for the active toolchain. CI installs it via `dtolnay/rust-toolchain`; locally run `rustup target add wasm32v1-none`. |
| Contract build: SDK rejects `wasm32-unknown-unknown`             | Build for `wasm32v1-none` (already the CI/toolchain default).                                                                                                    |
| rustc crash `STATUS_STACK_BUFFER_OVERRUN (0xc0000409)` (Windows) | rustc stack overflow compiling proc-macros. Set `RUST_MIN_STACK=536870912` (CI already does).                                                                    |
| `cargo build --locked` fails                                     | `Cargo.lock` is stale. Run `cargo update` in `contracts/vault_market`, commit the lock.                                                                          |
| Deploy job "skipped"                                             | The relevant secret (`VERCEL_TOKEN` / `RAILWAY_TOKEN`) isn't configured.                                                                                         |
