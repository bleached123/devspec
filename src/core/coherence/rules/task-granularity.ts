import type { CoherenceRule, Drift, TaskItem } from "../types.js";

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "for", "in", "on", "with",
  "is", "are", "be", "by", "as", "at", "from", "this", "that", "it", "if",
  "do", "add", "use", "update",
]);

const MIN_SIGNIFICANT_TOKENS = 3;
const MIN_TEXT_LENGTH = 25;

export const taskGranularityRule: CoherenceRule = {
  name: "task-granularity",
  description: "Tasks should be specific enough for one Ralph iteration",
  check(state) {
    if (state.status.stages.tasks !== "done" && state.tasks.length === 0) {
      return [];
    }
    const drifts: Drift[] = [];
    const vague = state.tasks.filter(isVague);
    if (vague.length === 0) return drifts;
    drifts.push({
      rule: "task-granularity",
      severity: "warn",
      message: `${vague.length} task(s) look too vague for autonomous iteration`,
      hint: `Examples: ${vague
        .slice(0, 3)
        .map((t) => `"${t.text}"`)
        .join(", ")}`,
      remediations: [
        {
          label: "Expand the vague tasks",
          description:
            "Break each vague task into 2–4 concrete sub-tasks with specific nouns and verbs (e.g. \"Add Booking aggregate with Id, CustomerId, Status\")",
        },
        {
          label: "Acknowledge and proceed",
          description:
            "Accept the granularity and continue — the agent may struggle on these tasks and escalate later",
        },
      ],
    });
    return drifts;
  },
};

function isVague(task: TaskItem): boolean {
  if (task.text.length < MIN_TEXT_LENGTH) return true;
  const tokens = task.text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
  return tokens.length < MIN_SIGNIFICANT_TOKENS;
}
