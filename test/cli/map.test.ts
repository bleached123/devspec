import path from "node:path";
import fs from "fs-extra";
import { describe, it, expect } from "vitest";
import { runCli, withTempWorkspace, setupWorkspace } from "./helpers.js";

describe("devspec map", () => {
  it(
    "emits L0 workspace, L1 change, L2 contract, L3 deps + arch maps",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, {
          backend: "go",
          architecture: "clean-architecture",
          methodology: "tdd",
          plan: ["Add bookings"],
        });

        const r = await runCli(["map"], root);
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toContain("map(s) written");

        const mapsDir = path.join(root, ".devspec", "maps");
        expect(await fs.pathExists(path.join(mapsDir, "workspace.md"))).toBe(true);
        expect(await fs.pathExists(path.join(mapsDir, "arch.md"))).toBe(true);
        expect(await fs.pathExists(path.join(mapsDir, "index.md"))).toBe(true);
        expect(await fs.pathExists(path.join(mapsDir, "change-add-bookings.md"))).toBe(true);
        expect(await fs.pathExists(path.join(mapsDir, "contract-add-bookings.md"))).toBe(true);
        expect(await fs.pathExists(path.join(mapsDir, "deps-add-bookings.md"))).toBe(true);
      });
    }
  );

  it(
    "workspace map carries L0 context + click drill-downs",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, {
          backend: "rust",
          architecture: "clean-architecture",
          methodology: "ddd",
          plan: ["First change", "Second change"],
        });

        const r = await runCli(["map"], root);
        expect(r.exitCode).toBe(0);

        const wsMap = await fs.readFile(
          path.join(root, ".devspec", "maps", "workspace.md"),
          "utf8"
        );
        expect(wsMap).toContain("L0 — Workspace map");
        expect(wsMap).toContain("```mermaid");
        expect(wsMap).toContain("flowchart TD");
        expect(wsMap).toContain("first-change");
        expect(wsMap).toContain("second-change");
        expect(wsMap).toContain("backend: `rust`");
        // Drill-down clicks present
        expect(wsMap).toContain('click Nfirst_change "change-first-change.md"');
        // Phase progression diagram
        expect(wsMap).toContain("stateDiagram-v2");
        expect(wsMap).toContain("sketch");
        expect(wsMap).toContain("production");
      });
    }
  );

  it(
    "each child level carries breadcrumb + workspace context",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, {
          backend: "dotnet",
          architecture: "clean-architecture",
          methodology: "ddd",
          pipeline: "github",
          plan: ["Add bookings"],
        });

        const r = await runCli(["map"], root);
        expect(r.exitCode).toBe(0);

        const change = await fs.readFile(
          path.join(root, ".devspec", "maps", "change-add-bookings.md"),
          "utf8"
        );
        // Breadcrumb back to workspace
        expect(change).toContain("[Workspace](workspace.md)");
        // Carried workspace context
        expect(change).toContain("backend: `dotnet`");
        expect(change).toContain("pipeline: `github`");
        // Self-contained intro
        expect(change).toContain("How to read this map");
        // Lifecycle state diagram
        expect(change).toContain("stateDiagram-v2");
        expect(change).toContain("discovery");
        expect(change).toContain("tasks");

        const contract = await fs.readFile(
          path.join(root, ".devspec", "maps", "contract-add-bookings.md"),
          "utf8"
        );
        expect(contract).toContain("L2 — Contract map");
        expect(contract).toContain("[Workspace](workspace.md)");
        expect(contract).toContain("[`add-bookings`](change-add-bookings.md)");
        expect(contract).toContain("How to read this map");
        expect(contract).toContain("backend: `dotnet`");

        const deps = await fs.readFile(
          path.join(root, ".devspec", "maps", "deps-add-bookings.md"),
          "utf8"
        );
        expect(deps).toContain("L3 — Dependency map");
        expect(deps).toContain("[Workspace](workspace.md)");
        expect(deps).toContain("[`add-bookings`](change-add-bookings.md)");
        // Empty design.md → friendly guidance
        expect(deps).toContain("No `## Dependencies` section");

        const arch = await fs.readFile(
          path.join(root, ".devspec", "maps", "arch.md"),
          "utf8"
        );
        expect(arch).toContain("L3 — Architecture map");
        expect(arch).toContain("[Workspace](workspace.md)");
        expect(arch).toContain("clean-architecture");
        expect(arch).toContain("Dependencies point");
      });
    }
  );

  it(
    "--change focuses on one change and skips workspace/arch refresh",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, {
          backend: "go",
          plan: ["First", "Second"],
        });

        const r = await runCli(["map", "--change", "second"], root);
        expect(r.exitCode).toBe(0);

        const mapsDir = path.join(root, ".devspec", "maps");
        // change-second files exist
        expect(await fs.pathExists(path.join(mapsDir, "change-second.md"))).toBe(true);
        expect(await fs.pathExists(path.join(mapsDir, "contract-second.md"))).toBe(true);
        // workspace/arch/index were NOT refreshed in --change mode
        expect(await fs.pathExists(path.join(mapsDir, "workspace.md"))).toBe(false);
      });
    }
  );

  it(
    "parses dependencies from design.md and flags paid commercial packages",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, {
          backend: "dotnet",
          plan: ["Add ui"],
        });

        // Write a design.md with a Dependencies section
        const designPath = path.join(root, ".devspec", "projects", "add-ui", "design.md");
        await fs.writeFile(
          designPath,
          [
            "# Design",
            "",
            "## Dependencies",
            "",
            "- **Serilog** v3.1 · MIT · 2026-04-12 · structured logging beyond Microsoft.Extensions.Logging defaults",
            "- **Telerik UI for Blazor** v6.0 · Commercial · 2026-03-01 · paid; escalated to user 💰",
            "",
          ].join("\n")
        );

        const r = await runCli(["map", "--change", "add-ui"], root);
        expect(r.exitCode).toBe(0);

        const deps = await fs.readFile(
          path.join(root, ".devspec", "maps", "deps-add-ui.md"),
          "utf8"
        );
        // Mermaid block with deps
        expect(deps).toContain("flowchart LR");
        expect(deps).toContain("Serilog");
        expect(deps).toContain("Telerik UI");
        // Telerik gets the paid class
        expect(deps).toMatch(/Telerik UI[\s\S]+?:::depPaid/);
        // Good dep gets the good class
        expect(deps).toMatch(/Serilog[\s\S]+?:::depGood/);
        // Table is generated too
        expect(deps).toContain("| `Serilog`");
        expect(deps).toContain("| `Telerik UI for Blazor`");
      });
    }
  );
});
