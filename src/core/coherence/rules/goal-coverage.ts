import type { CoherenceRule, Drift } from "../types.js";

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "for", "in", "on", "with",
  "is", "are", "be", "by", "as", "at", "from", "this", "that", "it", "if",
  "we", "our", "us", "they", "their", "will", "should", "must", "user", "users",
  "one", "sentence", "describing", "outcome", "system", "feature",
]);

const MIN_KEYWORDS = 2;

export const goalCoverageRule: CoherenceRule = {
  name: "goal-coverage",
  description: "Design doc must reference key terms from the proposal's Goal section",
  check(state) {
    if (
      state.status.stages.proposal !== "done" ||
      state.docs.design.isEmpty ||
      state.docs.design.isTemplateOnly
    ) {
      return [];
    }
    const goalSection = state.docs.proposal.sections.find(
      (s) => s.heading.toLowerCase() === "goal"
    );
    if (!goalSection || goalSection.body.trim().length === 0) return [];

    const keywords = extractKeywords(goalSection.body);
    if (keywords.length < MIN_KEYWORDS) return [];

    const designText = state.docs.design.raw.toLowerCase();
    const missing = keywords.filter((kw) => !designText.includes(kw));
    if (missing.length === 0) return [];

    const drifts: Drift[] = [];
    drifts.push({
      rule: "goal-coverage",
      severity: "warn",
      message: `Design does not reference key terms from the proposal's goal: ${missing.slice(0, 5).join(", ")}`,
      hint: "The design should explain how it satisfies the proposal's goal — these terms should appear somewhere in design.md.",
      remediations: [
        {
          label: "Extend design.md to cover the missing terms",
          description:
            "Add sections or sentences in design.md that address each missing term from the goal",
        },
        {
          label: "Revise the proposal's goal",
          description:
            "Tighten the goal in proposal.md so the design's current shape actually delivers it",
        },
        {
          label: "Acknowledge as warning",
          description:
            "Accept the gap and proceed — these are heuristics and may be false positives for domain-specific vocabulary",
        },
      ],
    });
    return drifts;
  },
};

function extractKeywords(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)) {
    if (token.length < 4) continue;
    if (STOPWORDS.has(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}
