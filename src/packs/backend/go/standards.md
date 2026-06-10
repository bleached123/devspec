## Go conventions

- Target **Go 1.25+** for new projects (Go 1.26 released February 2026 is also fine). Avoid 1.22 and earlier — they predate range-over-func and refined generics.
- `go.mod` per repo (or per module in workspaces). `toolchain` directive pins the minimum Go version.
- `gofmt`/`goimports` on save. `golangci-lint run` in CI with the project's `.golangci.yml`.
- **Warnings as errors**: in `.golangci.yml` set `issues.max-issues-per-linter: 0` and `issues.max-same-issues: 0`. `go vet ./...` runs in CI; a single finding fails the build.
- `go vet ./...` must pass in CI. `staticcheck` (via golangci-lint) catches subtle bugs `vet` misses.
- Module path follows the repository URL (e.g. `github.com/org/repo`).

## Naming

- **PascalCase for exported identifiers**, **camelCase for unexported**. Never `snake_case` — Go's convention is unambiguous.
- File names: `snake_case.go` (the one exception). Test files end `_test.go`.
- Package names: short, lowercase, single-word, no underscores (`auth`, not `authentication_layer`).
- Avoid stuttering: `auth.AuthService` is wrong, `auth.Service` is right.
- Test functions: `func TestXxx(t *testing.T)` — `Test` prefix is required by the test runner.

## Errors

- Functions that can fail return `(T, error)` as the last positional pair.
- **No panics in library code** — only for genuinely unrecoverable issues at startup (e.g. compiled-in regex `MustCompile`).
- Wrap errors with `fmt.Errorf("doing X: %w", err)` to preserve the chain. Use `errors.Is` / `errors.As` to inspect.
- **No naked `if err != nil { return err }`** — at least add context: `return fmt.Errorf("loading config: %w", err)`.
- For sentinel errors, define exported `Err...` vars: `var ErrNotFound = errors.New("not found")`.
- For typed errors with fields, use `errors.As`-compatible structs.

## Modern idioms (1.21 / 1.22 / 1.23 / 1.24 / 1.25)

- **Structured logging via `log/slog`** (1.21+) — never `log.Printf` for new code. JSON handler in production, text handler for dev.
- **Iterators with range-over-func** (1.23+) — for custom collection traversal, prefer `iter.Seq[T]` over callback-based APIs where it reads cleanly.
- **`for i := range N`** (1.22+) — replaces `for i := 0; i < N; i++` in tight loops.
- **`min`, `max`, `clear` builtins** (1.21+) — use them instead of helper functions.
- **Generics (1.18+)** — use when they remove real duplication, not preemptively. Concrete types are usually clearer.

## Concurrency

- Don't communicate by sharing memory; share memory by communicating. Channels for ownership transfer, mutexes for state guards.
- `context.Context` is the FIRST parameter of any function that touches I/O, cancellation, or long-running work.
- `sync.WaitGroup` for fan-out/fan-in; `errgroup.Group` (`golang.org/x/sync/errgroup`) when goroutines can fail.
- Don't leak goroutines — every spawned goroutine must have a clear exit path tied to a context or channel close.
- Race detector mandatory in tests: `go test -race ./...`.

## Project layout

- `cmd/<binary>/main.go` for entry points. Multiple binaries → multiple `cmd/X/`, `cmd/Y/` dirs.
- `internal/` for code not intended for external import. Anything outside `internal/` is part of the module's public API.
- `pkg/` only if you genuinely export packages to other modules (rare in apps). Most projects don't need it.
- One concept per package. Files within a package are organised by what they do, not where they came from.

## Testing

- Test files live in the same package (white-box) OR a sibling `foo_test` package (black-box). Prefer black-box for testing public API.
- **Table-driven tests** with `t.Run(name, ...)` for sub-cases — gives focused failures and parallel execution via `t.Parallel()`.
- `t.Helper()` in test helper functions so the failure points at the caller's line.
- Integration tests use the `testing` package with build tags: `//go:build integration` to opt in.
- Use `testify/assert` sparingly — stdlib `testing` is usually enough. Don't import a DSL for `t.Errorf`.

## File size guidance

- Files under ~500 lines. If larger, split by responsibility within the package.
- Public API documented with `// Xxx` doc comments on every exported identifier.
- One exported type per file is common but not required.

## Recommended packages

> _Last refreshed: 2026-05-18. **Advisory, not mandatory** — pick based on actual need, document the choice in `design.md`. Re-vet with `/devspec:refresh-standards backend/go`._

| Category | Primary pick | Alternative | Notes |
|---|---|---|---|
| HTTP routing | **chi** | stdlib `net/http` | chi for middleware composition; stdlib's `ServeMux` (1.22+) is fine for small APIs |
| Database | **sqlx** + raw SQL | sqlc | sqlx for hand-written queries with struct scanning; sqlc when you want generated code from SQL files |
| Migrations | **goose** | golang-migrate | both work; goose has simpler embedded-migration ergonomics |
| Logging | stdlib **`log/slog`** | zap | slog is the official structured logger since 1.21 — no reason to reach for zap in new code |
| Validation | **go-playground/validator** | manual | tag-based validation for HTTP DTOs; manual for domain invariants |
| HTTP client | stdlib **`net/http`** | resty | stdlib is sufficient; resty when you want fluent builder + retries |
| Configuration | **envconfig** or viper | manual flag parsing | envconfig for env-var-only; viper when you need multi-source (env + yaml + flags) |
| Testing | stdlib **`testing`** | testify | stdlib is preferred — `testify/assert` only when you'd otherwise write the same helper 5 times |
| Test containers | **testcontainers-go** | manual setup | for integration tests against real Postgres/Redis/etc. |
| CLI | **cobra** | urfave/cli | cobra is the de-facto standard (used by kubectl, hugo, gh) |

All free + permissively licensed.

## Dependency selection (Go modules)

The universal dep-cost rule (see Philosophy in `common/standards.md`) applies. Go modules are mostly free + permissive-licensed, but be deliberate:

- **Check `pkg.go.dev`**: last commit, open issues, used-by count. Avoid modules with a single maintainer and stalled activity.
- **Prefer stdlib first** — Go's stdlib is unusually capable (HTTP, JSON, crypto, log/slog). Reach for a dep only when stdlib clearly doesn't cover the need.
- **`govulncheck ./...`** runs in CI on every PR (pipeline fragment's `security` job). New advisories fail the build.
- **Pin via `go.mod` + `go.sum`** (committed). Use `GOFLAGS=-mod=readonly` in CI.
- **Document every new dep in `design.md`** with license, last commit, why over alternatives.

## What to avoid

- `panic` for control flow. Return errors.
- `interface{}` (use `any` since 1.18, but prefer a concrete type or named interface).
- Global mutable state. Use struct fields + constructor injection.
- `init()` functions for anything non-trivial — they obscure startup order.
- Returning concrete `*Struct` when the consumer wanted an interface. Accept interfaces, return structs.
- `log.Fatal` outside of `main`. Library code returns errors.
- Reflection unless you have a documented reason. Generics solved most of the legitimate use cases.
- Adding a dep without checking last-commit date and license (see Dependency selection above).
