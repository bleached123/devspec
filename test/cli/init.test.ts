import path from "node:path";
import fs from "fs-extra";
import { describe, it, expect } from "vitest";
import { runCli, withTempWorkspace } from "./helpers.js";

describe("devspec init", () => {
  it(
    "creates .devspec/ with devspec.yaml and standards inlined",
    { timeout: 30000 },
    async () => {
      await withTempWorkspace(async (root) => {
        const r = await runCli(
          ["init", "--backend", "rust", "--architecture", "clean-architecture", "--methodology", "ddd"],
          root
        );
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toContain("DevSpec initialised");
        expect(r.stdout).toContain("sketch");
        expect(await fs.pathExists(path.join(root, ".devspec", "devspec.yaml"))).toBe(true);
        expect(await fs.pathExists(path.join(root, ".devspec", "company", "tech-stack.yaml"))).toBe(true);
        expect(await fs.pathExists(path.join(root, ".devspec", "standards", "standards.md"))).toBe(true);
        const standards = await fs.readFile(
          path.join(root, ".devspec", "standards", "standards.md"),
          "utf8"
        );
        expect(standards).toContain("Rust conventions");
        expect(standards).toContain("Clean Architecture");
        expect(standards).toContain("Domain-Driven Design");
      });
    }
  );

  it(
    "rejects an unknown backend with a useful message",
    { timeout: 30000 },
    async () => {
      await withTempWorkspace(async (root) => {
        const r = await runCli(
          [
            "init",
            "--backend",
            "elixir",
            "--architecture",
            "layered",
            "--methodology",
            "lightweight",
          ],
          root
        );
        expect(r.exitCode).not.toBe(0);
        expect(r.stderr + r.stdout).toMatch(/Unknown backend "elixir"/);
        expect(r.stderr + r.stdout).toMatch(/Available:/);
      });
    }
  );

  it(
    "refuses to overwrite without --force",
    { timeout: 30000 },
    async () => {
      await withTempWorkspace(async (root) => {
        const first = await runCli(
          ["init", "--backend", "rust", "--architecture", "layered", "--methodology", "lightweight"],
          root
        );
        expect(first.exitCode).toBe(0);

        const second = await runCli(
          ["init", "--backend", "rust", "--architecture", "layered", "--methodology", "lightweight"],
          root
        );
        expect(second.exitCode).not.toBe(0);
        expect(second.stderr + second.stdout).toMatch(/already exists/);
      });
    }
  );

  it(
    "allows overwrite with --force",
    { timeout: 30000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await runCli(
          ["init", "--backend", "rust", "--architecture", "layered", "--methodology", "lightweight"],
          root
        );
        const r = await runCli(
          ["init", "--backend", "dotnet", "--architecture", "clean-architecture", "--methodology", "ddd", "--force"],
          root
        );
        expect(r.exitCode).toBe(0);
        const cfg = await fs.readFile(path.join(root, ".devspec", "devspec.yaml"), "utf8");
        expect(cfg).toContain("backend: dotnet");
        expect(cfg).toContain("architecture: clean-architecture");
      });
    }
  );
});
