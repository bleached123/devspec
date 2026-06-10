import type { CoherenceRule, Drift } from "../types.js";
import { LIFECYCLE_STAGES } from "../types.js";

export const stageOrderRule: CoherenceRule = {
  name: "stage-order",
  description: "Stages must complete in lifecycle order (no skipping ahead)",
  check(state) {
    const drifts: Drift[] = [];
    let seenPending = false;
    for (const stage of LIFECYCLE_STAGES) {
      const status = state.status.stages[stage];
      if (status !== "done") {
        seenPending = true;
        continue;
      }
      if (seenPending) {
        const previous = LIFECYCLE_STAGES.slice(
          0,
          LIFECYCLE_STAGES.indexOf(stage)
        ).filter((s) => state.status.stages[s] !== "done");
        drifts.push({
          rule: "stage-order",
          severity: "block",
          message: `Stage "${stage}" is marked done but earlier stage(s) are not: ${previous.join(", ")}`,
          hint: "Either mark the earlier stage done, or revert this one to pending.",
          remediations: [
            {
              label: `Mark ${previous[0]} as done`,
              description: `Set ${previous[0]} to done in status.yaml (only if its doc is actually complete)`,
            },
            {
              label: `Revert ${stage} to pending`,
              description: `Set ${stage} to pending in status.yaml until upstream stages are done`,
            },
          ],
        });
      }
    }
    return drifts;
  },
};
