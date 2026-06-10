import path from "node:path";
import fs from "fs-extra";
import { describe, it, expect } from "vitest";
import { runCli, withTempWorkspace, setupWorkspace } from "./helpers.js";

describe("devspec ci init", () => {
  it(
    "writes .github/workflows/ci.yml and pull_request_template.md (default platform = github)",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root);

        const r = await runCli(["ci", "init"], root);
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toContain(".github/workflows/ci.yml");
        expect(r.stdout).toContain(".github/pull_request_template.md");
        expect(r.stdout).toContain(".github/workflows/release.yml");
        expect(r.stdout).toContain("3 written");

        const workflow = await fs.readFile(
          path.join(root, ".github", "workflows", "ci.yml"),
          "utf8"
        );
        // Default platform = github, and the github pipeline fragment ships
        // with devspec — so the user gets the full enforcement workflow by
        // default. Sanity-check key gates:
        expect(workflow).toContain("name: ci");
        expect(workflow).toContain("devspec doctor");
        expect(workflow).toContain("devspec check");
        expect(workflow).toContain("coherence");

        const prTemplate = await fs.readFile(
          path.join(root, ".github", "pull_request_template.md"),
          "utf8"
        );
        expect(prTemplate).toContain("Linked DevSpec change");
        expect(prTemplate).toContain("Spec checklist");
        expect(prTemplate).toContain("contract.md");
      });
    }
  );

  it(
    "refuses to overwrite without --force",
    { timeout: 30000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root);
        await runCli(["ci", "init"], root);

        const r = await runCli(["ci", "init"], root);
        expect(r.exitCode).toBe(0); // not a hard error
        expect(r.stdout).toContain("skip");
        expect(r.stdout).toContain("0 written, 3 skipped");
      });
    }
  );

  it(
    "rejects unsupported platforms",
    { timeout: 30000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root);
        const r = await runCli(["ci", "init", "--platform", "gitlab"], root);
        expect(r.exitCode).not.toBe(0);
        expect(r.stderr + r.stdout).toMatch(/Unsupported pipeline platform/);
      });
    }
  );

  it(
    "emits the full security/quality/test enforcement workflow when --pipeline github is configured",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { backend: "go", pipeline: "github" });

        const r = await runCli(["ci", "init"], root);
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toContain("pipeline/github fragment");

        const workflow = await fs.readFile(
          path.join(root, ".github", "workflows", "ci.yml"),
          "utf8"
        );

        // Required jobs are present
        expect(workflow).toMatch(/^\s+security:/m);
        expect(workflow).toMatch(/^\s+quality:/m);
        expect(workflow).toMatch(/^\s+test-unit:/m);
        expect(workflow).toMatch(/^\s+test-integration:/m);
        expect(workflow).toMatch(/^\s+test-e2e:/m);
        expect(workflow).toMatch(/^\s+devspec:/m);

        // Security tooling
        expect(workflow).toContain("gitleaks");
        expect(workflow).toContain("dependency-review-action");
        expect(workflow).toContain("fail-on-severity: high");

        // Concurrency + least-privilege
        expect(workflow).toContain("cancel-in-progress: true");
        expect(workflow).toMatch(/^permissions:\s*\n\s+contents:\s+read/m);

        // Caching
        expect(workflow).toContain("setup-buildx-action");
        expect(workflow).toContain("cache-from: type=gha");

        // Backend commands substituted from go fragment's tech-stack.yaml
        expect(workflow).toContain("golangci-lint run ./...");
        expect(workflow).toContain("go test -race -short ./...");
        expect(workflow).toContain("go test -race -tags=integration ./...");
        expect(workflow).toContain("go vet ./...");

        // E2E job exists in template but condition is `if: false` when no frontend
        expect(workflow).toMatch(/if:\s*false/);
      });
    }
  );

  it(
    "substitutes the e2e command when a frontend is configured",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, {
          backend: "node-typescript",
          pipeline: "github",
          frontend: "svelte",
        });

        const r = await runCli(["ci", "init"], root);
        expect(r.exitCode).toBe(0);

        const workflow = await fs.readFile(
          path.join(root, ".github", "workflows", "ci.yml"),
          "utf8"
        );

        // E2E job's `if:` becomes true
        expect(workflow).toMatch(/if:\s*true/);
        // Playwright commands substituted from svelte fragment
        expect(workflow).toContain("npx playwright test");
        expect(workflow).toContain("npx playwright install");
        // Backend commands from node-typescript fragment
        expect(workflow).toContain("pnpm eslint . --max-warnings=0");
        expect(workflow).toContain("pnpm tsc --noEmit");
      });
    }
  );

  it(
    "writes release.yml + scaffolds .devspec/release.yaml with deploy placeholders",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { backend: "go", pipeline: "github" });

        const r = await runCli(["ci", "init"], root);
        expect(r.exitCode).toBe(0);

        // release.yml is written
        const releaseYml = await fs.readFile(
          path.join(root, ".github", "workflows", "release.yml"),
          "utf8"
        );
        expect(releaseYml).toContain("name: release");
        expect(releaseYml).toMatch(/^\s+build:/m);
        expect(releaseYml).toMatch(/^\s+deploy-staging:/m);
        expect(releaseYml).toMatch(/^\s+deploy-production:/m);
        // ghcr.io login
        expect(releaseYml).toContain("registry: ghcr.io");
        // Tag trigger
        expect(releaseYml).toContain("tags: ['v*.*.*']");
        // GitHub Release on tag
        expect(releaseYml).toContain("softprops/action-gh-release");
        // Substitution worked — the deploy_cmd appears as multiline
        expect(releaseYml).toContain("environments.staging.deploy_cmd");
        // Wait, actually the {{ }} should be substituted away. Check the
        // resolved content instead:
        expect(releaseYml).toContain("https://staging.REPLACE-ME.example.com");
        expect(releaseYml).toContain("Edit .devspec/release.yaml");

        // .devspec/release.yaml scaffolded
        const releaseYaml = await fs.readFile(
          path.join(root, ".devspec", "release.yaml"),
          "utf8"
        );
        expect(releaseYaml).toContain("environments:");
        expect(releaseYaml).toContain("staging:");
        expect(releaseYaml).toContain("production:");
        expect(releaseYaml).toContain("conventional_commits: true");
        expect(releaseYaml).toContain("tag_format: \"v{version}\"");
      });
    }
  );

  it(
    "release.yaml is preserved on rerun even with --force",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { backend: "go", pipeline: "github" });

        await runCli(["ci", "init"], root);
        const releaseYamlPath = path.join(root, ".devspec", "release.yaml");
        const customized =
          (await fs.readFile(releaseYamlPath, "utf8")).replace(
            "https://staging.REPLACE-ME.example.com",
            "https://staging.real.example.com"
          );
        await fs.writeFile(releaseYamlPath, customized);

        const r = await runCli(["ci", "init", "--force"], root);
        expect(r.exitCode).toBe(0);

        const after = await fs.readFile(releaseYamlPath, "utf8");
        expect(after).toContain("https://staging.real.example.com");
        // And the workflow picked up the customized URL
        const releaseYml = await fs.readFile(
          path.join(root, ".github", "workflows", "release.yml"),
          "utf8"
        );
        expect(releaseYml).toContain("https://staging.real.example.com");
      });
    }
  );

  it(
    "PR template from fragment includes security & quality checklist",
    { timeout: 30000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { pipeline: "github" });

        const r = await runCli(["ci", "init"], root);
        expect(r.exitCode).toBe(0);

        const prTemplate = await fs.readFile(
          path.join(root, ".github", "pull_request_template.md"),
          "utf8"
        );
        expect(prTemplate).toContain("Security & quality");
        expect(prTemplate).toContain("No new secrets");
        expect(prTemplate).toContain("Unit tests pass");
        expect(prTemplate).toContain("Integration tests pass");
        expect(prTemplate).toContain("E2E tests pass");
      });
    }
  );
});
