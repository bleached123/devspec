import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "fs-extra";
import { describe, it, expect } from "vitest";
import { runCli, withTempWorkspace, setupWorkspace } from "./helpers.js";

const exec = promisify(execFile);

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await exec("git", args, { cwd });
  return stdout.trim();
}

async function makeCommit(cwd: string, file: string, content: string, message: string): Promise<void> {
  await fs.writeFile(path.join(cwd, file), content);
  await git(["add", file], cwd);
  await git(["commit", "-m", message], cwd);
}

describe("devspec release", () => {
  it(
    "computes patch bump from a fix: commit and writes CHANGELOG.md + annotated tag",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { backend: "go", pipeline: "github", git: true });
        // The init flow creates files; commit them to start clean.
        await git(["add", "-A"], root);
        await git(["commit", "-m", "chore: scaffold workspace"], root);

        await makeCommit(root, "a.go", "package a\n", "fix: handle nil pointer in foo");

        const r = await runCli(["release", "--yes"], root);
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toContain("v0.0.1");
        expect(r.stdout).toContain("patch bump");
        expect(r.stdout).toContain("✓ Tagged v0.0.1");

        const tag = await git(["describe", "--tags", "--abbrev=0"], root);
        expect(tag).toBe("v0.0.1");

        const changelog = await fs.readFile(path.join(root, "CHANGELOG.md"), "utf8");
        expect(changelog).toContain("## v0.0.1");
        expect(changelog).toContain("### Fixes");
        expect(changelog).toContain("handle nil pointer in foo");
      });
    }
  );

  it(
    "computes minor bump from a feat: commit",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { backend: "go", pipeline: "github", git: true });
        await git(["add", "-A"], root);
        await git(["commit", "-m", "chore: scaffold workspace"], root);

        await makeCommit(root, "a.go", "package a\n", "feat: add bookings endpoint");
        await makeCommit(root, "b.go", "package b\n", "fix: typo in error message");

        const r = await runCli(["release", "--yes"], root);
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toContain("minor bump");
        expect(r.stdout).toContain("v0.1.0");
        const changelog = await fs.readFile(path.join(root, "CHANGELOG.md"), "utf8");
        expect(changelog).toContain("### Features");
        expect(changelog).toContain("add bookings endpoint");
        expect(changelog).toContain("### Fixes");
      });
    }
  );

  it(
    "computes major bump from a feat!: breaking commit",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { backend: "go", pipeline: "github", git: true });
        await git(["add", "-A"], root);
        await git(["commit", "-m", "chore: scaffold workspace"], root);

        await makeCommit(root, "a.go", "package a\n", "feat!: drop legacy v1 API");

        const r = await runCli(["release", "--yes"], root);
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toContain("major bump");
        expect(r.stdout).toContain("v1.0.0");
        const changelog = await fs.readFile(path.join(root, "CHANGELOG.md"), "utf8");
        expect(changelog).toContain("### Breaking changes");
        expect(changelog).toContain("drop legacy v1 API");
      });
    }
  );

  it(
    "refuses on dirty working tree",
    { timeout: 30000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { backend: "go", pipeline: "github", git: true });
        await git(["add", "-A"], root);
        await git(["commit", "-m", "chore: scaffold workspace"], root);
        // Leave an uncommitted file
        await fs.writeFile(path.join(root, "stray.txt"), "uncommitted\n");

        const r = await runCli(["release", "--yes"], root);
        expect(r.exitCode).not.toBe(0);
        expect(r.stderr + r.stdout).toContain("uncommitted changes");
      });
    }
  );

  it(
    "--dry-run shows the bump and changelog without tagging",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { backend: "go", pipeline: "github", git: true });
        await git(["add", "-A"], root);
        await git(["commit", "-m", "chore: scaffold workspace"], root);
        await makeCommit(root, "a.go", "package a\n", "feat: add x");

        const r = await runCli(["release", "--dry-run"], root);
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toContain("v0.1.0");
        expect(r.stdout).toContain("--dry-run");
        // No tag created
        const tags = await git(["tag", "-l"], root);
        expect(tags).toBe("");
        // No CHANGELOG.md created
        expect(await fs.pathExists(path.join(root, "CHANGELOG.md"))).toBe(false);
      });
    }
  );

  it(
    "--bump major overrides commit-based computation",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { backend: "go", pipeline: "github", git: true });
        await git(["add", "-A"], root);
        await git(["commit", "-m", "chore: scaffold workspace"], root);
        // Only a fix:, but force major
        await makeCommit(root, "a.go", "package a\n", "fix: small thing");

        const r = await runCli(["release", "--bump", "major", "--yes"], root);
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toContain("major bump");
        expect(r.stdout).toContain("v1.0.0");
      });
    }
  );

  it(
    "prepends to existing CHANGELOG.md on second release",
    { timeout: 60000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { backend: "go", pipeline: "github", git: true });
        await git(["add", "-A"], root);
        await git(["commit", "-m", "chore: scaffold workspace"], root);

        await makeCommit(root, "a.go", "package a\n", "feat: a");
        const first = await runCli(["release", "--yes"], root);
        expect(first.exitCode).toBe(0);

        await makeCommit(root, "b.go", "package b\n", "fix: b");
        const second = await runCli(["release", "--yes"], root);
        expect(second.exitCode).toBe(0);

        const changelog = await fs.readFile(path.join(root, "CHANGELOG.md"), "utf8");
        // Newest at the top
        const v01 = changelog.indexOf("## v0.1.1");
        const v010 = changelog.indexOf("## v0.1.0");
        expect(v01).toBeGreaterThan(-1);
        expect(v010).toBeGreaterThan(v01);
      });
    }
  );
});
