import type { CoherenceRule, Drift } from "../types.js";
import { extractApiMethods } from "../../contract.js";
import { targetSourceName } from "../../templates.js";

export const apiMethodImplementedRule: CoherenceRule = {
  name: "api-method-implemented",
  description: "Methods declared in the contract API should appear in source code",
  check(state) {
    if (state.sourceIndex.fileCount === 0) return [];
    const methods = extractApiMethods(state.docs.contract.raw);
    if (methods.length === 0) return [];

    const missing: string[] = [];

    for (const method of methods) {
      const expected = targetSourceName(method.name, state.backend);
      const original = method.name;
      const matches =
        state.sourceIndex.identifiers.get(expected) ??
        state.sourceIndex.identifiers.get(original);
      if (!matches || matches.length === 0) {
        const label = method.inInterface
          ? `${method.inInterface}.${method.name}`
          : method.name;
        missing.push(`${label}  ← expected source name "${expected}"`);
      }
    }
    if (missing.length === 0) return [];

    const drifts: Drift[] = [];
    drifts.push({
      rule: "api-method-implemented",
      severity: "warn",
      message: `${missing.length} API method(s) not found in source code (may be intentional rename)`,
      hint: missing.slice(0, 5).join("\n         "),
      remediations: [
        {
          label: "Reflect the rename back into contract.md",
          description:
            "If the method was renamed during implementation, update the contract API so it stays the source of truth",
        },
        {
          label: "Implement the missing method",
          description: "Add the missing function/method to source",
        },
        {
          label: "Acknowledge as warning",
          description:
            "Trivial wrappers or platform-idiomatic renames may be acceptable. Document why if so.",
        },
      ],
    });
    return drifts;
  },
};
