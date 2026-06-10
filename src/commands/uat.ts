import { Command } from "commander";
import chalk from "chalk";
import fs from "fs-extra";
import { requireWorkspaceRoot } from "../core/workspace.js";
import { loadUat, uatPath, writeUat, STARTER_UAT_YAML } from "../core/uat.js";
import type { UatCriterion, UatStatus } from "../core/coherence/types.js";
import { cmd, nextStep } from "../core/hints.js";

export const uatCommand = new Command("uat").description(
  "Manage workspace-level user acceptance criteria"
);

uatCommand
  .command("init")
  .description("Create an empty uat.yaml with a starter criterion")
  .option("--force", "Overwrite an existing uat.yaml", false)
  .action(async (options: { force: boolean }) => {
    const root = await requireWorkspaceRoot();
    const file = uatPath(root);
    if ((await fs.pathExists(file)) && !options.force) {
      console.error(
        chalk.red(`uat.yaml already exists. Use --force to overwrite.`)
      );
      process.exitCode = 1;
      return;
    }
    await fs.writeFile(file, STARTER_UAT_YAML);
    console.log(chalk.green(`Created uat.yaml. Edit it to add real criteria.`));
    nextStep(
      `edit .devspec/uat.yaml, then ${cmd("devspec uat list")} to confirm`
    );
  });

uatCommand
  .command("list")
  .description("List UAT criteria and their statuses")
  .option("--json", "Emit machine-readable JSON", false)
  .action(async (options: { json: boolean }) => {
    const root = await requireWorkspaceRoot();
    const criteria = await loadUat(root);
    if (criteria === null) {
      if (options.json) {
        console.log("null");
      } else {
        console.log(chalk.yellow("uat.yaml does not exist. Run `devspec uat init`."));
      }
      process.exitCode = 1;
      return;
    }
    if (options.json) {
      console.log(JSON.stringify(criteria, null, 2));
      return;
    }
    if (criteria.length === 0) {
      console.log(chalk.dim("No criteria defined yet."));
      return;
    }
    for (const c of criteria) {
      console.log(`  ${badge(c.status)}  ${c.name}`);
      if (c.linkedChanges.length > 0) {
        console.log(chalk.dim(`        linked: ${c.linkedChanges.join(", ")}`));
      }
      if (c.signedOffBy) {
        console.log(chalk.dim(`        ${c.signedOffAt} by ${c.signedOffBy}`));
      }
      if (c.notes) {
        console.log(chalk.dim(`        note: ${c.notes}`));
      }
    }
    console.log("");
    const counts = countByStatus(criteria);
    console.log(
      chalk.dim(
        `${criteria.length} total — ${counts.passed} passed, ${counts.pending} pending, ${counts.failed} failed`
      )
    );
  });

uatCommand
  .command("pass")
  .description("Mark a UAT criterion as passed")
  .argument("<name>", "Criterion name (or unique substring)")
  .option("--by <user>", "Who signed off")
  .option("--note <text>", "Optional note")
  .action(async (name: string, options: { by?: string; note?: string }) => {
    await mutate(name, "passed", options);
  });

uatCommand
  .command("fail")
  .description("Mark a UAT criterion as failed")
  .argument("<name>", "Criterion name (or unique substring)")
  .option("--by <user>", "Who reported the failure")
  .option("--note <text>", "Failure details")
  .action(async (name: string, options: { by?: string; note?: string }) => {
    await mutate(name, "failed", options);
  });

uatCommand
  .command("reset")
  .description("Reset a UAT criterion to pending (clears sign-off)")
  .argument("<name>", "Criterion name (or unique substring)")
  .action(async (name: string) => {
    await mutate(name, "pending", {});
  });

async function mutate(
  needle: string,
  status: UatStatus,
  options: { by?: string; note?: string }
): Promise<void> {
  const root = await requireWorkspaceRoot();
  const criteria = await loadUat(root);
  if (criteria === null) {
    console.error(chalk.red("uat.yaml does not exist. Run `devspec uat init`."));
    process.exitCode = 1;
    return;
  }
  const lowerNeedle = needle.toLowerCase();
  const matches = criteria.filter((c) => c.name.toLowerCase().includes(lowerNeedle));
  if (matches.length === 0) {
    console.error(chalk.red(`No criterion matching "${needle}".`));
    process.exitCode = 1;
    return;
  }
  if (matches.length > 1) {
    console.error(chalk.red(`Ambiguous: "${needle}" matches ${matches.length} criteria.`));
    for (const m of matches) console.error(`  ${m.name}`);
    process.exitCode = 1;
    return;
  }
  const target = matches[0];
  target.status = status;
  if (status === "pending") {
    target.signedOffBy = "";
    target.signedOffAt = "";
  } else {
    target.signedOffBy = options.by ?? "";
    target.signedOffAt = new Date().toISOString().slice(0, 10);
  }
  if (options.note !== undefined) target.notes = options.note;
  await writeUat(root, criteria);
  console.log(chalk.green(`${target.name} → ${status}`));
  const allPassed = criteria.every((c) => c.status === "passed");
  if (status === "passed" && allPassed) {
    nextStep(
      `all UAT passed — ${cmd("devspec phase --set production")} to enable strict mode`
    );
  } else if (status === "failed") {
    nextStep(
      `consider ${cmd("devspec rewind <slug> <stage> --because \"...\"")} to walk a change back for fixes`
    );
  } else {
    nextStep(cmd("devspec phase"));
  }
}

function badge(status: UatStatus): string {
  switch (status) {
    case "passed":
      return chalk.green("PASS");
    case "failed":
      return chalk.red("FAIL");
    default:
      return chalk.yellow("....");
  }
}

function countByStatus(criteria: UatCriterion[]): {
  passed: number;
  pending: number;
  failed: number;
} {
  let passed = 0;
  let pending = 0;
  let failed = 0;
  for (const c of criteria) {
    if (c.status === "passed") passed++;
    else if (c.status === "failed") failed++;
    else pending++;
  }
  return { passed, pending, failed };
}
