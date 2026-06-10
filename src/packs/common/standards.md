## Philosophy — ship the skeleton first

This sits **above** every methodology, architecture, and language choice. Every DevSpec project follows it, regardless of which fragments are composed.

### Walking skeleton before feature depth

The **first change** in a workspace is a **walking skeleton**: a deployable end-to-end slice that traverses every layer the architecture promises — infrastructure, data store, backend, frontend (if any), CI/CD, and production deployment. It does almost nothing in terms of features. It just *exists*, in production, end-to-end.

This is non-negotiable for greenfield work:

- **Architecture is theory until it ships.** A clean-architecture diagram with no deploy is worth less than a "hello world" that authenticates, persists, renders, and goes through CI to a real environment. The deploy reveals the lies in the diagram.
- **Iteration speed is set on day one.** The team learns the deploy mechanism, the lint feedback loop, the failure modes — once. After that, every feature change benefits from the same machinery.
- **Stakeholders need something to point at.** A non-technical sponsor can review a deployed URL; nobody can review three half-written modules.
- **Cost of wrong assumptions compounds.** Find out the chosen database is wrong on week one (one trivial table) rather than week twelve (forty interlinked ones).

**Make it work, then make it fancy.** The skeleton's job is to be deployed and trivially correct. Refactoring it to "do things properly" comes *after* it ships.

### What the skeleton must include

For a typical web/API project:

- **Infrastructure** — provisioning that creates the runtime environment (k8s manifest, terraform module, App Service plan, etc.).
- **Data** — a real schema with at least one table, accessible from the backend; migrations applied automatically in deploy.
- **Backend** — at least one endpoint that round-trips through the data layer and returns real data.
- **Frontend** (if applicable) — one page that calls the endpoint and renders the response.
- **CI/CD** — the pipeline fragment's full enforcement runs on PR; main deploys to a real environment.
- **Observability** — at minimum, structured logs + a health endpoint a monitoring system can scrape.

Anything beyond the skeleton waits. The **second** change can add the first real feature. Not before.

### Dependency cost discipline

Every dependency is a long-term commitment. Treat them accordingly.

- **Prefer free, open-source, well-maintained.** Default to libraries that are MIT/Apache/BSD-licensed, have releases in the last 12 months, and have a credible maintainer or organisation behind them.
- **Check health before adopting.** Download trends, open vs closed issue ratio, time-to-merge on PRs, recent security advisories. A library untouched for three years is debt waiting to happen.
- **Paid or commercial libraries require an explicit decision.** If the only library that solves the problem is paid (e.g. some commercial .NET components, certain enterprise SDKs), the implementer **must** ask the user before adopting:
  - Why is this paid choice necessary?
  - What is the licensing cost and structure?
  - Are there free alternatives that almost work?
  - What is the lock-in cost if the vendor changes terms or shuts down?
- **Document each new dependency in `design.md`.** A `## Dependencies` section listing library name, license, last release date, why this one over alternatives, and (if applicable) cost.
- **Audit on a schedule.** `npm audit` / `cargo audit` / `dotnet list package --vulnerable` / `pip-audit` run in CI on every PR (the pipeline fragment enforces this).

This applies across every backend — NuGet, npm, crates.io, PyPI, Go modules — and especially to .NET work where paid commercial NuGet packages are common and easy to add by accident.

### What this means for the Ralph loop

- The **first iteration** of the first change targets the walking skeleton, not feature completeness. If the contract asks for ten endpoints, the skeleton ships one.
- The **reviewer** flags any change that adds feature depth while the walking-skeleton slice is incomplete or undeployed. It also flags any new dependency not documented in `design.md` with license + maintainer health, and any paid dep that wasn't escalated to the user.
- The **implementer** prefers the simplest possible working code. KISS and walking-skeleton point the same direction: do the minimum that proves the path, then iterate.

---

## Capability specs vs contracts

DevSpec has two distinct spec layers, each with one job:

- **`contract.md`** lives in each change directory and is the source of truth for **what THIS change ships** — TS-flavored API pseudocode and the ```yaml tests block that becomes failing tests via `devspec scaffold`. Scoped to one change, frozen on archive.
- **`.devspec/specs/<capability>/spec.md`** lives at the workspace level and is the source of truth for **what the system PROMISES** for one capability — accumulated `### Requirement: <name>` headings with SHALL/MUST normative bodies. Living across changes, edited via per-change deltas under `.devspec/projects/<slug>/deltas/<capability>/spec.md`.

**When to introduce a NEW capability:**

- The system gains a new bounded behaviour (auth, billing, data export) that didn't exist before.
- A non-engineer would name it as a "thing the product does" in plain English.
- Names are kebab-case nouns or noun-phrases (`user-auth`, `data-export`, `api-rate-limiting`).

**When to MODIFY an existing capability via a delta:**

- A change adjusts the body of an existing requirement (clarifies behaviour, tightens a constraint) → use `## MODIFIED Requirements`.
- A change adds a new dimension to an existing capability → use `## ADDED Requirements`.
- A change removes obsolete behaviour → use `## REMOVED Requirements` and record rationale in `alignment.md`.

The contract and the capability spec are **complementary, not redundant**: the contract enumerates what THIS change builds and tests; the capability spec enumerates what the SYSTEM promises after this change merges. Reviewer subagents read both — the contract for code-level verification, the merged-preview of the capability spec for system-level verification.

Coherence rules enforce the consistency between the two layers (`capability-exists`, `delta-format`, `delta-capability-match`) and across changes (`requirement-conflict` for cross-change MODIFY/REMOVE collisions). All four are suppressible via `<!-- devspec:ignore <rule-name> -->` markers when an intentional exception exists, with the rationale recorded in `alignment.md`.

---

## Core coding principles

These apply to **every** workspace regardless of language, architecture, or methodology. Both implementers and reviewers must hold the line on them.

- **KISS** — keep it simple. Avoid unnecessary complexity. The simplest code that satisfies the contract is the right code. Cleverness is a cost, not a virtue.
- **DRY** — don't repeat yourself, **but only where duplication actually causes pain**. Two similar lines is fine; three places that drift out of sync is not. Extract abstractions when you see the pattern, not before.
- **YAGNI** — you ain't gonna need it. Build only what the contract demands today. No speculative parameters, hooks, or configuration "in case we need it later."
- **Boy Scout Rule** — leave the codebase cleaner than you found it. Touching a function? Improve a name, delete a dead branch, tighten a type. Small continuous improvements compound.

## Core secure design principles

Security is not a feature added at the end. It is a property of the design.

- **Least privilege** — every user, process, and credential gets the minimum access required. No "admin everywhere" defaults.
- **Defense in depth** — layered controls. Don't rely on a single check (e.g. only input validation, only WAF, only auth). Assume any one layer can fail.
- **Never trust user input** — treat every external value (HTTP, file, env var, queue message, file path) as hostile until proven otherwise. Validate, sanitize, escape.
- **Fail securely** — on error or crash, default to deny. Open systems on failure are how data leaks happen.
- **Keep security simple** — complex security architectures are harder to audit, easier to bypass. Standard patterns over bespoke schemes.
- **Minimize attack surface** — turn off unused endpoints, features, debug modes, and ports. Every running service is a potential entry point.

## Technical coding security practices

- **Input validation** — strict allow-lists for format, length, and character set. Reject anything outside the whitelist. Validate at the boundary, then trust internally.
- **Parameterized queries** — always. Use prepared statements / parameter binding. Concatenating SQL is a defect, not a stylistic choice.
- **Output encoding** — encode data for its destination context (HTML, attribute, URL, JS string). Templating engines that auto-escape by default are preferred.
- **Secure session management** — strong, random session IDs (≥128 bits of entropy). Cookies carry `HttpOnly`, `Secure`, `SameSite=Strict|Lax` as appropriate.
- **Encrypt in transit and at rest** — TLS 1.3 for in-transit, AES-256-GCM for at-rest. No exceptions for "internal" traffic — the perimeter is gone.
- **No hardcoded secrets** — no API keys, passwords, certificates, or cryptographic keys in source code or config files committed to git. Use a secrets manager + runtime injection. Pre-commit scans (gitleaks, trufflehog) in CI.

## Warnings as errors

**All compiler and linter warnings are build failures in CI.** A warning the team ignores is a defect with a long fuse — every codebase that "treats warnings as informational" accumulates them until they become invisible. Configure each language's build pipeline so the build fails if any warning is present:

- **.NET / Blazor**: `<TreatWarningsAsErrors>true</TreatWarningsAsErrors>` in the `<PropertyGroup>` of every project. Use `<WarningsNotAsErrors>` only for documented, time-boxed exceptions.
- **Rust**: `cargo clippy --all-targets --all-features -- -D warnings` in CI. For Cargo workspaces, set `[workspace.lints.rust] warnings = "deny"` and `[workspace.lints.clippy] all = "deny"`.
- **TypeScript / Node**: `eslint . --max-warnings 0` in CI. `tsc --noEmit` already fails on type errors; pair with a strict tsconfig (`strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`).
- **Python**: `ruff check .` exits non-zero on lint findings (no `--exit-zero`). `pyright` (or `mypy --strict`) in CI. Add `filterwarnings = ["error"]` to `[tool.pytest.ini_options]` so runtime DeprecationWarnings break tests.
- **Svelte**: `svelte-check --threshold warning` so any svelte-check warning blocks the build. Pair with ESLint as above.

Exceptions require a comment with a justification AND a ticket/issue link, and are time-boxed. "Suppress" is not a solution; "fix" is.

## Operational security

- **Don't roll your own crypto** — use vetted libraries (`libsodium`, `BoringSSL`, platform-native KMS). Implement AES-256-GCM via your platform's primitive, never from scratch. Hash passwords with **Argon2id** (preferred) or **scrypt**; **never** MD5/SHA-1/plain SHA-256 for passwords.
- **Log and monitor** — log security-critical events (auth failures, privilege grants, permission denials, key rotations) to a tamper-evident store. Never log secrets, passwords, full PII, or session tokens.
- **Dependency management** — scan dependencies regularly (`npm audit`, `pip-audit`, `cargo audit`, `dotnet list package --vulnerable`). Update on a schedule, not just when something breaks. Pin transitive deps via lockfiles.

## Crypto specifics (use, don't invent)

- **Symmetric encryption**: AES-256-GCM (authenticated). Avoid AES-CBC unless you're also doing HMAC manually and you really know why.
- **Asymmetric encryption**: X25519 / Ed25519 for new code. RSA-2048 minimum where required by interop.
- **Hashing for passwords**: Argon2id (preferred) or scrypt. Never use MD5, SHA-1, or unsalted hashes for passwords.
- **Hashing for integrity**: SHA-256 or SHA-3 family.
- **MAC**: HMAC-SHA-256 or built-in AEAD modes (GCM, ChaCha20-Poly1305).
- **Random numbers for security**: platform CSPRNG (`crypto.randomBytes`, `secrets.token_bytes`, `rand::rngs::OsRng`). Never `Math.random()` / `random.random()` for tokens, IDs, or keys.
- **TLS**: 1.3 minimum, 1.2 only where forced by clients. Disable RC4, 3DES, CBC ciphers, SSLv3.

## What this means for reviewers

The Ralph loop's reviewer subagent must flag:

- New code that adds complexity without a contract justification (KISS / YAGNI violations)
- Duplication that has now appeared in 3+ places (DRY trigger)
- Hardcoded secrets, API keys, or credentials of any kind
- Concatenated SQL or shell strings — flag as a block
- Custom crypto, custom hash routines, or use of MD5/SHA-1 for security purposes
- Missing input validation at trust boundaries
- Use of `Math.random()` / equivalent for anything that's a token, ID, or secret
- Logging that includes secrets, passwords, full PII, or session IDs
- Dependencies added without a lockfile entry or with known CVEs
- New code that introduces a `#pragma warning disable`, `#[allow(...)]`, `eslint-disable`, or `# noqa` without a comment justifying it AND a ticket reference. The default is to fix the warning, not suppress it.

These are review-blocking by default in any phase ≥ `ready`. They are warning-only in earlier phases (so exploration isn't blocked) — production `strict` mode escalates them automatically.
