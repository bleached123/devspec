## GitHub Actions conventions

### Workflow shape

- **One workflow per concern**. `ci.yml` for PR/main gates. Don't mix release/publish/deploy into the same workflow.
- **Trigger on `pull_request` + `push: branches: [main]`** — not on every push to every branch (noisy and expensive).
- **Concurrency group** keyed on `${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: true`. Stale runs are waste.
- **Top-level `permissions: contents: read`** by default. Grant additional permissions per-job, not workflow-wide.
- **Pin actions to a major tag (`@v4`) or a full SHA**. Floating `@main` is forbidden — supply-chain attacks have happened.

### Required jobs (gating)

Every PR must pass these jobs before merge. Configure them as required status checks in branch protection.

| Job | What it does | Fails build on |
|---|---|---|
| **security** | gitleaks (secret scan), dependency-review (PR-only) | any secret detected, any high-severity dep CVE |
| **quality** | format check, lint, typecheck — all warnings-as-errors | any lint warning, any unformatted file, any type error |
| **test-unit** | language-native unit test runner | any failing test, race condition, panic |
| **test-integration** | integration tests (build-tagged or separate suite) | any failing integration test |
| **test-e2e** | Playwright / Cypress against running app (frontend only) | any failing e2e test, browser console error |
| **devspec** | `devspec doctor`, `devspec check`, `devspec coherence` per change | any blocking coherence drift, any workspace setup error |

### Test layers

Three layers enforced:

- **Unit** — fast, isolated, no external dependencies. Runs on every commit. Sub-second per test. **Required for every backend.**
- **Integration** — touches real dependencies (database, message queue, HTTP). Uses build tags (`-tags=integration` for Go), test projects (`*.IntegrationTests` for .NET), or runner flags (`pytest -m integration` for Python). **Required for every backend.**
- **E2E / UI** — browser-driven against the deployed app. Playwright preferred (Chromium-first, video on failure). **Required when frontend is configured.**

Tests at one layer must not leak into another. A "unit test" that hits the database is an integration test mislabeled.

### Security baseline

- **Secret scanning** runs on every push and PR. We use gitleaks; pull-request-only scanners miss leaked main-branch commits.
- **Dependency review** on every PR — fails on `high` severity or above. Override only with documented justification in the PR.
- **No long-lived cloud credentials in secrets.** Use OIDC trust to AWS/GCP/Azure with `permissions: id-token: write` scoped to the specific job that needs it.
- **Don't echo secrets.** Use `::add-mask::` when constructing dynamic secrets at runtime.
- **`GITHUB_TOKEN` is read-only by default.** Elevate explicitly per-job (e.g. `pull-requests: write` for PR comments).
- **Third-party actions are pinned by SHA** for security-sensitive jobs (release, deploy). Major-tag pinning is acceptable for build/test jobs.

### Caching

- **Language-native caching** via the setup action (`actions/setup-node@v4` with `cache: npm`, `actions/setup-go@v5` with `cache: true`, etc.). Built-in, no maintenance.
- **Docker buildx cache** for the dev image — `cache-from: type=gha` and `cache-to: type=gha,mode=max`. Saves 30–60s per run on warm caches.
- **Cache keys include lockfile hash**: `${{ runner.os }}-deps-${{ hashFiles('**/lockfile') }}`. Never cache forever without invalidation.
- **Don't cache `node_modules` or `target/` directly** — cache the package manager's download cache instead (`~/.npm`, `~/.cargo/registry`).

### Code quality gates

- **Format check** is a separate step from lint. `cargo fmt --check`, `gofmt -l .` (zero lines = pass), `dotnet format --verify-no-changes`, `ruff format --check`.
- **Lint runs with warnings-as-errors.** Whatever the chosen linter (clippy, golangci-lint, eslint, ruff, dotnet build with `TreatWarningsAsErrors`), no warning is acceptable in main.
- **Typecheck is separate** — `tsc --noEmit`, `go vet`, `dotnet build --no-restore`, `mypy --strict`. Compiles in CI even if tests pass.

### Failure visibility

- Use **`echo "::error::..."`** to surface failures inline on the PR (not just in raw logs).
- Use **`echo "::group::..."` / `echo "::endgroup::"`** to fold expensive output (per-change coherence loop, test suite stdout).
- **Annotate** test failures with file:line via the `--junit-output` / `gotestsum` / `xunit` reporter where available.

### Branch protection

Configure on `main`:

- **Require status checks**: all 6 required jobs above must pass.
- **Require PR reviews**: at least 1 approval, dismiss stale reviews on push.
- **Require conversation resolution** before merge.
- **Require linear history** (no merge commits) — recommended for clean `git log`.
- **Require signed commits** — recommended; enforce once team tooling supports it.
- **Apply rules to admins.** A protection rule that admins can bypass is decorative.

### What to avoid

- **`continue-on-error: true`** on a gating job — it's a silent disabling of the check. Use `if: always()` for follow-up steps that must run regardless, not to ignore failures.
- **Workflow secrets stored as `secrets.MY_KEY`** when OIDC would work. Long-lived keys rotate poorly.
- **Self-hosted runners without ephemeral isolation.** Each job must run on a fresh runner.
- **Running tests outside the dev image** — if `docker-compose.yml` is the source of truth for the env, CI must use it too. Drift between local and CI environments is the #1 cause of "works on my machine."
- **Skipping the security job for "fast" PRs.** Security is gating, not advisory.
