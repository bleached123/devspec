import fs from "fs-extra";
import type { CoherenceRule, Drift } from "../types.js";
import { capabilitySpecPath, listDeltas } from "../../capability.js";

export const capabilityExistsRule: CoherenceRule = {
  name: "capability-exists",
  description:
    "Per-change rule: every deltas/<capability>/ subdirectory must have a matching .devspec/specs/<capability>/spec.md",
  check: async (state) => {
    const drifts: Drift[] = [];
    const deltas = await listDeltas(state.workspaceRoot, state.slug);
    if (deltas.length === 0) return drifts;

    for (const delta of deltas) {
      const mainSpec = capabilitySpecPath(state.workspaceRoot, delta.capability);
      if (!(await fs.pathExists(mainSpec))) {
        drifts.push({
          rule: "capability-exists",
          severity: "warn",
          message: `Delta references unknown capability "${delta.capability}" — no .devspec/specs/${delta.capability}/spec.md exists.`,
          hint: `Run \`devspec specs init ${delta.capability}\` to create the capability, or delete the orphaned delta directory.`,
          remediations: [
            {
              label: `Create the capability`,
              description: `devspec specs init ${delta.capability}`,
            },
            {
              label: `Remove the delta directory`,
              description: `rm -rf .devspec/projects/${state.slug}/deltas/${delta.capability}/`,
            },
          ],
        });
      }
    }
    return drifts;
  },
};
