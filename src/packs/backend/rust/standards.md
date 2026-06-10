## Rust conventions

- Edition **2024** unless there's a documented reason otherwise (new projects start here).
- `cargo fmt` on save. `cargo clippy --all-targets --all-features -- -D warnings` passes in CI.
- **Warnings as errors** workspace-wide via `Cargo.toml`:
  ```toml
  [workspace.lints.rust]
  warnings = "deny"
  unused = "deny"
  rust_2024_compatibility = "deny"

  [workspace.lints.clippy]
  all = "deny"
  pedantic = "warn"
  ```
  Then each crate inherits via `[lints] workspace = true`. `#[allow(...)]` requires a comment explaining why.
- Naming: `snake_case` for functions/modules/files, `CamelCase` for types/traits, `SCREAMING_SNAKE_CASE` for constants.
- Errors: return `Result<T, E>` — do not panic in library code. Use `thiserror` for library crates, `anyhow` with `.context(...)` for binaries.
- `unsafe` blocks require a `// SAFETY:` comment explaining the invariants the caller must uphold.
- Prefer borrowing (`&T`) over ownership transfer in function signatures unless the function actually consumes the value.

## Modern idioms (Edition 2024 / stable Rust)

- **`let ... else`** for early-return on `None`/`Err` instead of nested `match`:
  ```rust
  let Some(user) = repo.find(id) else { return Err(NotFound); };
  ```
- **`async fn` in traits** is stable — no need for `#[async_trait]` in new code.
- **Native let-chains** in `if`: `if let Some(x) = a && x > 5 { ... }`.
- **`?` with context** at fallible boundaries: `op().context("while loading config")?`.

## Async

- `tokio` is the default runtime. Don't mix runtimes in the same binary.
- Async fn returns `impl Future` — keep `Send + 'static` bounds explicit when the future crosses threads.
- Hold no locks across `.await` points.
- Prefer `tokio::select!` over manual polling for cancellation.

## Tooling

- `cargo nextest` for the test runner — substantially faster than `cargo test` on large suites; same `#[test]` syntax.
- `cargo machete` or `cargo udeps` in CI to catch unused dependencies.
- `cargo deny` for license/advisory checks if dependencies are external.

## Project layout

- Workspaces for multi-crate projects: one crate per architectural layer (`domain`, `application`, `infrastructure`, `web`) when using clean-architecture.
- Single-crate projects: one module per layer under `src/` with `mod.rs` (or 2018-style siblings — pick one and be consistent).
- `tests/` directory for integration tests; unit tests live in the same file under `#[cfg(test)] mod tests`.

## File size guidance

- Modules under ~500 lines. If larger, split into submodules.
- Public API documented with `///` doc comments on items, `//!` for module-level docs.

## Recommended crates

> _Last refreshed: 2026-05-18. **Advisory, not mandatory** — pick based on actual need, document the choice in `design.md`. Re-vet with `/devspec:refresh-standards backend/rust`._

| Category | Primary pick | Alternative | Notes |
|---|---|---|---|
| Async runtime | **tokio** (in tech-stack) | smol | tokio has the deepest ecosystem; smol for lighter-weight executors |
| Web framework | **axum** | actix-web | axum is tower-based, integrates cleanly with the tokio ecosystem |
| HTTP client | **reqwest** | hyper directly | reqwest for app code; hyper if you need lower-level control |
| Serialization | **serde** + serde_json | — | the universal serialization layer |
| Database | **sqlx** | sea-orm | sqlx for compile-time-checked queries; sea-orm when you want an ORM proper |
| Errors (library) | **thiserror** | — | typed errors, derive-friendly; combine with `?` for clean propagation |
| Errors (binary / app) | **anyhow** | eyre | anyhow with `.context(...)` for human-readable failure chains |
| CLI | **clap** (derive) | argh | clap's derive API is the standard for serious CLIs |
| Tracing | **tracing** + tracing-subscriber | log | structured spans; `log` only for libraries that need to stay framework-agnostic |
| Testing (parallel runs) | **cargo-nextest** (in tech-stack) | cargo test | nextest for speed and better output; built-in `cargo test` works too |

All free + MIT/Apache-licensed.

## Dependency selection (crates.io)

The universal dep-cost rule (see Philosophy in `common/standards.md`) applies. crates.io is mostly free + MIT/Apache, but discipline still matters:

- **Check `Last release` and `Repository`** on crates.io. Unmaintained crates (no release in 12+ months, no `Repository` URL) are debt — pick an alternative or vendor the code.
- **Prefer well-known foundational crates** (`tokio`, `serde`, `reqwest`, `axum`, `clap`, `thiserror`/`anyhow`). They have the largest user bases and most thorough security review.
- **`cargo audit`** runs in CI on every PR (pipeline fragment's `security` job). New advisories fail the build.
- **Pin via `Cargo.lock`** — committed for binaries, ignored for libraries.
- **Document every new dep in `design.md`** with license, last release, why over alternatives.

## What to avoid

- `#[async_trait]` in new code (Edition 2024 has native async traits).
- `RefCell` in async code — use `tokio::sync::Mutex` or message passing.
- Returning `Box<dyn Error>` from libraries — return a concrete error type via `thiserror`.
- Adding a dep without checking last-release date and license (see Dependency selection above).
