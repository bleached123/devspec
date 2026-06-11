## Azure Pipelines conventions

### Pipeline shape

- **One YAML pipeline per concern**. `azure-pipelines.yml` for PR/main gates. `azure-pipelines-release.yml` for build + deploy. Don't mix gates and deploys in one pipeline.
- **Trigger on `main` + PR validation only** — `trigger: branches: include: [main]` and a branch policy that runs the pipeline on PRs. Not every branch push (noisy and expensive).
- **`batch: true` on the trigger** so queued runs on the same branch collapse — Azure Pipelines' equivalent of GitHub's cancel-in-progress concurrency.
- **Microsoft-hosted `ubuntu-24.04` agents** by default. Self-hosted agents must be ephemeral (fresh per job) — a warm agent that previous jobs wrote to is a supply-chain risk.
- **Pin task versions to a major (`Docker@2`, `Cache@2`, `NodeTool@0`)**. Marketplace extensions need an explicit decision — prefer plain `script:` steps over installing an extension for something a shell one-liner does.

### Required jobs (gating)

Every PR must pass these jobs before merge. Enforce via a **Build Validation** branch policy on `main` (Project Settings → Repositories → Policies), not by convention.

| Job | What it does | Fails build on |
|---|---|---|
| **security** | gitleaks (secret scan, via Docker — no extension needed), backend dependency audit | any secret detected, any high-severity dep advisory |
| **quality** | format check, lint, typecheck — all warnings-as-errors | any lint warning, any unformatted file, any type error |
| **test-unit** | language-native unit test runner | any failing test, race condition, panic |
| **test-integration** | integration tests (build-tagged or separate suite) | any failing integration test |
| **test-e2e** | Playwright against running app (frontend only) | any failing e2e test, browser console error |
| **devspec** | `devspec doctor`, `devspec check`, `devspec coherence` per change | any blocking coherence drift, any workspace setup error |

Azure DevOps has no equivalent of GitHub's `dependency-review-action`; the security job runs the backend's native audit (`npm audit --audit-level=high`, `cargo audit`, `dotnet list package --vulnerable`, `pip-audit`, `govulncheck`) instead.

### Branch policies

Configure on `main` (these are the ADO equivalent of GitHub branch protection):

- **Build Validation**: the `ci` pipeline, required, re-queued when the source branch updates.
- **Minimum number of reviewers**: at least 1; **reset code reviewer votes when there are new changes**.
- **Check for comment resolution**: required.
- **Check for linked work items**: required — every PR links an `AB#` work item; DevSpec's PR template includes the slot.
- **Limit merge types**: squash or rebase only — keeps history linear.
- Policies apply to administrators too. A policy with a bypass list is decorative.

### Failure visibility

- Use **`##vso[task.logissue type=error]...`** to surface failures in the run summary and PR checks panel (the ADO equivalent of GitHub's `::error::`).
- Use **`##[group]` / `##[endgroup]`** to fold expensive output (per-change coherence loop, test suite stdout).
- Publish test results via **`PublishTestResults@2`** with a JUnit/xUnit reporter so failures annotate with file:line in the Tests tab.
- Coherence findings can also be published as SARIF (`devspec coherence <slug> --sarif`) and surfaced by the *SARIF SAST Scans Tab* extension if your org allows it — optional, the `##vso` annotations work without any extension.

### Security baseline

- **Secret scanning** runs on every PR and push to main via the gitleaks container image — no marketplace extension, no license.
- **No long-lived cloud credentials in variable groups.** Use service connections with **workload identity federation** (the OIDC equivalent) for Azure/AWS/GCP access. Secret-based service connections need a documented justification.
- **Don't echo secrets.** Mark dynamic secrets with `##vso[task.setvariable variable=x;issecret=true]` so the agent masks them.
- **Variable groups holding secrets are linked per-pipeline**, never project-wide.
- **Deployment approvals live on Environments** (Pipelines → Environments → staging/production → Approvals and checks), not in YAML. YAML declares `environment: production`; the portal decides who approves.

### Caching

- **`Cache@2`** keyed on the lockfile hash for the package manager cache (`~/.npm`, `~/.cargo/registry`, `~/.nuget/packages`): `key: 'deps | "$(Agent.OS)" | **/package-lock.json'`.
- **Docker layer reuse** via `Cache@2` on a local buildx cache directory, or a registry cache (`--cache-from`) against your container registry. Azure Pipelines has no equivalent of GitHub's `type=gha` cache backend.
- Never cache `node_modules` or `target/` directly — cache the package manager's download cache.

### Work-item traceability

- PR descriptions reference **`AB#<id>`** — ADO auto-links and transitions the work item on merge.
- The DevSpec PR template carries the change slug *and* the work-item slot; the alignment.md decision log plus the linked work item form the audit trail.

### What to avoid

- **`continueOnError: true`** on a gating job — it silently disables the check. Use `condition: always()` for cleanup steps, not to ignore failures.
- **Classic (UI-designed) pipelines.** YAML only — pipelines belong in version control like everything else.
- **Marketplace extensions for things a script does.** Every extension is an org-level supply-chain grant.
- **Running tests outside the dev image** — if `docker-compose.yml` is the source of truth for the env, CI must use it too.
- **Skipping the security job for "fast" PRs.** Security is gating, not advisory.
