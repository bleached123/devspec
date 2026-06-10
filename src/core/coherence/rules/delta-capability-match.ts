import type { CoherenceRule, Drift } from "../types.js";
import { listDeltas } from "../../capability.js";
import { readContractCapabilities } from "../../contract.js";

export const deltaCapabilityMatchRule: CoherenceRule = {
  name: "delta-capability-match",
  description:
    "Per-change rule: capability: frontmatter in contract.md must match the deltas/ subdirectory contents",
  check: async (state) => {
    const drifts: Drift[] = [];
    const declared = readContractCapabilities(state.docs.contract.raw);
    // Opt-in: if the contract has no capability: frontmatter, this rule emits nothing.
    if (declared.length === 0) return drifts;

    const deltas = await listDeltas(state.workspaceRoot, state.slug);
    const present = new Set(deltas.map((d) => d.capability));
    const declaredSet = new Set(declared);

    for (const cap of declared) {
      if (!present.has(cap)) {
        drifts.push({
          rule: "delta-capability-match",
          severity: "warn",
          message: `Contract declares capability "${cap}" in frontmatter but no deltas/${cap}/spec.md exists.`,
          hint: `Run \`devspec specs delta ${state.slug} ${cap}\` to scaffold the delta, or remove "${cap}" from contract.md frontmatter.`,
        });
      }
    }

    for (const cap of present) {
      if (!declaredSet.has(cap)) {
        drifts.push({
          rule: "delta-capability-match",
          severity: "warn",
          message: `Delta directory deltas/${cap}/ exists but "${cap}" is not declared in contract.md frontmatter.`,
          hint: `Add "${cap}" to the capability: list in contract.md frontmatter, or remove the delta directory.`,
        });
      }
    }

    return drifts;
  },
};
