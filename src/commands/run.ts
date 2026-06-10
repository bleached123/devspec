import path from "node:path";
import { spawn } from "node:child_process";
import { Command } from "commander";
import chalk from "chalk";
import fs from "fs-extra";
import { requireWorkspaceRoot } from "../core/workspace.js";

export const runCommand = new Command("run")
  .description(
    "Run a command in the workspace's container if Docker is configured, otherwise run it locally. Use this from agents and scripts so commands are reproducible regardless of host setup."
  )
  .argument("<cmd...>", "Command to run (e.g. cargo test, pytest, dotnet build)")
  .option("--local", "Force local execution (skip container even if available)", false)
  .option("--service <name>", "docker-compose service to run inside", "dev")
  .allowUnknownOption()
  .action(async (cmdParts: string[], options: { local: boolean; service: string }) => {
    const root = await requireWorkspaceRoot();
    const command = cmdParts.join(" ");

    if (!command.trim()) {
      console.error(chalk.red("No command supplied. Usage: devspec run <cmd>..."));
      process.exitCode = 1;
      return;
    }

    const composeFile = path.join(root, "docker-compose.yml");
    const dockerfile = path.join(root, "Dockerfile");
    const hasDocker = (await fs.pathExists(composeFile)) && (await fs.pathExists(dockerfile));

    if (options.local || !hasDocker) {
      if (!options.local && !hasDocker) {
        console.log(
          chalk.dim(
            "(no Dockerfile/docker-compose.yml in workspace — falling back to local execution. Run `devspec env generate` to enable containerized runs.)"
          )
        );
      }
      const exitCode = await runLocal(command, root);
      process.exit(exitCode);
    }

    // Containerized path.
    const dockerArgs = [
      "compose",
      "run",
      "--rm",
      options.service,
      "sh",
      "-c",
      command,
    ];
    console.log(chalk.dim(`$ docker ${dockerArgs.join(" ")}`));
    const exitCode = await spawnInherit("docker", dockerArgs, root);
    if (exitCode === 127) {
      console.error(
        chalk.red(
          "docker not found on PATH. Install Docker, or pass --local to bypass containerization."
        )
      );
    }
    process.exit(exitCode);
  });

function runLocal(command: string, cwd: string): Promise<number> {
  const isWindows = process.platform === "win32";
  const shell = isWindows ? "cmd.exe" : "sh";
  const shellFlag = isWindows ? "/c" : "-c";
  return spawnInherit(shell, [shellFlag, command], cwd);
}

function spawnInherit(cmd: string, args: string[], cwd: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: "inherit",
      shell: false,
    });
    child.on("error", (err) => {
      const e = err as NodeJS.ErrnoException;
      if (e.code === "ENOENT") {
        resolve(127);
      } else {
        console.error(chalk.red(`spawn error: ${err.message}`));
        resolve(1);
      }
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}
