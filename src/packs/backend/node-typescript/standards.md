## TypeScript / Node conventions

- Node **22 LTS** unless documented otherwise. Avoid 20 in new projects; 22 has stable native `node:test`, `--watch`, and `fetch`.
- TypeScript **5.7+**. `strict: true` in tsconfig, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `noImplicitOverride` for new projects.
- **Warnings as errors**: `eslint . --max-warnings 0` in CI — any lint warning fails the build. `tsc --noEmit` runs in CI; `tsc` always fails on type errors. `eslint-disable` comments require a `// reason:` justification and an issue link.
- No `any` without an inline `// reason:` comment. Prefer `unknown` and narrow.
- Prefer `type` for unions and DTOs, `interface` for object contracts that may be extended.
- Async functions: explicit return type `Promise<T>`. No floating promises (`@typescript-eslint/no-floating-promises`).
- ESM only — `"type": "module"` in package.json. Use `.js` import suffixes under bundler resolution.
- `pnpm` for dependency management. Lockfile (`pnpm-lock.yaml`) committed.

## Modern TypeScript idioms

- **`using` / `await using` declarations** for resource cleanup (TS 5.2+):
  ```ts
  async function run() {
    await using db = await openDb();
    // db.dispose() runs automatically on scope exit
  }
  ```
- **`satisfies` operator** to check a value conforms to a type without widening it:
  ```ts
  const config = { host: "localhost", port: 5432 } satisfies DbConfig;
  ```
- **`const` type parameters** for inference of literal tuples/objects (TS 5.0+).
- **`Awaited<T>`** utility type to unwrap promise types correctly.

## Error handling

- Don't throw plain strings. Use `Error` subclasses with named types.
- Result-style returns (`{ ok: true, value } | { ok: false, error }`) preferred for expected failures over exceptions.
- At HTTP boundaries, map errors to typed responses. Don't expose stack traces.

## Async

- Avoid `async` functions that don't actually await — promote them to sync.
- `Promise.allSettled` when you genuinely need partial-success semantics; otherwise `Promise.all`.
- `AbortController` / `AbortSignal` for cancellation — pass through every async API.

## Testing

- **vitest** is the default. One test file per module, co-located (`foo.ts` ↔ `foo.test.ts`) for fast jumps.
- Integration tests use real services via Testcontainers — no mocks for systems you own the contract of.
- Snapshot tests with `toMatchInlineSnapshot` for stable serializations.

## File size and structure

- One exported symbol per file when feasible.
- Aim for < 200 lines per module. Split by responsibility.
- Prefer barrel files (`index.ts`) ONLY at package boundaries, never inside a package.

## Recommended packages

> _Last refreshed: 2026-05-18. **Advisory, not mandatory** — pick based on actual need, document the choice in `design.md`. Re-vet with `/devspec:refresh-standards backend/node-typescript`._

| Category | Primary pick | Alternative | Notes |
|---|---|---|---|
| Schema validation | **zod** | valibot | zod is the de-facto standard with the largest ecosystem; valibot is smaller for size-sensitive bundles |
| HTTP server | **hono** | fastify | hono runs on every runtime (Node, Bun, Deno, Cloudflare Workers); fastify when Node-only and you want the larger plugin ecosystem |
| HTTP client | **undici** | native `fetch` | undici is the engine behind Node's `fetch` — use directly for connection pooling, retries, interceptors |
| Database / ORM | **drizzle** | kysely | drizzle has type-inferred migrations + queries; kysely is a SQL builder when you'd rather write SQL-shaped TS |
| Logging | **pino** | — | structured JSON, fast; pair with `pino-pretty` in dev |
| Environment / config | **zod-config** or env-schema | dotenv-flow | parse `process.env` through zod at startup — fail loudly on misconfiguration |
| Date / time | native **Temporal** (stage 4) | date-fns | Temporal is in Node 22+ behind flag; date-fns as a transitional choice |
| Test (HTTP) | **supertest** | — | works with vitest, no extra config |

All picks are MIT/Apache-licensed and free. Paid commercial alternatives require explicit user escalation (see Philosophy in `common/standards.md`).

## Dependency selection (npm)

The universal dep-cost rule (see Philosophy in `common/standards.md`) applies. The npm registry is vast — quality and maintenance are highly variable, supply-chain attacks are common:

- **Check npm trends + repository activity** before adopting. Unmaintained packages (no release in 12+ months) or single-maintainer packages with low download counts are risky.
- **Prefer mainstream + audited**: `zod`, `vitest`, `eslint`, `prettier`, `vite`, `hono`, `drizzle-orm`. Avoid small packages that wrap a one-line snippet.
- **`npm audit` / `pnpm audit`** runs in CI on every PR (pipeline fragment's `security` job). New advisories fail the build.
- **Pin via lockfile** (`pnpm-lock.yaml` / `package-lock.json`) — commit it, run `pnpm install --frozen-lockfile` / `npm ci` in CI.
- **Document every new dep in `design.md`** with license, last release, why over alternatives.
- **Be wary of post-install scripts** — `npm install --ignore-scripts` for untrusted packages; pin transitive deps via `overrides` when needed.

## What to avoid

- `require()` and CommonJS in new code.
- `Function`, `Object`, `any` as type annotations.
- `enum` — use `as const` objects with union types instead (better tree-shaking, no runtime cost).
- `module.exports` patterns; use `export` keyword exclusively.
- Adding a dep without checking weekly downloads, last release, and license (see Dependency selection above).
