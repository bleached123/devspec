import path from "node:path";
import fs from "fs-extra";
import { describe, it, expect } from "vitest";
import { runCli, setupWorkspace, withTempWorkspace } from "./helpers.js";

async function writeDelta(
  root: string,
  slug: string,
  capability: string,
  content: string
): Promise<void> {
  const dir = path.join(root, ".devspec", "projects", slug, "deltas", capability);
  await fs.ensureDir(dir);
  await fs.writeFile(path.join(dir, "spec.md"), content);
}

describe("devspec map capability layer (L1.5)", () => {
  it(
    "emits capabilities/index.md when capabilities exist",
    { timeout: 60000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { plan: ["Add bookings"] });
        await runCli(["specs", "init", "user-auth"], root);
        await runCli(["specs", "init", "billing"], root);

        const r = await runCli(["map"], root);
        expect(r.exitCode).toBe(0);

        const indexPath = path.join(root, ".devspec", "maps", "capabilities", "index.md");
        expect(await fs.pathExists(indexPath)).toBe(true);
        const content = await fs.readFile(indexPath, "utf8");
        expect(content).toContain("user-auth");
        expect(content).toContain("billing");
        expect(content).toContain("workspace");
      });
    }
  );

  it(
    "emits per-capability drill-down files with current requirements",
    { timeout: 60000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { plan: ["Add bookings"] });
        await runCli(["specs", "init", "user-auth"], root);
        // Write some requirements directly to the main spec
        const mainSpec = path.join(root, ".devspec", "specs", "user-auth", "spec.md");
        await fs.writeFile(
          mainSpec,
          `# user-auth\n\n## Requirements\n\n### Requirement: Login\n\nbody\n\n### Requirement: Logout\n\nbody\n`
        );

        await runCli(["map"], root);

        const drillDown = path.join(root, ".devspec", "maps", "capabilities", "user-auth.md");
        expect(await fs.pathExists(drillDown)).toBe(true);
        const content = await fs.readFile(drillDown, "utf8");
        expect(content).toContain("Login");
        expect(content).toContain("Logout");
      });
    }
  );

  it(
    "lists active changes touching a capability with delta counts",
    { timeout: 60000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { plan: ["Add bookings"] });
        await runCli(["specs", "init", "user-auth"], root);
        await writeDelta(
          root,
          "add-bookings",
          "user-auth",
          `## ADDED Requirements\n\n### Requirement: New\n\nbody\n\n## MODIFIED Requirements\n\n### Requirement: Existing\n\nbody\n`
        );

        await runCli(["map"], root);
        const drillDown = path.join(root, ".devspec", "maps", "capabilities", "user-auth.md");
        const content = await fs.readFile(drillDown, "utf8");
        expect(content).toContain("Active changes");
        expect(content).toContain("add-bookings");
        // Counts: 1 added, 1 modified, 0 removed
        expect(content).toContain("| 1 | 1 | 0 |");
      });
    }
  );

  it(
    "workspace.md includes a Capabilities section when capabilities exist",
    { timeout: 60000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root);
        await runCli(["specs", "init", "user-auth"], root);

        await runCli(["map"], root);
        const wsMap = await fs.readFile(
          path.join(root, ".devspec", "maps", "workspace.md"),
          "utf8"
        );
        expect(wsMap).toContain("## Capabilities");
        expect(wsMap).toContain("capabilities/index.md");
      });
    }
  );

  it(
    "no capabilities/ directory when workspace has no capabilities",
    { timeout: 60000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root);
        await runCli(["map"], root);
        const capDir = path.join(root, ".devspec", "maps", "capabilities");
        expect(await fs.pathExists(capDir)).toBe(false);

        const wsMap = await fs.readFile(
          path.join(root, ".devspec", "maps", "workspace.md"),
          "utf8"
        );
        // No Capabilities section when none exist
        expect(wsMap).not.toContain("## Capabilities");
      });
    }
  );
});
