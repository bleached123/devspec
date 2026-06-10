import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Command } from "commander";
import chalk from "chalk";
import fs from "fs-extra";
import { requireWorkspaceRoot, devspecPath } from "../core/workspace.js";
import { cmd, nextStep } from "../core/hints.js";

const execFileAsync = promisify(execFile);

interface WorktreeInfo {
  slug: string | null;
  branch: string;
  path: string;
  head: string | null;
}

export const worktreeCommand = new Command("worktree").description(
  "Manage per-change git worktrees for parallel-agent isolation"
);

worktreeCommand
  .command("add")
  .description("Create a git worktree + branch for a change")
  .argument("<slug>", "Change slug (must exist under .devspec/projects/)")
  .option("--from <base>", "Base branch to fork from", "main")
  .option("--branch <name>", "Branch name (defaults to devspec/<slug>)")
  .action(
    async (slug: string, options: { from: string; branch?: string }) => {
      const root = await requireWorkspaceRoot();

      const projectDir = devspecPath(root, "projects", slug);
      if (!(await fs.pathExists(projectDir))) {
        console.error(
          chalk.red(`No change "${slug}" — run \`devspec plan "<title>"\` first.`)
        );
        process.exitCode = 1;
        return;
      }

      if (!(await isGitRepo(root))) {
        console.error(
          chalk.red(
            "Not inside a git repository. Run `git init && git commit -am init` first."
          )
        );
        process.exitCode = 1;
        return;
      }

      const branch = options.branch ?? `devspec/${slug}`;
      const wtPath = devspecPath(root, "worktrees", slug);
      const wtRel = path.relative(root, wtPath);

      if (await fs.pathExists(wtPath)) {
        console.error(chalk.red(`Worktree already exists at ${wtRel}.`));
        process.exitCode = 1;
        return;
      }

      await fs.ensureDir(devspecPath(root, "worktrees"));

      const branchExists = await branchExistsLocally(root, branch);

      try {
        const args = branchExists
          ? ["worktree", "add", wtPath, branch]
          : ["worktree", "add", "-b", branch, wtPath, options.from];
        await execFileAsync("git", args, { cwd: root });
      } catch (err) {
        console.error(chalk.red(`git worktree add failed:`));
        console.error(chalk.dim((err as { stderr?: string }).stderr ?? String(err)));
        process.exitCode = 1;
        return;
      }

      console.log(chalk.green(`✓ Worktree created`));
      console.log(`  path:   ${chalk.cyan(wtRel)}`);
      console.log(`  branch: ${chalk.cyan(branch)}`);
      if (!branchExists) {
        console.log(`  base:   ${chalk.dim(options.from)}`);
      } else {
        console.log(`  base:   ${chalk.dim("(branch already existed)")}`);
      }
      console.log("");
      nextStep(
        `cd ${wtRel}  →  ${cmd(`/loop /devspec:iterate ${slug}`)} in Claude Code (parallel-safe)`
      );
    }
  );

worktreeCommand
  .command("list")
  .description("List all DevSpec worktrees")
  .option("--json", "Emit machine-readable JSON", false)
  .action(async (options: { json: boolean }) => {
    const root = await requireWorkspaceRoot();

    if (!(await isGitRepo(root))) {
      console.error(chalk.red("Not inside a git repository."));
      process.exitCode = 1;
      return;
    }

    let porcelain: string;
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["worktree", "list", "--porcelain"],
        { cwd: root }
      );
      porcelain = stdout;
    } catch (err) {
      console.error(chalk.red(`git worktree list failed:`));
      console.error(chalk.dim((err as { stderr?: string }).stderr ?? String(err)));
      process.exitCode = 1;
      return;
    }

    const worktrees = parseWorktreeList(porcelain);
    // git may report worktree paths with forward or backward slashes depending
    // on the platform. Normalize both sides to forward slashes before matching.
    const devspecWts = worktrees
      .filter((wt) =>
        wt.path.replace(/\\/g, "/").includes("/.devspec/worktrees/")
      )
      .map((wt) => ({ ...wt, slug: path.basename(wt.path) }));

    if (options.json) {
      console.log(JSON.stringify(devspecWts, null, 2));
      return;
    }

    if (devspecWts.length === 0) {
      console.log(
        chalk.dim("No DevSpec worktrees. Run `devspec worktree add <slug>` to create one.")
      );
      return;
    }

    for (const wt of devspecWts) {
      console.log(`  ${chalk.cyan(wt.slug)}`);
      console.log(`    branch: ${wt.branch}`);
      console.log(`    path:   ${path.relative(root, wt.path)}`);
      if (wt.head) console.log(`    head:   ${chalk.dim(wt.head.slice(0, 7))}`);
    }
    console.log("");
    console.log(chalk.dim(`${devspecWts.length} worktree(s) — each isolates one change's implementation.`));
  });

worktreeCommand
  .command("remove")
  .description("Remove a DevSpec worktree (and optionally its branch)")
  .argument("<slug>", "Change slug")
  .option("--force", "Remove even with uncommitted changes", false)
  .option("--delete-branch", "Also delete the devspec/<slug> branch", false)
  .action(
    async (slug: string, options: { force: boolean; deleteBranch: boolean }) => {
      const root = await requireWorkspaceRoot();
      const wtPath = devspecPath(root, "worktrees", slug);
      const wtRel = path.relative(root, wtPath);

      if (!(await fs.pathExists(wtPath))) {
        console.error(chalk.red(`No worktree at ${wtRel}.`));
        process.exitCode = 1;
        return;
      }

      const branch = `devspec/${slug}`;

      try {
        const args = ["worktree", "remove"];
        if (options.force) args.push("--force");
        args.push(wtPath);
        await execFileAsync("git", args, { cwd: root });
        console.log(chalk.green(`✓ Worktree removed: ${wtRel}`));
      } catch (err) {
        console.error(chalk.red(`git worktree remove failed:`));
        console.error(chalk.dim((err as { stderr?: string }).stderr ?? String(err)));
        console.error(
          chalk.dim(
            "Tip: pass --force to discard uncommitted changes in the worktree."
          )
        );
        process.exitCode = 1;
        return;
      }

      if (options.deleteBranch) {
        try {
          await execFileAsync(
            "git",
            ["branch", options.force ? "-D" : "-d", branch],
            { cwd: root }
          );
          console.log(chalk.green(`✓ Branch ${branch} deleted`));
        } catch (err) {
          console.error(
            chalk.yellow(
              `Worktree removed but branch delete failed: ${(err as { stderr?: string }).stderr ?? String(err)}`
            )
          );
          console.error(
            chalk.dim(
              "Branch may still contain unmerged work. Use --force to delete anyway."
            )
          );
        }
      }
    }
  );

async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], { cwd });
    return true;
  } catch {
    return false;
  }
}

async function branchExistsLocally(cwd: string, branch: string): Promise<boolean> {
  try {
    await execFileAsync(
      "git",
      ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`],
      { cwd }
    );
    return true;
  } catch {
    return false;
  }
}

function parseWorktreeList(porcelain: string): WorktreeInfo[] {
  const worktrees: WorktreeInfo[] = [];
  let current: Partial<WorktreeInfo> | null = null;

  const flush = () => {
    if (current && current.path) {
      worktrees.push({
        slug: null,
        path: current.path,
        branch: current.branch ?? "(detached)",
        head: current.head ?? null,
      });
    }
  };

  for (const line of porcelain.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      flush();
      current = { path: line.slice("worktree ".length).trim() };
    } else if (current) {
      if (line.startsWith("branch ")) {
        current.branch = line
          .slice("branch ".length)
          .replace(/^refs\/heads\//, "")
          .trim();
      } else if (line.startsWith("HEAD ")) {
        current.head = line.slice("HEAD ".length).trim();
      } else if (line.trim() === "detached") {
        current.branch = "(detached)";
      }
    }
  }
  flush();
  return worktrees;
}
