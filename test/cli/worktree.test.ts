import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "fs-extra";
import { describe, it, expect } from "vitest";
import { runCli, withTempWorkspace, setupWorkspace } from "./helpers.js";

const execFileAsync = promisify(execFile);

async function gitInit(root: string): Promise<void> {
  await execFileAsync("git", ["init", "-b", "main"], { cwd: root });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  await execFileAsync("git", ["config", "user.name", "Test"], { cwd: root });
  await execFileAsync("git", ["config", "commit.gpgsign", "false"], { cwd: root });
  await execFileAsync("git", ["add", "-A"], { cwd: root });
  await execFileAsync("git", ["commit", "-m", "init"], { cwd: root });
}

describe("devspec worktree", () => {
  it(
    "refuses to add a worktree when not inside a git repo",
    { timeout: 30000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { plan: ["Add bookings"] });
        const r = await runCli(["worktree", "add", "add-bookings"], root);
        expect(r.exitCode).not.toBe(0);
        expect(r.stderr + r.stdout).toMatch(/Not inside a git repository/);
      });
    }
  );

  it(
    "refuses to add a worktree for a non-existent change",
    { timeout: 30000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root);
        await gitInit(root);
        const r = await runCli(["worktree", "add", "no-such-change"], root);
        expect(r.exitCode).not.toBe(0);
        expect(r.stderr + r.stdout).toMatch(/No change "no-such-change"/);
      });
    }
  );

  it(
    "adds, lists, then removes a worktree",
    { timeout: 60000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { plan: ["Add bookings"] });
        await gitInit(root);

        const add = await runCli(["worktree", "add", "add-bookings"], root);
        expect(add.exitCode).toBe(0);
        expect(add.stdout).toContain("Worktree created");

        const wtPath = path.join(root, ".devspec", "worktrees", "add-bookings");
        expect(await fs.pathExists(wtPath)).toBe(true);

        const list = await runCli(["worktree", "list"], root);
        expect(list.exitCode).toBe(0);
        expect(list.stdout).toContain("add-bookings");
        expect(list.stdout).toContain("devspec/add-bookings");

        const remove = await runCli(
          ["worktree", "remove", "add-bookings", "--delete-branch"],
          root
        );
        expect(remove.exitCode).toBe(0);
        expect(remove.stdout).toContain("Worktree removed");
        expect(remove.stdout).toContain("Branch devspec/add-bookings deleted");

        expect(await fs.pathExists(wtPath)).toBe(false);
      });
    }
  );

  it(
    "list reports empty when no worktrees exist",
    { timeout: 30000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root);
        await gitInit(root);
        const r = await runCli(["worktree", "list"], root);
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toContain("No DevSpec worktrees");
      });
    }
  );
});
