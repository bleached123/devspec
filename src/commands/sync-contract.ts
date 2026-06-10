import path from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import fs from "fs-extra";
import { requireWorkspaceRoot, devspecPath } from "../core/workspace.js";
import { loadChangeState } from "../core/change.js";
import { extractApiMethods, type ApiMethod } from "../core/contract.js";
import { targetTestName, targetSourceName, similarity, sourceToContract } from "../core/templates.js";
import type { SourceIdentifier } from "../core/coherence/types.js";

interface RenameProposal {
  apiMethod: ApiMethod;
  expectedSourceName: string;
  candidates: Array<{ source: SourceIdentifier; similarity: number; suggestedContractName: string }>;
}

const MIN_SIMILARITY = 0.4;
const TOP_N = 3;

export const syncContractCommand = new Command("sync-contract")
  .description("Reflect implementation renames back into contract.md")
  .argument("<slug>", "Change slug")
  .option("--apply", "Apply the top suggestion for each drift", false)
  .option("--min-similarity <n>", "Minimum similarity to auto-apply (0-1)", (v) => parseFloat(v), 0.6)
  .action(
    async (
      slug: string,
      options: { apply: boolean; minSimilarity: number }
    ) => {
      const root = await requireWorkspaceRoot();
      const state = await loadChangeState(root, slug);

      const apiMethods = extractApiMethods(state.docs.contract.raw);
      if (apiMethods.length === 0) {
        console.log(chalk.dim("contract.md has no API methods to sync."));
        return;
      }
      if (state.sourceIndex.fileCount === 0) {
        console.log(chalk.dim("Source index is empty — nothing to sync against."));
        return;
      }

      // Determine which API methods are linked vs missing in source.
      const linkedSourceNames = new Set<string>();
      const missing: ApiMethod[] = [];
      for (const method of apiMethods) {
        const expected = targetSourceName(method.name, state.backend);
        if (state.sourceIndex.identifiers.has(expected)) {
          linkedSourceNames.add(expected);
          continue;
        }
        missing.push(method);
      }

      if (missing.length === 0) {
        console.log(chalk.green(`No drift: every contract API method has a matching source function.`));
        return;
      }

      // Build pool of unlinked source functions, excluding test scaffolds.
      const testFnNames = new Set(
        state.tests.map((t) => targetTestName(t.name, state.backend))
      );
      const candidatePool: SourceIdentifier[] = [];
      for (const [name, entries] of state.sourceIndex.identifiers) {
        if (linkedSourceNames.has(name)) continue;
        if (testFnNames.has(name)) continue;
        for (const entry of entries) {
          if (entry.kind === "function") candidatePool.push(entry);
        }
      }

      const proposals: RenameProposal[] = [];
      for (const method of missing) {
        const expected = targetSourceName(method.name, state.backend);
        const ranked = candidatePool
          .map((src) => ({
            source: src,
            similarity: similarity(expected, src.name),
            suggestedContractName: sourceToContract(src.name, state.backend),
          }))
          .filter((c) => c.similarity >= MIN_SIMILARITY)
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, TOP_N);
        proposals.push({
          apiMethod: method,
          expectedSourceName: expected,
          candidates: ranked,
        });
      }

      // Render report
      for (const p of proposals) {
        const apiLabel = p.apiMethod.inInterface
          ? `${p.apiMethod.inInterface}.${p.apiMethod.name}`
          : p.apiMethod.name;
        console.log(`${chalk.bold(apiLabel)}`);
        console.log(chalk.dim(`  expected source: ${p.expectedSourceName}  (not found)`));
        if (p.candidates.length === 0) {
          console.log(chalk.dim("  no candidates with similarity ≥ 40%"));
          console.log("");
          continue;
        }
        console.log(chalk.dim("  candidates:"));
        for (const c of p.candidates) {
          const pct = Math.round(c.similarity * 100);
          const tag = pct >= 60 ? chalk.green(`${pct}%`) : chalk.yellow(`${pct}%`);
          console.log(
            `    ${tag}  ${c.source.name}  ${chalk.dim(`(${c.source.file})`)}`
          );
          console.log(
            chalk.dim(`         → rename "${p.apiMethod.name}" to "${c.suggestedContractName}" in contract.md`)
          );
        }
        console.log("");
      }

      if (!options.apply) {
        const eligible = proposals.filter(
          (p) =>
            p.candidates.length > 0 && p.candidates[0].similarity >= options.minSimilarity
        );
        console.log(
          chalk.dim(
            `${proposals.length} drift(s), ${eligible.length} with high-confidence suggestion. Run with --apply to commit.`
          )
        );
        return;
      }

      // Apply
      let raw = state.docs.contract.raw;
      let applied = 0;
      const skipped: string[] = [];
      for (const p of proposals) {
        const top = p.candidates[0];
        if (!top || top.similarity < options.minSimilarity) {
          skipped.push(`${p.apiMethod.name} (no candidate ≥ ${Math.round(options.minSimilarity * 100)}% similarity)`);
          continue;
        }
        const renamed = renameMethodInTsFences(raw, p.apiMethod.name, top.suggestedContractName);
        if (renamed === raw) {
          skipped.push(`${p.apiMethod.name} (no occurrence found in TS fence)`);
          continue;
        }
        raw = renamed;
        applied++;
        console.log(
          chalk.green(`  ${p.apiMethod.name} → ${top.suggestedContractName}`) +
            chalk.dim(`  (source: ${top.source.name})`)
        );
      }

      if (applied === 0) {
        console.log(chalk.yellow("No renames applied."));
      } else {
        const contractPath = devspecPath(root, "projects", slug, "contract.md");
        await fs.writeFile(contractPath, raw);
        console.log("");
        console.log(
          chalk.green(`Wrote ${applied} rename(s) to ${path.relative(root, contractPath)}`)
        );
      }
      if (skipped.length > 0) {
        console.log("");
        console.log(chalk.dim("Skipped:"));
        for (const s of skipped) console.log(chalk.dim(`  - ${s}`));
      }
    }
  );

function renameMethodInTsFences(
  raw: string,
  oldName: string,
  newName: string
): string {
  if (oldName === newName) return raw;
  const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const methodRegex = new RegExp(`\\b${escaped}(?=\\s*\\()`, "g");
  return raw.replace(/(```(?:ts|typescript)\b[^\n]*\n)([\s\S]*?)(```)/g, (_, open, body, close) => {
    return open + body.replace(methodRegex, newName) + close;
  });
}
