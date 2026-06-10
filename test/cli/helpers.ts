import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "fs-extra";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CLI_ENTRY = path.join(REPO_ROOT, "src", "cli.ts");
const TSX_BIN = path.join(
  REPO_ROOT,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsx.cmd" : "tsx"
);

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function quoteForShell(arg: string): string {
  if (process.platform === "win32") {
    // cmd.exe needs surrounding double-quotes for any arg with whitespace or special chars
    if (/[\s"&|<>^]/.test(arg)) {
      return `"${arg.replace(/"/g, '""')}"`;
    }
    return arg;
  }
  // posix shell quoting
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

export function runCli(args: string[], cwd: string): Promise<RunResult> {
  return new Promise((resolve) => {
    const cmdLine = [TSX_BIN, CLI_ENTRY, ...args].map(quoteForShell).join(" ");
    execFile(
      cmdLine,
      [],
      {
        cwd,
        env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
        windowsHide: true,
        shell: true,
        maxBuffer: 10 * 1024 * 1024,
      },
      (err, stdout, stderr) => {
        if (err && "code" in err) {
          resolve({ exitCode: (err.code as number) ?? 1, stdout, stderr });
        } else if (err) {
          resolve({ exitCode: 1, stdout, stderr });
        } else {
          resolve({ exitCode: 0, stdout, stderr });
        }
      }
    );
  });
}

export async function withTempWorkspace<T>(
  fn: (root: string) => Promise<T>
): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "devspec-itest-"));
  try {
    return await fn(dir);
  } finally {
    await fs.remove(dir).catch(() => {});
  }
}

export async function setupWorkspace(
  root: string,
  options: {
    backend?: string;
    architecture?: string;
    methodology?: string;
    pipeline?: string;
    frontend?: string;
    plan?: string[];
    git?: boolean;
  } = {}
): Promise<void> {
  if (options.git) {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const exec = promisify(execFile);
    await exec("git", ["init", "-q", "-b", "main"], { cwd: root });
    await exec("git", ["config", "user.email", "test@example.com"], { cwd: root });
    await exec("git", ["config", "user.name", "DevSpec Test"], { cwd: root });
    await exec("git", ["config", "commit.gpgsign", "false"], { cwd: root });
    await exec("git", ["config", "tag.gpgsign", "false"], { cwd: root });
  }
  const backend = options.backend ?? "rust";
  const architecture = options.architecture ?? "clean-architecture";
  const methodology = options.methodology ?? "ddd";
  const initArgs = [
    "init",
    "--backend",
    backend,
    "--architecture",
    architecture,
    "--methodology",
    methodology,
  ];
  if (options.pipeline) {
    initArgs.push("--pipeline", options.pipeline);
  }
  if (options.frontend) {
    initArgs.push("--frontend", options.frontend);
  }
  const r = await runCli(initArgs, root);
  if (r.exitCode !== 0) {
    throw new Error(`setup init failed: ${r.stderr || r.stdout}`);
  }
  for (const title of options.plan ?? []) {
    const p = await runCli(["plan", title], root);
    if (p.exitCode !== 0) {
      throw new Error(`setup plan "${title}" failed: ${p.stderr || p.stdout}`);
    }
  }
}
