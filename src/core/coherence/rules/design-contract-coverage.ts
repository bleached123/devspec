import type { CoherenceRule, Drift } from "../types.js";

const DOMAIN_SECTIONS = new Set([
  "aggregates affected",
  "aggregates",
  "value objects",
  "domain events",
  "domain types",
  "entities",
]);

const STOPWORDS = new Set([
  "The", "We", "It", "This", "That", "An", "A", "And", "Or", "But",
  "Add", "Use", "New", "Foo", "Bar", "Baz", "Example",
  "Aggregate", "Value", "Object", "Event", "Entity", "Service",
  "Repository", "Required", "Optional",
]);

export const designContractCoverageRule: CoherenceRule = {
  name: "design-contract-coverage",
  description: "Domain terms named in design.md should appear in contract.md",
  check(state) {
    if (state.docs.design.isEmpty || state.docs.design.isTemplateOnly) return [];
    if (state.docs.contract.isEmpty || state.docs.contract.isTemplateOnly) return [];

    const domainTerms = new Set<string>();
    for (const section of state.docs.design.sections) {
      if (!DOMAIN_SECTIONS.has(section.heading.toLowerCase().trim())) continue;
      const matches = section.body.match(/\b[A-Z][a-zA-Z0-9]{2,}\b/g);
      if (!matches) continue;
      for (const term of matches) {
        if (STOPWORDS.has(term)) continue;
        domainTerms.add(term);
      }
    }
    if (domainTerms.size === 0) return [];

    const contractText = state.docs.contract.raw;
    const missing: string[] = [];
    for (const term of domainTerms) {
      if (!contractText.includes(term)) missing.push(term);
    }
    if (missing.length === 0) return [];

    const drifts: Drift[] = [];
    drifts.push({
      rule: "design-contract-coverage",
      severity: "warn",
      message: `Domain term(s) from design.md missing in contract.md: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? `, +${missing.length - 5} more` : ""}`,
      hint: "The contract should use the same domain vocabulary as the design — either reference these terms or document why they were dropped.",
      remediations: [
        {
          label: "Use the missing terms in contract.md",
          description:
            "Reference each missing term in the contract's API or types section",
        },
        {
          label: "Update design.md to remove the dropped terms",
          description:
            "If the design has evolved away from these concepts, prune them from the design",
        },
        {
          label: "Acknowledge as warning",
          description:
            "Some design terms are explanatory only and don't need to appear in code",
        },
      ],
    });
    return drifts;
  },
};
