## Terraform layout

- Target **Terraform 1.10+** for new projects. The `required_version` constraint is set per-stack, not workspace-wide.
- One directory per environment under `infra/environments/<env>/`. Each has its own `terraform.tfvars` and remote state backend.
- Reusable infrastructure lives in `infra/modules/<name>/`. Modules are versioned (Git tag or registry); environments pin specific versions.
- Provider version constraints are exact (`= 5.70.0`) for production. Use a `~>` constraint only for non-critical providers.

## Modern features (1.9 / 1.10)

- **Ephemeral resources and values** (1.10+) for short-lived secrets that should never enter state:
  ```hcl
  ephemeral "aws_secretsmanager_secret_version" "db" {
    secret_id = aws_secretsmanager_secret.db.id
  }
  ```
- **Input validation with custom error messages** (1.9+) — use `validation` blocks with `error_message` referencing the variable.
- **`for_each` over typed collections** rather than `count` whenever the resource is identified by a name, not an index.
- **`moved` blocks** when refactoring — keep the plan diff clean across renames and re-parented modules.
- **`removed` blocks** for explicit out-of-state removal without `terraform state rm` magic.
- **`check` blocks** for post-apply assertions (smoke tests against deployed infra).

## Module shape

- A module has `main.tf`, `variables.tf`, `outputs.tf`, `versions.tf`, and a `README.md` describing inputs/outputs.
- Variables have `type`, `description`, `validation`, and a `default` only when truly optional.
- Outputs include `description` and mark sensitive values with `sensitive = true`.
- Never reach across modules with `data` sources for things that should be an explicit input.
- Mark provider configuration explicit in the module (`required_providers`) — don't rely on root inheritance for cross-cloud modules.

## State

- Remote state only — never local `terraform.tfstate` committed to git.
- State locking enabled (DynamoDB for AWS, Cosmos for Azure, Cloud Storage with native locking for GCP).
- State is per-environment and per-stack. Don't co-mingle prod + staging state files.
- Sensitive values stay out of state where possible — use ephemeral resources (1.10+) or external secret references.
- State files encrypted at rest via the backend's KMS integration.

## Plan, apply, drift

- `terraform fmt -recursive` and `terraform validate` must pass in CI.
- Production applies are gated by a reviewed plan posted to the PR.
- Drift detection runs nightly via `terraform plan -detailed-exitcode`; failures escalate.
- Never `terraform apply -auto-approve` against production from a developer machine.
- Use `terraform test` (1.6+) for module-level integration tests with mock providers.

## Naming and tagging

- Resource names: `<environment>-<service>-<purpose>` (e.g. `prod-bookings-db`).
- Every taggable resource carries `Environment`, `Service`, `ManagedBy = "terraform"`, and `CostCenter`. Use `default_tags` at the provider level.

## What to avoid

- `terraform state rm` / `terraform import` outside disaster recovery — use `moved` and `import` blocks in code instead.
- Wrapping secrets into `data` sources that read them into state — use ephemeral resources.
- Hand-crafted ARNs / resource IDs in strings — reference attributes (`aws_s3_bucket.x.arn`).
- `null_resource` with `local-exec` for things that should be a provider — almost always a smell.
