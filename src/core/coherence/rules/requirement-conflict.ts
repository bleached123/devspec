import fs from "fs-extra";
import type { WorkspaceRule, WorkspaceDrift } from "../types.js";
import { listDeltas, parseDeltaFile } from "../../capability.js";

type Operation = "ADDED" | "MODIFIED" | "REMOVED";

interface ChangeRequirementRef {
  slug: string;
  operation: Operation;
}

interface ConflictKey {
  capability: string;
  requirementName: string;
}

function conflictKindFromOps(ops: Operation[]): string {
  const set = new Set(ops);
  if (set.size === 1) {
    return `${[...set][0].toLowerCase()}-${[...set][0].toLowerCase()}`;
  }
  // Mixed kinds: sort labels for stable ordering
  const sorted = [...set].sort();
  return sorted.map((o) => o.toLowerCase()).join("-");
}

export const requirementConflictRule: WorkspaceRule = {
  name: "requirement-conflict",
  description:
    "Workspace rule: two or more active changes propose touching the same requirement in the same capability",
  check: async (ctx): Promise<WorkspaceDrift[]> => {
    const conflicts = new Map<string, ChangeRequirementRef[]>();
    const keyMap = new Map<string, ConflictKey>();

    for (const slug of ctx.activeSlugs) {
      const deltas = await listDeltas(ctx.root, slug);
      for (const delta of deltas) {
        if (delta.status !== "pending") continue;
        if (!(await fs.pathExists(delta.filePath))) continue;
        const raw = await fs.readFile(delta.filePath, "utf8");
        const parsed = parseDeltaFile(raw, delta.capability);

        const ops: Array<{ op: Operation; reqs: Array<{ name: string }> }> = [
          { op: "ADDED", reqs: parsed.added },
          { op: "MODIFIED", reqs: parsed.modified },
          { op: "REMOVED", reqs: parsed.removed },
        ];

        for (const { op, reqs } of ops) {
          for (const req of reqs) {
            const key = `${delta.capability}::${req.name}`;
            keyMap.set(key, { capability: delta.capability, requirementName: req.name });
            const refs = conflicts.get(key) ?? [];
            refs.push({ slug, operation: op });
            conflicts.set(key, refs);
          }
        }
      }
    }

    const drifts: WorkspaceDrift[] = [];
    for (const [key, refs] of conflicts.entries()) {
      // Conflict exists when at least 2 distinct slugs touch the same (capability, requirement)
      const distinctSlugs = new Set(refs.map((r) => r.slug));
      if (distinctSlugs.size < 2) continue;

      const { capability, requirementName } = keyMap.get(key)!;
      const ops = refs.map((r) => r.operation);
      const kind = conflictKindFromOps(ops);
      const slugList = [...distinctSlugs].sort();

      drifts.push({
        rule: "requirement-conflict",
        severity: "block",
        message: `Cross-change conflict on capability "${capability}" requirement "${requirementName}": ${slugList.join(", ")} (${kind}).`,
        hint: `Rebase the later change against the first's resulting spec after sync, or suppress on the change that should yield.`,
        slugs: slugList,
      });
    }

    return drifts;
  },
};
