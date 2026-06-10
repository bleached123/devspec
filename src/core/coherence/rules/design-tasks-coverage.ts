import type { CoherenceRule, Drift } from "../types.js";

const IGNORED_HEADINGS = new Set([
  "trade-offs",
  "trade offs",
  "tradeoffs",
  "open questions",
  "non-goals",
  "non goals",
]);

export const designTasksCoverageRule: CoherenceRule = {
  name: "design-tasks-coverage",
  description: "Every substantive design section should have at least one task",
  check(state) {
    if (
      state.docs.design.isEmpty ||
      state.docs.design.isTemplateOnly ||
      state.docs.tasks.isEmpty
    ) {
      return [];
    }

    const designSections = state.docs.design.sections.filter(
      (s) =>
        s.level === 2 &&
        s.body.trim().length > 0 &&
        !IGNORED_HEADINGS.has(s.heading.toLowerCase().trim())
    );
    if (designSections.length === 0) return [];

    const taskSections = new Set(
      state.tasks
        .map((t) => (t.section ?? "").toLowerCase().trim())
        .filter((s) => s.length > 0)
    );

    const uncovered = designSections.filter((d) => {
      const heading = d.heading.toLowerCase().trim();
      return !taskSections.has(heading);
    });

    if (uncovered.length === 0) return [];

    const drifts: Drift[] = [];
    drifts.push({
      rule: "design-tasks-coverage",
      severity: "warn",
      message: `Design section(s) without matching task group: ${uncovered.map((s) => s.heading).join(", ")}`,
      hint: "Each major design section ideally has a matching section in tasks.md with concrete checkboxes.",
      remediations: [
        {
          label: "Add task sections for the uncovered design sections",
          description:
            "Add one ## heading per uncovered design section to tasks.md and 2–4 concrete tasks under each",
        },
        {
          label: "Drop or merge the uncovered design sections",
          description:
            "Remove sections from design.md that aren't going to produce work, or merge them into others",
        },
        {
          label: "Acknowledge as warning",
          description:
            "Some design sections (e.g. context, rationale) intentionally produce no tasks",
        },
      ],
    });
    return drifts;
  },
};
