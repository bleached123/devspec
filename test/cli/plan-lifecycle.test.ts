import path from "node:path";
import fs from "fs-extra";
import YAML from "yaml";
import { describe, it, expect } from "vitest";
import { runCli, withTempWorkspace, setupWorkspace } from "./helpers.js";

describe("devspec plan", () => {
  it(
    "scaffolds 6 lifecycle docs + status.yaml",
    { timeout: 30000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root);
        const r = await runCli(["plan", "Add bookings"], root);
        expect(r.exitCode).toBe(0);
        const projectDir = path.join(root, ".devspec", "projects", "add-bookings");
        for (const stage of [
          "discovery",
          "proposal",
          "design",
          "contract",
          "alignment",
          "tasks",
        ]) {
          expect(await fs.pathExists(path.join(projectDir, `${stage}.md`))).toBe(true);
        }
        expect(await fs.pathExists(path.join(projectDir, "status.yaml"))).toBe(true);
        expect(r.stdout).toContain("next: fill in");
        expect(r.stdout).toContain("discovery");
      });
    }
  );

  it(
    "scaffolds contract.md with a commented capability frontmatter hint",
    { timeout: 30000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root);
        const r = await runCli(["plan", "Add bookings"], root);
        expect(r.exitCode).toBe(0);
        const contract = await fs.readFile(
          path.join(root, ".devspec", "projects", "add-bookings", "contract.md"),
          "utf8"
        );
        // The hint lives inside an HTML comment so the scaffolded contract has
        // no active frontmatter — existing parsers must see no behaviour change.
        expect(contract).toContain("Optional frontmatter");
        expect(contract).toContain("capability:");
        expect(contract).toContain("devspec specs init");
        // The contract starts with the comment, NOT active frontmatter delimiters
        expect(contract.startsWith("<!--")).toBe(true);
        // The `capability:` hint appears BEFORE the `# Contract` heading — i.e.
        // inside the leading comment block, not in the active body
        const titleIdx = contract.indexOf("# Contract");
        const capIdx = contract.indexOf("capability:");
        expect(capIdx).toBeGreaterThan(-1);
        expect(capIdx).toBeLessThan(titleIdx);
      });
    }
  );

  it(
    "refuses a duplicate slug",
    { timeout: 30000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root);
        const first = await runCli(["plan", "Add bookings"], root);
        expect(first.exitCode).toBe(0);
        const dup = await runCli(["plan", "Add bookings"], root);
        expect(dup.exitCode).not.toBe(0);
        expect(dup.stderr + dup.stdout).toMatch(/already exists/);
      });
    }
  );

  it(
    "fails when run outside a workspace",
    { timeout: 30000 },
    async () => {
      await withTempWorkspace(async (root) => {
        const r = await runCli(["plan", "Add bookings"], root);
        expect(r.exitCode).not.toBe(0);
        expect(r.stderr + r.stdout).toMatch(/No DevSpec workspace/);
      });
    }
  );
});

describe("devspec advance / next / complete / rewind", () => {
  it(
    "advance + next + complete chain works",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { plan: ["Add bookings"] });

        const adv = await runCli(["advance", "add-bookings", "discovery"], root);
        expect(adv.exitCode).toBe(0);
        expect(adv.stdout).toContain("discovery → done");
        expect(adv.stdout).toContain("next:");

        const statusFile = path.join(
          root,
          ".devspec",
          "projects",
          "add-bookings",
          "status.yaml"
        );
        const status = YAML.parse(await fs.readFile(statusFile, "utf8"));
        expect(status.stages.discovery).toBe("done");

        const next = await runCli(["next", "add-bookings"], root);
        expect(next.exitCode).toBe(0);
        expect(next.stdout).toContain("Next task");
        expect(next.stdout).toContain("tasks.md");

        const taskMatch = /text:\s*(.+)/.exec(next.stdout);
        expect(taskMatch).not.toBeNull();
        const taskText = taskMatch![1].trim();

        // Use the line-number form to avoid ambiguity in the DDD task template
        const lineMatch = /tasks\.md:(\d+)/.exec(next.stdout);
        expect(lineMatch).not.toBeNull();
        const lineNum = lineMatch![1];

        const done = await runCli(
          ["complete", "add-bookings", taskText, "--line", lineNum],
          root
        );
        expect(done.exitCode).toBe(0);
        expect(done.stdout).toContain("Marked done");

        const tasksMd = await fs.readFile(
          path.join(root, ".devspec", "projects", "add-bookings", "tasks.md"),
          "utf8"
        );
        expect(/\[x\]/i.test(tasksMd)).toBe(true);
      });
    }
  );

  it(
    "advance rejects an unknown stage",
    { timeout: 30000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { plan: ["Add bookings"] });
        const r = await runCli(["advance", "add-bookings", "wibble"], root);
        expect(r.exitCode).not.toBe(0);
        expect(r.stderr + r.stdout).toMatch(/Unknown stage/);
      });
    }
  );

  it(
    "rewind regresses stages and logs to alignment.md",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { plan: ["Add bookings"] });
        for (const stage of ["discovery", "proposal", "design", "contract"]) {
          await runCli(["advance", "add-bookings", stage], root);
        }

        const rw = await runCli(
          ["rewind", "add-bookings", "design", "--because", "design flaw discovered"],
          root
        );
        expect(rw.exitCode).toBe(0);
        expect(rw.stdout).toContain("rewound to design");

        const status = YAML.parse(
          await fs.readFile(
            path.join(root, ".devspec", "projects", "add-bookings", "status.yaml"),
            "utf8"
          )
        );
        expect(status.stages.design).toBe("pending");
        expect(status.stages.contract).toBe("pending");
        expect(status.stages.proposal).toBe("done");

        const alignment = await fs.readFile(
          path.join(root, ".devspec", "projects", "add-bookings", "alignment.md"),
          "utf8"
        );
        expect(alignment).toMatch(/rewound to.*design/);
        expect(alignment).toContain("design flaw discovered");
      });
    }
  );
});
