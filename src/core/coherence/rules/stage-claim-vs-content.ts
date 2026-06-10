import type { CoherenceRule, Drift } from "../types.js";
import { LIFECYCLE_STAGES } from "../types.js";

const MIN_BODY_CHARS = 80;

export const stageClaimVsContentRule: CoherenceRule = {
  name: "stage-claim-vs-content",
  description: "A stage marked done must have substantive content beyond the template",
  check(state) {
    const drifts: Drift[] = [];
    for (const stage of LIFECYCLE_STAGES) {
      if (state.status.stages[stage] !== "done") continue;
      const doc = state.docs[stage];
      if (doc.isEmpty) {
        drifts.push({
          rule: "stage-claim-vs-content",
          severity: "block",
          message: `Stage "${stage}" is marked done but ${stage}.md is empty`,
          remediations: [
            {
              label: `Fill in ${stage}.md`,
              description: `Add real content (problem, evidence, etc.) — at least ${MIN_BODY_CHARS} characters of body`,
            },
            {
              label: `Revert ${stage} to pending`,
              description: `Set ${stage} back to pending in status.yaml`,
            },
          ],
        });
        continue;
      }
      const bodyChars = doc.sections.reduce(
        (sum, s) => sum + s.body.trim().length,
        0
      );
      if (bodyChars < MIN_BODY_CHARS || doc.isTemplateOnly) {
        drifts.push({
          rule: "stage-claim-vs-content",
          severity: "block",
          message: `Stage "${stage}" is marked done but ${stage}.md looks like an unfilled template (${bodyChars} chars of body)`,
          remediations: [
            {
              label: `Fill in ${stage}.md`,
              description: `Replace template placeholders with real content under each heading`,
            },
            {
              label: `Revert ${stage} to pending`,
              description: `Set ${stage} back to pending in status.yaml`,
            },
          ],
        });
      }
    }
    return drifts;
  },
};
