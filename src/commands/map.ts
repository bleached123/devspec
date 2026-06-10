import path from "node:path";
import { watch as fsWatch } from "node:fs";
import { Command } from "commander";
import chalk from "chalk";
import fs from "fs-extra";
import { requireWorkspaceRoot, devspecPath } from "../core/workspace.js";
import { loadWorkspaceState, type WorkspaceState } from "../core/phase.js";
import { runCoherence } from "../core/coherence/runner.js";
import { extractApiMethods } from "../core/contract.js";
import { targetSourceName, targetTestName } from "../core/templates.js";
import { LIFECYCLE_STAGES, type ChangeState } from "../core/coherence/types.js";
import { nextStep } from "../core/hints.js";
import {
  capabilitySpecPath,
  listCapabilities,
  listDeltas,
  parseCapabilitySpec,
  parseDeltaFile,
} from "../core/capability.js";

export const mapCommand = new Command("map")
  .description(
    "Generate Mermaid visualization maps of the workspace (L0 workspace → L1 change → L2 contract → L3 arch + deps)"
  )
  .option("--change <slug>", "Only generate maps for this change (skips L0 + arch refresh)")
  .option("--out <dir>", "Output directory (default .devspec/maps/)")
  .option("--watch", "Regenerate on every change to .devspec/projects/ or source files", false)
  .action(
    async (options: {
      change?: string;
      out?: string;
      watch: boolean;
    }) => {
      const root = await requireWorkspaceRoot();
      const outDir = options.out
        ? path.resolve(root, options.out)
        : devspecPath(root, "maps");

      await renderAll(root, outDir, options.change);

      if (!options.watch) {
        nextStep(
          `open ${path.relative(root, path.join(outDir, "index.md"))} in your editor — VS Code's markdown preview hot-reloads Mermaid on save`
        );
        return;
      }

      console.log(chalk.dim("watching for changes — Ctrl-C to stop"));
      await watchAndRender(root, outDir, options.change);
    }
  );

async function renderAll(
  root: string,
  outDir: string,
  onlyChange?: string
): Promise<void> {
  await fs.ensureDir(outDir);

  const workspace = await loadWorkspaceState(root);
  const targets = onlyChange
    ? workspace.changes.filter((c) => c.slug === onlyChange)
    : workspace.changes.filter((c) => !c.status.archived);

  const written: string[] = [];

  // Capabilities list — used by L0 (workspace.md link section) and L1.5 (capability layer)
  const capabilities = onlyChange ? [] : await listCapabilities(root);

  if (!onlyChange) {
    await fs.writeFile(
      path.join(outDir, "workspace.md"),
      renderWorkspaceMap(workspace, capabilities.length)
    );
    written.push("workspace.md");
    await fs.writeFile(path.join(outDir, "arch.md"), renderArchMap(workspace));
    written.push("arch.md");
  }

  for (const change of targets) {
    const report = await runCoherence(change);
    const blockingHere = workspace.changeBlocking.get(change.slug) ?? 0;
    const warningHere = workspace.changeWarning.get(change.slug) ?? 0;
    const changeMap = renderChangeMap(workspace, change, report, blockingHere, warningHere);
    const contractMap = renderContractMap(workspace, change, report);
    const depsMap = renderDepsMap(workspace, change);
    await fs.writeFile(path.join(outDir, `change-${change.slug}.md`), changeMap);
    await fs.writeFile(path.join(outDir, `contract-${change.slug}.md`), contractMap);
    await fs.writeFile(path.join(outDir, `deps-${change.slug}.md`), depsMap);
    written.push(
      `change-${change.slug}.md`,
      `contract-${change.slug}.md`,
      `deps-${change.slug}.md`
    );
  }

  if (!onlyChange) {
    await fs.writeFile(path.join(outDir, "index.md"), renderIndex(workspace));
    written.push("index.md");

    // L1.5 — capability index + per-capability drill-downs (uses the capabilities list collected above)
    if (capabilities.length > 0) {
      const capDir = path.join(outDir, "capabilities");
      await fs.ensureDir(capDir);

      // Gather contributors per capability (active + archived)
      const contribByCap = await collectCapabilityContributors(root, capabilities);

      await fs.writeFile(
        path.join(capDir, "index.md"),
        renderCapabilityIndex(workspace, capabilities, contribByCap)
      );
      written.push("capabilities/index.md");

      for (const cap of capabilities) {
        const mainSpecPath = capabilitySpecPath(root, cap);
        const raw = (await fs.pathExists(mainSpecPath))
          ? await fs.readFile(mainSpecPath, "utf8")
          : "";
        const spec = parseCapabilitySpec(raw, cap);
        await fs.writeFile(
          path.join(capDir, `${cap}.md`),
          renderCapabilityDrillDown(workspace, cap, spec, contribByCap.get(cap) ?? [])
        );
        written.push(`capabilities/${cap}.md`);
      }
    }
  }

  const ts = new Date().toISOString().replace("T", " ").substring(0, 19);
  console.log(chalk.green(`✓ ${written.length} map(s) written to ${path.relative(root, outDir)}/  (${ts})`));
  for (const f of written) {
    console.log(chalk.dim(`  ${f}`));
  }
}

async function watchAndRender(
  root: string,
  outDir: string,
  onlyChange?: string
): Promise<void> {
  // node:fs.watch with recursive:true is supported on Linux 24+, macOS, Windows
  // (recursive on Linux requires Node 20+). Fall back gracefully on older Linux.
  const projectsDir = devspecPath(root, "projects");
  const watchTargets = [
    devspecPath(root),
    ...(await collectSourceWatchRoots(root)),
  ];

  let pending = false;
  let lastRun = Promise.resolve();
  const trigger = () => {
    if (pending) return;
    pending = true;
    lastRun = lastRun
      .then(async () => {
        await new Promise((r) => setTimeout(r, 200));
        pending = false;
        try {
          await renderAll(root, outDir, onlyChange);
        } catch (err) {
          console.error(chalk.red(`map error: ${(err as Error).message}`));
        }
      });
  };

  for (const target of watchTargets) {
    if (!(await fs.pathExists(target))) continue;
    try {
      const watcher = fsWatch(target, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        // Ignore changes to the maps/ output itself to avoid feedback loops
        const filenameStr = filename.toString();
        if (filenameStr.includes("maps") && filenameStr.endsWith(".md")) return;
        trigger();
      });
      // Keep the watcher alive; let process termination close it
      process.on("SIGINT", () => {
        watcher.close();
        process.exit(0);
      });
    } catch (err) {
      console.error(
        chalk.yellow(`watch warning: could not watch ${target} (${(err as Error).message})`)
      );
    }
  }

  // Keep the process alive
  await new Promise(() => {});
}

async function collectSourceWatchRoots(root: string): Promise<string[]> {
  const candidates = ["src", "lib", "app", "internal", "cmd", "tests", "test"];
  const out: string[] = [];
  for (const c of candidates) {
    const p = path.join(root, c);
    if (await fs.pathExists(p)) out.push(p);
  }
  return out;
}

// ─── L0: workspace ─────────────────────────────────────────────────────────

function renderWorkspaceMap(ws: WorkspaceState, capabilityCount = 0): string {
  const lines: string[] = [];
  lines.push("# L0 — Workspace map");
  lines.push("");
  lines.push("> _The top-level view. Every active change is a box; drill in by clicking._");
  lines.push("");
  lines.push(workspaceContextBlock(ws));
  lines.push("");
  lines.push("**How to read this map**: the workspace is the blue node. Each active change hangs off it with two pieces of state — *how many lifecycle stages are done* (out of 6) and *whether spec/code drift is clean*. Green means clean, amber means warnings, red means blocking, purple means all 6 stages done. Click a change to drill into its lifecycle.");
  lines.push("");
  lines.push("```mermaid");
  lines.push("flowchart TD");
  lines.push(
    `    WS["workspace<br/><i>phase: ${ws.effectivePhase}</i><br/><i>${ws.changes.filter((c) => !c.status.archived).length} active</i>"]:::workspace`
  );

  const active = ws.changes.filter((c) => !c.status.archived);
  for (const c of active) {
    const id = nodeId(c.slug);
    const done = stageDoneCount(c);
    const block = ws.changeBlocking.get(c.slug) ?? 0;
    const warn = ws.changeWarning.get(c.slug) ?? 0;
    const klass =
      block > 0 ? "changeRed" : warn > 0 ? "changeAmber" : done === LIFECYCLE_STAGES.length ? "changeDone" : "changeGreen";
    const drift =
      block > 0 ? `${block} block` : warn > 0 ? `${warn} warn` : "clean";
    lines.push(
      `    WS --> ${id}["${escapeLabel(c.slug)}<br/>${done}/${LIFECYCLE_STAGES.length} stages<br/>${drift}"]:::${klass}`
    );
    lines.push(`    click ${id} "change-${c.slug}.md" "Open ${c.slug}"`);
  }

  if (active.length === 0) {
    lines.push(`    EMPTY["no active changes<br/><i>devspec plan \"&lt;title&gt;\"</i>"]:::empty`);
    lines.push("    WS --> EMPTY");
  }

  lines.push("");
  lines.push("    classDef workspace fill:#1f6feb,color:#fff,stroke:#1f6feb");
  lines.push("    classDef changeGreen fill:#3fb950,color:#000,stroke:#2ea043");
  lines.push("    classDef changeAmber fill:#d29922,color:#000,stroke:#bb8009");
  lines.push("    classDef changeRed fill:#f85149,color:#fff,stroke:#da3633");
  lines.push("    classDef changeDone fill:#8957e5,color:#fff,stroke:#6e40c9");
  lines.push("    classDef empty fill:#21262d,color:#8b949e,stroke:#30363d");
  lines.push("```");
  lines.push("");
  lines.push("## Phase progression");
  lines.push("");
  lines.push("```mermaid");
  lines.push("stateDiagram-v2");
  lines.push("    direction LR");
  const phases: Array<{ id: string; label: string }> = [
    { id: "sketch", label: "sketch" },
    { id: "design", label: "design" },
    { id: "contract", label: "contract" },
    { id: "build", label: "build" },
    { id: "ready", label: "ready" },
    { id: "uat", label: "uat" },
    { id: "production", label: "production" },
  ];
  lines.push(`    [*] --> ${phases[0].id}`);
  for (let i = 0; i < phases.length - 1; i++) {
    lines.push(`    ${phases[i].id} --> ${phases[i + 1].id}`);
  }
  lines.push(`    ${phases[phases.length - 1].id} --> [*]`);
  lines.push(`    note right of ${ws.effectivePhase}`);
  lines.push(`      ← you are here`);
  lines.push(`    end note`);
  lines.push("```");
  lines.push("");
  lines.push("## Active changes");
  lines.push("");
  if (active.length === 0) {
    lines.push("_None yet — run `devspec plan \"<title>\"` to scaffold a change._");
  } else {
    for (const c of active) {
      const done = stageDoneCount(c);
      const block = ws.changeBlocking.get(c.slug) ?? 0;
      const warn = ws.changeWarning.get(c.slug) ?? 0;
      const drift =
        block > 0 ? `🔴 ${block} blocking` : warn > 0 ? `🟡 ${warn} warning` : "🟢 clean";
      lines.push(
        `- [\`${c.slug}\`](change-${c.slug}.md) — ${done}/${LIFECYCLE_STAGES.length} stages · ${drift}`
      );
    }
  }
  if (capabilityCount > 0) {
    lines.push("");
    lines.push("## Capabilities");
    lines.push("");
    lines.push(
      `${capabilityCount} living capability spec${capabilityCount === 1 ? "" : "s"} — see [capabilities/index.md](capabilities/index.md).`
    );
  }

  lines.push("");
  lines.push("---");
  lines.push("_Drill down: click a change node above, or follow the links. Regenerate with `devspec map`._");
  return lines.join("\n") + "\n";
}

// ─── L1: per-change ────────────────────────────────────────────────────────

function renderChangeMap(
  ws: WorkspaceState,
  change: ChangeState,
  report: Awaited<ReturnType<typeof runCoherence>>,
  blocking: number,
  warning: number
): string {
  const lines: string[] = [];
  lines.push(`# L1 — Change map: \`${change.slug}\``);
  lines.push("");
  lines.push(breadcrumb(["[Workspace](workspace.md)", `**\`${change.slug}\`**`]));
  lines.push("");
  lines.push(`> _Lifecycle progress and coherence health for one change._`);
  lines.push("");
  lines.push(workspaceContextBlock(ws));
  lines.push("");
  lines.push(`**Change title**: ${change.title}`);
  const done = stageDoneCount(change);
  const driftWord =
    blocking > 0 ? `🔴 ${blocking} blocking drift` : warning > 0 ? `🟡 ${warning} warning(s)` : "🟢 clean";
  lines.push(`**This change**: ${done}/${LIFECYCLE_STAGES.length} stages done · ${driftWord} · ${change.tests.length} contract test(s)`);
  lines.push("");
  lines.push("**How to read this map**: a DevSpec change walks through six stages — *discovery → proposal → design → contract → alignment → tasks*. The state diagram below shows which stages are done (✓), in progress (…) or pending (○). Below that, the coherence diagram shows which (if any) rules are flagging drift between the spec docs and the source code. Findings below the diagram give the actionable details.");
  lines.push("");
  lines.push("## Lifecycle");
  lines.push("");
  lines.push("```mermaid");
  lines.push("stateDiagram-v2");
  lines.push("    direction LR");
  lines.push("    [*] --> discovery");
  for (let i = 0; i < LIFECYCLE_STAGES.length - 1; i++) {
    const from = LIFECYCLE_STAGES[i];
    const to = LIFECYCLE_STAGES[i + 1];
    const fromStatus = change.status.stages[from];
    const arrow = fromStatus === "done" ? "✓" : fromStatus === "in_progress" ? "…" : "○";
    lines.push(`    ${from} --> ${to}: ${arrow}`);
  }
  lines.push(`    ${LIFECYCLE_STAGES[LIFECYCLE_STAGES.length - 1]} --> [*]`);
  // Highlight the current stage
  const inProgress = LIFECYCLE_STAGES.find((s) => change.status.stages[s] !== "done");
  if (inProgress) {
    lines.push(`    note right of ${inProgress}`);
    lines.push(`      current`);
    lines.push(`    end note`);
  }
  lines.push("```");
  lines.push("");
  lines.push("| Stage | Status | Doc |");
  lines.push("|---|---|---|");
  for (const stage of LIFECYCLE_STAGES) {
    const status = change.status.stages[stage];
    const icon = status === "done" ? "✓" : status === "in_progress" ? "…" : "○";
    const doc = change.docs[stage];
    const docTag = doc.isEmpty ? "_empty_" : doc.isTemplateOnly ? "_template only_" : "✏";
    lines.push(`| \`${stage}\` | ${icon} ${status} | ${docTag} |`);
  }

  lines.push("");
  lines.push("## Coherence");
  lines.push("");
  lines.push("```mermaid");
  lines.push("flowchart LR");
  lines.push(`    SRC["change<br/>${change.slug}"]:::src`);
  if (report.drifts.length === 0) {
    lines.push(`    SRC --> OK["✓ no drift<br/>${LIFECYCLE_STAGES.length} stages, ${change.tests.length} tests"]:::ok`);
  } else {
    const byRule = new Map<string, { count: number; severity: string; sample: string }>();
    for (const d of report.drifts) {
      const prev = byRule.get(d.rule);
      byRule.set(d.rule, {
        count: (prev?.count ?? 0) + 1,
        severity: d.severity,
        sample: prev?.sample ?? d.message,
      });
    }
    let i = 0;
    for (const [rule, info] of byRule) {
      const id = `R${i++}`;
      const klass = info.severity === "block" ? "drift-block" : "drift-warn";
      const icon = info.severity === "block" ? "🔴" : "🟡";
      lines.push(
        `    SRC --> ${id}["${icon} ${rule}<br/>${info.count} finding(s)"]:::${klass}`
      );
    }
  }
  lines.push("");
  lines.push("    classDef src fill:#1f6feb,color:#fff");
  lines.push("    classDef ok fill:#3fb950,color:#000");
  lines.push("    classDef drift-block fill:#f85149,color:#fff");
  lines.push("    classDef drift-warn fill:#d29922,color:#000");
  lines.push("```");
  lines.push("");
  if (report.drifts.length > 0) {
    lines.push("### Findings");
    lines.push("");
    for (const d of report.drifts) {
      const icon = d.severity === "block" ? "🔴" : "🟡";
      lines.push(`- ${icon} **${d.rule}**: ${d.message}`);
    }
    lines.push("");
  }
  lines.push("## Drill down");
  lines.push("");
  lines.push(`- [\`contract-${change.slug}.md\`](contract-${change.slug}.md) — API methods → source mapping, test status`);
  lines.push(`- [\`deps-${change.slug}.md\`](deps-${change.slug}.md) — dependencies introduced by this change`);
  lines.push(`- [\`workspace.md\`](workspace.md) — back to workspace map`);
  lines.push("");
  lines.push("---");
  lines.push("_Regenerate with `devspec map --change " + change.slug + "`._");
  return lines.join("\n") + "\n";
}

// ─── L2: contract ──────────────────────────────────────────────────────────

function renderContractMap(
  ws: WorkspaceState,
  change: ChangeState,
  report: Awaited<ReturnType<typeof runCoherence>>
): string {
  const lines: string[] = [];
  lines.push(`# L2 — Contract map: \`${change.slug}\``);
  lines.push("");
  lines.push(
    breadcrumb([
      "[Workspace](workspace.md)",
      `[\`${change.slug}\`](change-${change.slug}.md)`,
      "**Contract**",
    ])
  );
  lines.push("");
  lines.push("> _The single source of truth: every API method the change promises, every test that exercises it, and where each lives in source._");
  lines.push("");
  lines.push(workspaceContextBlock(ws));
  lines.push("");

  const apiMethods = extractApiMethods(change.docs.contract.raw);
  const tests = change.tests;
  const impl = tests.filter(
    (t) => change.sourceIndex.identifiers.has(targetTestName(t.name, change.backend))
  ).length;
  const apiFound = apiMethods.filter((m) =>
    change.sourceIndex.identifiers.has(targetSourceName(m.name, change.backend))
  ).length;
  lines.push(
    `**Contract status**: ${apiMethods.length} API method(s) declared (${apiFound} found in source) · ${tests.length} test(s) declared (${impl} implemented in source)`
  );
  const blockingCount = report.drifts.filter((d) => d.severity === "block").length;
  if (blockingCount > 0) {
    lines.push(`**Drift**: 🔴 ${blockingCount} blocking finding(s) — see [\`change-${change.slug}.md\`](change-${change.slug}.md#coherence)`);
  }
  lines.push("");
  lines.push("**How to read this map**: the **API surface** below shows interfaces and methods declared in the TypeScript pseudocode block of `contract.md`. Methods labelled `«not found»` aren't yet implemented in source. The **tests → implementation** flowchart maps each YAML test to the source function that satisfies it (or flags it as missing). The table at the bottom is the same information sorted by test, ready to copy into a stand-up.");
  lines.push("");
  lines.push("## API surface (from `contract.md`)");
  lines.push("");
  if (apiMethods.length === 0) {
    lines.push("_No TypeScript pseudocode API found in contract.md. Add a `\\`\\`\\`ts` fence with `interface` or top-level functions._");
  } else {
    lines.push("```mermaid");
    lines.push("classDiagram");
    const interfaces = new Map<string, typeof apiMethods>();
    const topLevel: typeof apiMethods = [];
    for (const m of apiMethods) {
      if (m.inInterface) {
        const existing = interfaces.get(m.inInterface) ?? [];
        existing.push(m);
        interfaces.set(m.inInterface, existing);
      } else {
        topLevel.push(m);
      }
    }
    for (const [iface, methods] of interfaces) {
      lines.push(`    class ${iface} {`);
      for (const m of methods) {
        const sourceName = targetSourceName(m.name, change.backend);
        const found = change.sourceIndex.identifiers.has(sourceName);
        const tag = found ? "" : "  «not found»";
        lines.push(`        +${m.name}()${tag}`);
      }
      lines.push("    }");
    }
    if (topLevel.length > 0) {
      lines.push(`    class Module {`);
      for (const m of topLevel) {
        const sourceName = targetSourceName(m.name, change.backend);
        const found = change.sourceIndex.identifiers.has(sourceName);
        const tag = found ? "" : "  «not found»";
        lines.push(`        +${m.name}()${tag}`);
      }
      lines.push("    }");
    }
    lines.push("```");
  }
  lines.push("");
  lines.push("## Tests → implementation");
  lines.push("");
  if (tests.length === 0) {
    lines.push("_No tests in contract.md yet. Add a `\\`\\`\\`yaml tests` fence._");
  } else {
    lines.push("```mermaid");
    lines.push("flowchart LR");
    let i = 0;
    for (const t of tests) {
      const id = `T${i++}`;
      const expected = targetTestName(t.name, change.backend);
      const found = change.sourceIndex.identifiers.get(expected);
      if (found && found.length > 0) {
        const entry = found[0];
        const klass = entry.kind === "function" ? "impl-ok" : "impl-stub";
        const filename = path.basename(entry.file);
        lines.push(
          `    ${id}["${escapeLabel(t.name)}"] --> ${id}_F["${escapeLabel(entry.name)}<br/>${escapeLabel(filename)}"]:::${klass}`
        );
      } else {
        lines.push(
          `    ${id}["${escapeLabel(t.name)}"] -.->|missing| ${id}_X["⚠ not implemented"]:::impl-missing`
        );
      }
    }
    lines.push("");
    lines.push("    classDef impl-ok fill:#3fb950,color:#000");
    lines.push("    classDef impl-stub fill:#d29922,color:#000");
    lines.push("    classDef impl-missing fill:#f85149,color:#fff");
    lines.push("```");
  }
  lines.push("");
  lines.push("## Test list");
  lines.push("");
  if (tests.length === 0) {
    lines.push("_No tests._");
  } else {
    lines.push("| Name | Given | When | Then | Source name |");
    lines.push("|---|---|---|---|---|");
    for (const t of tests) {
      const expected = targetTestName(t.name, change.backend);
      const found = change.sourceIndex.identifiers.has(expected);
      const status = found ? "✓" : "⚠";
      lines.push(
        `| ${status} ${escapeCell(t.name)} | ${escapeCell(t.given.join("; "))} | ${escapeCell(t.when)} | ${escapeCell(t.then)} | \`${expected}\` |`
      );
    }
  }
  lines.push("");
  lines.push("---");
  lines.push(`_Back: [\`change-${change.slug}.md\`](change-${change.slug}.md). Regenerate with \`devspec map --change ${change.slug}\`._`);
  return lines.join("\n") + "\n";
}

// ─── L3a: arch ─────────────────────────────────────────────────────────────

function renderArchMap(ws: WorkspaceState): string {
  const lines: string[] = [];
  lines.push("# L3 — Architecture map");
  lines.push("");
  lines.push(breadcrumb(["[Workspace](workspace.md)", "**Architecture**"]));
  lines.push("");
  lines.push("> _How source files are organised into layers, and which way the dependencies point._");
  lines.push("");
  lines.push(workspaceContextBlock(ws));
  lines.push("");
  lines.push(`**Architecture pattern**: \`${ws.config.architecture}\` — ${archDescription(ws.config.architecture)}`);
  lines.push("");
  lines.push("**How to read this map**: each box is a layer defined by the chosen architecture. The files inside each box are the source files DevSpec detected whose path contains that layer's name (case-insensitive). Arrows between boxes show the allowed dependency direction — files in one layer may only import from layers further to the right. The `devspec check` command enforces this; violations show up in the workspace map's coherence column.");
  lines.push("");

  // Group all source files by detected layer using path segments. This is a
  // shallow heuristic — when the chosen architecture defines explicit layers
  // (e.g. clean-architecture: Domain/Application/Infrastructure/Web), files
  // whose path contains the layer name are grouped under it.
  const layers = inferLayers(ws.config.architecture);
  // Reuse the first change's sourceIndex — it's workspace-scoped.
  const firstChange = ws.changes.find((c) => !c.status.archived);
  const sourceIndex = firstChange?.sourceIndex;
  if (!sourceIndex || sourceIndex.fileCount === 0) {
    lines.push("_No indexed source files yet. Once code exists, this map will show the layer structure._");
    lines.push("");
    return lines.join("\n") + "\n";
  }

  const filesByLayer = new Map<string, string[]>();
  for (const layer of layers) filesByLayer.set(layer, []);
  filesByLayer.set("(unclassified)", []);
  for (const [, entries] of sourceIndex.identifiers) {
    for (const e of entries) {
      const layer =
        layers.find((l) =>
          e.file.toLowerCase().split(/[\\/]/).includes(l.toLowerCase())
        ) ?? "(unclassified)";
      const set = filesByLayer.get(layer) ?? [];
      if (!set.includes(e.file)) set.push(e.file);
      filesByLayer.set(layer, set);
    }
  }

  lines.push("```mermaid");
  lines.push("flowchart LR");
  for (const layer of [...layers, "(unclassified)"]) {
    const files = filesByLayer.get(layer) ?? [];
    if (files.length === 0 && layer === "(unclassified)") continue;
    const id = nodeId(layer);
    lines.push(`    subgraph ${id}["${layer}"]`);
    lines.push(`        direction TB`);
    const sample = files.slice(0, 5);
    for (let i = 0; i < sample.length; i++) {
      const fid = `${id}_${i}`;
      lines.push(`        ${fid}["${escapeLabel(path.basename(sample[i]))}"]`);
    }
    if (files.length > sample.length) {
      const fid = `${id}_more`;
      lines.push(`        ${fid}["… +${files.length - sample.length} more"]`);
    }
    if (files.length === 0) {
      lines.push(`        ${id}_empty["_no files yet_"]`);
    }
    lines.push("    end");
  }
  // Dependency-direction edges (best-effort — assume inward for clean-architecture)
  if (ws.config.architecture === "clean-architecture") {
    const order = ["Web", "Infrastructure", "Application", "Domain"];
    const present = order.filter((l) => layers.includes(l));
    for (let i = 0; i < present.length - 1; i++) {
      lines.push(`    ${nodeId(present[i])} --> ${nodeId(present[i + 1])}`);
    }
  } else if (ws.config.architecture === "layered") {
    const order = ["Presentation", "Business", "Data"];
    const present = order.filter((l) => layers.includes(l));
    for (let i = 0; i < present.length - 1; i++) {
      lines.push(`    ${nodeId(present[i])} --> ${nodeId(present[i + 1])}`);
    }
  }
  lines.push("```");
  lines.push("");
  lines.push("## Files per layer");
  lines.push("");
  for (const layer of [...layers, "(unclassified)"]) {
    const files = filesByLayer.get(layer) ?? [];
    if (files.length === 0 && layer === "(unclassified)") continue;
    lines.push(`### ${layer}`);
    if (files.length === 0) {
      lines.push("_no files yet_");
    } else {
      for (const f of files.slice(0, 20)) {
        lines.push(`- \`${path.relative(ws.root, f)}\``);
      }
      if (files.length > 20) lines.push(`- _… +${files.length - 20} more_`);
    }
    lines.push("");
  }
  lines.push("---");
  lines.push("_Back: [`workspace.md`](workspace.md). Regenerate with `devspec map`._");
  return lines.join("\n") + "\n";
}

function inferLayers(arch: string): string[] {
  switch (arch) {
    case "clean-architecture":
      return ["Domain", "Application", "Infrastructure", "Web"];
    case "layered":
      return ["Presentation", "Business", "Data"];
    case "vertical-slice":
      return ["Features"];
    default:
      return [];
  }
}

// ─── L3b: deps per change ──────────────────────────────────────────────────

function renderDepsMap(ws: WorkspaceState, change: ChangeState): string {
  const lines: string[] = [];
  lines.push(`# L3 — Dependency map: \`${change.slug}\``);
  lines.push("");
  lines.push(
    breadcrumb([
      "[Workspace](workspace.md)",
      `[\`${change.slug}\`](change-${change.slug}.md)`,
      "**Dependencies**",
    ])
  );
  lines.push("");
  lines.push("> _Every third-party package this change introduces — with the license, last-release date, and cost discipline checks._");
  lines.push("");
  lines.push(workspaceContextBlock(ws));
  lines.push("");
  lines.push("**How to read this map**: DevSpec's philosophy is *prefer free + well-maintained*, and *escalate paid commercial packages to the user* before adopting. Each new dependency should be listed in this change's `design.md` under a `## Dependencies` section. The reviewer subagent reads this when scoring the change — undocumented paid commercial deps are block-severity.");
  lines.push("");

  const deps = parseDesignDeps(change.docs.design.raw);
  if (deps.length === 0) {
    lines.push("_No `## Dependencies` section found in `design.md`._");
    lines.push("");
    lines.push("> Every new dependency should be documented here with: **name**, **license**, **last release date**, **why over alternatives**, and (if applicable) **cost**. See the Philosophy section of `standards/standards.md`.");
    lines.push("");
    lines.push("Example to drop into design.md:");
    lines.push("");
    lines.push("```markdown");
    lines.push("## Dependencies");
    lines.push("- **chi** v5 · MIT · last release 2026-04-12 · stdlib mux can't do middleware chaining cleanly");
    lines.push("- **sqlx** v1.4 · MIT · last release 2026-03-01 · stdlib database/sql lacks struct scanning");
    lines.push("```");
    lines.push("");
  } else {
    lines.push("```mermaid");
    lines.push("flowchart LR");
    lines.push(`    P((${escapeLabel(change.slug)}))`);
    let i = 0;
    for (const d of deps) {
      const id = `D${i++}`;
      const klass = d.flagged ? "depPaid" : d.unmaintained ? "depAmber" : "depGood";
      const icon = d.flagged ? "💰" : d.unmaintained ? "⚠" : "✓";
      lines.push(`    P --> ${id}["${icon} ${escapeLabel(d.name)}<br/>${escapeLabel(d.license || "license?")}<br/>${escapeLabel(d.lastRelease || "")}"]:::${klass}`);
    }
    lines.push("");
    lines.push("    classDef depGood fill:#3fb950,color:#000");
    lines.push("    classDef depAmber fill:#d29922,color:#000");
    lines.push("    classDef depPaid fill:#f85149,color:#fff");
    lines.push("```");
    lines.push("");
    lines.push("| Dependency | License | Last release | Notes |");
    lines.push("|---|---|---|---|");
    for (const d of deps) {
      lines.push(
        `| \`${escapeCell(d.name)}\` | ${escapeCell(d.license)} | ${escapeCell(d.lastRelease)} | ${escapeCell(d.notes)} |`
      );
    }
  }
  lines.push("");
  lines.push("---");
  lines.push(`_Back: [\`change-${change.slug}.md\`](change-${change.slug}.md). Regenerate with \`devspec map --change ${change.slug}\`._`);
  return lines.join("\n") + "\n";
}

interface ParsedDep {
  name: string;
  license: string;
  lastRelease: string;
  notes: string;
  flagged: boolean; // paid / commercial signals
  unmaintained: boolean;
}

function parseDesignDeps(designRaw: string): ParsedDep[] {
  if (!designRaw) return [];
  const lines = designRaw.split(/\r?\n/);
  const out: ParsedDep[] = [];
  let inSection = false;
  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      inSection = /^dependencies\b/i.test(heading[2].trim());
      continue;
    }
    if (!inSection) continue;
    const item = /^\s*[-*]\s+(.+?)\s*$/.exec(line);
    if (!item) continue;
    const body = item[1];
    // Pull out **name** if present
    const nameMatch = /\*\*([^*]+)\*\*/.exec(body);
    const name = nameMatch ? nameMatch[1] : body.split("·")[0].trim().replace(/^[*_`]|[*_`]$/g, "");
    const parts = body.split("·").map((p) => p.trim());
    const license =
      parts.find((p) => /^(mit|apache|bsd|isc|mpl|gpl|lgpl|agpl|unlicense|cc0)\b/i.test(p)) ?? "";
    const lastRelease =
      parts.find((p) => /\b(20\d{2})(?:-\d{2}){0,2}\b/.test(p)) ?? "";
    const notes = parts.slice(1).join(" · ");
    const lower = body.toLowerCase();
    const flagged =
      /\b(commercial|paid|enterprise|telerik|devexpress|syncfusion|componentone|aspose|spire)\b/.test(lower) ||
      lower.includes("💰");
    const unmaintained = /\bunmaintain|\bstale\b|\barchived\b/.test(lower);
    out.push({ name, license, lastRelease, notes, flagged, unmaintained });
  }
  return out;
}

// ─── index ─────────────────────────────────────────────────────────────────

function renderIndex(ws: WorkspaceState): string {
  const lines: string[] = [];
  lines.push("# DevSpec maps");
  lines.push("");
  lines.push(
    `Generated by \`devspec map\` · workspace phase: \`${ws.effectivePhase}\` · ${ws.changes.filter((c) => !c.status.archived).length} active change(s)`
  );
  lines.push("");
  lines.push("## Layers");
  lines.push("");
  lines.push("- **L0** [Workspace map](workspace.md) — every change at a glance, phase progression");
  lines.push("- **L1** Per-change maps — lifecycle stages, coherence findings:");
  for (const c of ws.changes.filter((c) => !c.status.archived)) {
    lines.push(`  - [\`${c.slug}\`](change-${c.slug}.md)`);
  }
  lines.push("- **L2** Contract maps — API methods → source, test → implementation:");
  for (const c of ws.changes.filter((c) => !c.status.archived)) {
    lines.push(`  - [\`${c.slug}\`](contract-${c.slug}.md)`);
  }
  lines.push("- **L3** Architecture & dependencies:");
  lines.push(`  - [Architecture layers](arch.md)`);
  for (const c of ws.changes.filter((c) => !c.status.archived)) {
    lines.push(`  - [\`${c.slug}\` deps](deps-${c.slug}.md)`);
  }
  lines.push("");
  lines.push("## Hot-reload while you work");
  lines.push("");
  lines.push("```bash");
  lines.push("devspec map --watch");
  lines.push("```");
  lines.push("");
  lines.push("Then open any `.md` file above in VS Code's markdown preview (right-click → _Open Preview_). Mermaid blocks re-render automatically on file save.");
  lines.push("");
  lines.push("---");
  lines.push("_Regenerate manually: `devspec map`. Single change: `devspec map --change <slug>`._");
  return lines.join("\n") + "\n";
}

// ─── helpers ───────────────────────────────────────────────────────────────

function breadcrumb(parts: string[]): string {
  return parts.join("  ›  ");
}

function workspaceContextBlock(ws: WorkspaceState): string {
  const active = ws.changes.filter((c) => !c.status.archived).length;
  return (
    `> **Workspace context** — phase: \`${ws.effectivePhase}\`${ws.declaredPhase ? " (declared)" : " (auto)"} · ` +
    `backend: \`${ws.config.backend}\` · ` +
    `architecture: \`${ws.config.architecture}\` · ` +
    `methodology: \`${ws.config.methodology}\`` +
    (ws.config.frontend ? ` · frontend: \`${ws.config.frontend}\`` : "") +
    (ws.config.pipeline ? ` · pipeline: \`${ws.config.pipeline}\`` : "") +
    ` · ${active} active change(s)`
  );
}

function archDescription(arch: string): string {
  switch (arch) {
    case "clean-architecture":
      return "Domain at the centre, Application orchestrates, Infrastructure plugs in adapters, Web is the outermost layer. Dependencies point *inward*.";
    case "layered":
      return "Presentation calls Business, Business calls Data. Strictly top-down.";
    case "vertical-slice":
      return "Each feature lives in its own folder spanning all layers. No horizontal dependencies between features.";
    default:
      return "Custom architecture — see `standards/standards.md`.";
  }
}

function stageDoneCount(c: ChangeState): number {
  return LIFECYCLE_STAGES.filter((s) => c.status.stages[s] === "done").length;
}

function nodeId(s: string): string {
  return "N" + s.replace(/[^a-zA-Z0-9]/g, "_");
}

function escapeLabel(s: string): string {
  return s
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, "&#124;");
}

function escapeCell(s: string): string {
  return (s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

// ─── L1.5: capability index + drill-downs ──────────────────────────────────

interface CapabilityContributor {
  slug: string;
  status: "active" | "archived";
  pending: { added: number; modified: number; removed: number };
  syncedAt?: Date;
}

async function collectCapabilityContributors(
  root: string,
  capabilities: string[]
): Promise<Map<string, CapabilityContributor[]>> {
  const map = new Map<string, CapabilityContributor[]>();
  for (const cap of capabilities) map.set(cap, []);

  const projectsDir = devspecPath(root, "projects");
  if (await fs.pathExists(projectsDir)) {
    const slugs = (await fs.readdir(projectsDir, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    for (const slug of slugs) {
      const deltas = await listDeltas(root, slug);
      for (const delta of deltas) {
        if (!map.has(delta.capability)) continue;
        if (delta.status === "pending" && (await fs.pathExists(delta.filePath))) {
          const raw = await fs.readFile(delta.filePath, "utf8");
          const parsed = parseDeltaFile(raw, delta.capability);
          map.get(delta.capability)!.push({
            slug,
            status: "active",
            pending: {
              added: parsed.added.length,
              modified: parsed.modified.length,
              removed: parsed.removed.length,
            },
          });
        }
      }
    }
  }

  const archiveDir = devspecPath(root, "archive");
  if (await fs.pathExists(archiveDir)) {
    const slugs = (await fs.readdir(archiveDir, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    for (const slug of slugs) {
      const deltasRoot = path.join(archiveDir, slug, "deltas");
      if (!(await fs.pathExists(deltasRoot))) continue;
      const capDirs = await fs.readdir(deltasRoot, { withFileTypes: true });
      for (const ent of capDirs) {
        if (!ent.isDirectory()) continue;
        if (!map.has(ent.name)) continue;
        const syncedFile = path.join(deltasRoot, ent.name, "spec.md.synced");
        if (await fs.pathExists(syncedFile)) {
          const stat = await fs.stat(syncedFile);
          map.get(ent.name)!.push({
            slug,
            status: "archived",
            pending: { added: 0, modified: 0, removed: 0 },
            syncedAt: stat.mtime,
          });
        }
      }
    }
  }

  return map;
}

function renderCapabilityIndex(
  ws: WorkspaceState,
  capabilities: string[],
  contribByCap: Map<string, CapabilityContributor[]>
): string {
  const lines: string[] = [];
  lines.push("# L1.5 — Capabilities index");
  lines.push("");
  lines.push("> _The system-wide capability surface. Each capability is a living spec at `.devspec/specs/<cap>/spec.md`, edited by per-change deltas._");
  lines.push("");
  lines.push(`[← ${escapeLabel("workspace")}](../workspace.md)`);
  lines.push("");
  lines.push(workspaceContextBlock(ws));
  lines.push("");
  lines.push("**How to read this map**: each capability node is a thing the system promises. Edges from active changes show which capabilities a change is currently editing (its delta surface). Click a capability for its requirements list, contributors, and archived history.");
  lines.push("");

  // Mermaid graph
  lines.push("```mermaid");
  lines.push("flowchart LR");
  for (const cap of capabilities) {
    lines.push(`    ${nodeId("CAP_" + cap)}["${escapeLabel(cap)}"]:::capability`);
  }
  const seenEdges = new Set<string>();
  for (const cap of capabilities) {
    for (const c of contribByCap.get(cap) ?? []) {
      if (c.status !== "active") continue;
      const edge = `${nodeId("CH_" + c.slug)}-->${nodeId("CAP_" + cap)}`;
      if (seenEdges.has(edge)) continue;
      seenEdges.add(edge);
      lines.push(`    ${nodeId("CH_" + c.slug)}["${escapeLabel(c.slug)}"]:::change`);
      lines.push(`    ${edge}`);
    }
  }
  lines.push("    classDef capability fill:#dff3e0,stroke:#2a7a2a;");
  lines.push("    classDef change fill:#e3eaff,stroke:#3a4ec2;");
  lines.push("```");
  lines.push("");

  // Table
  lines.push("| Capability | Active changes | Status |");
  lines.push("|---|---|---|");
  for (const cap of capabilities) {
    const contribs = contribByCap.get(cap) ?? [];
    const active = contribs.filter((c) => c.status === "active");
    const status = active.length > 0 ? "dirty" : "clean";
    const activeList = active.length === 0
      ? "—"
      : active.map((c) => `\`${c.slug}\``).join(", ");
    lines.push(
      `| [\`${cap}\`](./${cap}.md) | ${activeList} | ${status} |`
    );
  }
  lines.push("");

  return lines.join("\n");
}

function renderCapabilityDrillDown(
  ws: WorkspaceState,
  capability: string,
  spec: ReturnType<typeof parseCapabilitySpec>,
  contributors: CapabilityContributor[]
): string {
  const lines: string[] = [];
  lines.push(`# L1.5 — Capability: \`${capability}\``);
  lines.push("");
  lines.push(`> _Living spec at \`.devspec/specs/${capability}/spec.md\` — edited by per-change deltas at \`.devspec/projects/<slug>/deltas/${capability}/spec.md\`._`);
  lines.push("");
  lines.push(`[← capabilities](./index.md) · [← workspace](../workspace.md)`);
  lines.push("");
  lines.push(workspaceContextBlock(ws));
  lines.push("");

  lines.push("## Requirements");
  lines.push("");
  if (spec.requirements.length === 0) {
    lines.push("_No requirements defined yet. Edit `.devspec/specs/" + capability + "/spec.md` to add the first._");
  } else {
    for (const req of spec.requirements) {
      lines.push(`- **${escapeCell(req.name)}**`);
    }
  }
  lines.push("");

  const active = contributors.filter((c) => c.status === "active");
  if (active.length > 0) {
    lines.push("## Active changes touching this capability");
    lines.push("");
    lines.push("| Change | Added | Modified | Removed |");
    lines.push("|---|---|---|---|");
    for (const c of active) {
      lines.push(
        `| \`${c.slug}\` | ${c.pending.added} | ${c.pending.modified} | ${c.pending.removed} |`
      );
    }
    lines.push("");
  }

  const archived = contributors.filter((c) => c.status === "archived");
  if (archived.length > 0) {
    lines.push("## Archived contributors");
    lines.push("");
    lines.push("| Change | Synced |");
    lines.push("|---|---|");
    for (const c of archived) {
      const ts = c.syncedAt ? c.syncedAt.toISOString().substring(0, 10) : "—";
      lines.push(`| \`${c.slug}\` | ${ts} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
