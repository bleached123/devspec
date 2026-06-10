import path from "node:path";
import fs from "fs-extra";
import YAML from "yaml";
import { devspecPath } from "./workspace.js";
import type { UatCriterion, UatStatus } from "./coherence/types.js";

export const UAT_FILE = "uat.yaml";

export function uatPath(workspaceRoot: string): string {
  return devspecPath(workspaceRoot, UAT_FILE);
}

export async function loadUat(workspaceRoot: string): Promise<UatCriterion[] | null> {
  const file = uatPath(workspaceRoot);
  if (!(await fs.pathExists(file))) return null;
  const raw = await fs.readFile(file, "utf8");
  const parsed = YAML.parse(raw) ?? {};
  const list = Array.isArray(parsed.criteria) ? parsed.criteria : [];
  const out: UatCriterion[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.name !== "string" || typeof e.description !== "string") continue;
    out.push({
      name: e.name,
      description: e.description,
      linkedChanges: Array.isArray(e.linkedChanges ?? e.linked_changes)
        ? ((e.linkedChanges ?? e.linked_changes) as unknown[]).filter(
            (x): x is string => typeof x === "string"
          )
        : [],
      status: isStatus(e.status) ? e.status : "pending",
      signedOffBy:
        typeof (e.signedOffBy ?? e.signed_off_by) === "string"
          ? ((e.signedOffBy ?? e.signed_off_by) as string)
          : "",
      signedOffAt:
        typeof (e.signedOffAt ?? e.signed_off_at) === "string"
          ? ((e.signedOffAt ?? e.signed_off_at) as string)
          : "",
      notes: typeof e.notes === "string" ? e.notes : "",
    });
  }
  return out;
}

export async function writeUat(
  workspaceRoot: string,
  criteria: UatCriterion[]
): Promise<void> {
  const file = uatPath(workspaceRoot);
  const payload = {
    criteria: criteria.map((c) => ({
      name: c.name,
      description: c.description,
      linked_changes: c.linkedChanges,
      status: c.status,
      signed_off_by: c.signedOffBy,
      signed_off_at: c.signedOffAt,
      notes: c.notes,
    })),
  };
  await fs.ensureDir(path.dirname(file));
  await fs.writeFile(file, YAML.stringify(payload));
}

function isStatus(value: unknown): value is UatStatus {
  return value === "pending" || value === "passed" || value === "failed";
}

export const STARTER_UAT_YAML = `# Workspace-level acceptance criteria.
# Add criteria as you approach the "ready" phase, validate during "uat" phase,
# then move to "production" by setting \`phase: production\` in devspec.yaml.

criteria:
  - name: Replace with a user-facing outcome
    description: >
      Describe what success looks like for a real user. Avoid implementation language.
    linked_changes: []
    status: pending
    signed_off_by: ""
    signed_off_at: ""
    notes: ""
`;
