import fs from "fs-extra";
import path from "node:path";
import type { CoherenceRule, Drift } from "../types.js";
import { listDeltas } from "../../capability.js";

const KNOWN_BLOCKS = new Set(["ADDED", "MODIFIED", "REMOVED"]);

interface ParseFinding {
  kind: "unknown-block" | "orphan-requirement" | "empty-body" | "duplicate-requirement";
  detail: string;
  blockLabel?: string;
  requirementName?: string;
}

function stripHtmlComments(raw: string): string {
  return raw.replace(/<!--[\s\S]*?-->/g, (match) => "\n".repeat((match.match(/\n/g) ?? []).length));
}

function findDeltaFormatIssues(raw: string): ParseFinding[] {
  const text = stripHtmlComments(raw);
  const lines = text.split(/\r?\n/);
  const findings: ParseFinding[] = [];

  // Track current block: null (no block yet), or { label, addedRequirements: Set<string> }
  let currentBlock: { label: string; recognised: boolean; seen: Set<string> } | null = null;
  let lastRequirement: { name: string; bodyStartLine: number; nonEmptyBody: boolean } | null = null;

  const closeRequirement = () => {
    if (lastRequirement && currentBlock?.recognised) {
      const label = currentBlock.label;
      if ((label === "ADDED" || label === "MODIFIED") && !lastRequirement.nonEmptyBody) {
        findings.push({
          kind: "empty-body",
          detail: `Requirement "${lastRequirement.name}" under ## ${label} Requirements has an empty body`,
          blockLabel: label,
          requirementName: lastRequirement.name,
        });
      }
    }
    lastRequirement = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const blockMatch = /^## ([A-Z][A-Z_-]*) Requirements\s*$/.exec(line);
    if (blockMatch) {
      closeRequirement();
      const label = blockMatch[1];
      const recognised = KNOWN_BLOCKS.has(label);
      currentBlock = { label, recognised, seen: new Set() };
      if (!recognised) {
        findings.push({
          kind: "unknown-block",
          detail: `Unknown block header "## ${label} Requirements" — expected ADDED, MODIFIED, or REMOVED`,
          blockLabel: label,
        });
      }
      continue;
    }

    // Any other ## heading closes the current block
    if (/^## /.test(line)) {
      closeRequirement();
      currentBlock = null;
      continue;
    }

    const reqMatch = /^### Requirement:\s*(.+?)\s*$/.exec(line);
    if (reqMatch) {
      closeRequirement();
      const reqName = reqMatch[1].trim();
      if (!currentBlock) {
        findings.push({
          kind: "orphan-requirement",
          detail: `Requirement "${reqName}" appears outside any ADDED/MODIFIED/REMOVED block`,
          requirementName: reqName,
        });
      } else if (currentBlock.recognised) {
        if (currentBlock.seen.has(reqName)) {
          findings.push({
            kind: "duplicate-requirement",
            detail: `Duplicate requirement "${reqName}" within the same ${currentBlock.label} block`,
            blockLabel: currentBlock.label,
            requirementName: reqName,
          });
        }
        currentBlock.seen.add(reqName);
      }
      lastRequirement = {
        name: reqName,
        bodyStartLine: i + 1,
        nonEmptyBody: false,
      };
      continue;
    }

    if (lastRequirement && line.trim().length > 0) {
      lastRequirement.nonEmptyBody = true;
    }
  }

  closeRequirement();
  return findings;
}

export const deltaFormatRule: CoherenceRule = {
  name: "delta-format",
  description:
    "Per-change rule: each delta file uses well-formed ADDED/MODIFIED/REMOVED blocks with non-empty bodies and no duplicate requirements within a block",
  check: async (state) => {
    const drifts: Drift[] = [];
    const deltas = await listDeltas(state.workspaceRoot, state.slug);
    if (deltas.length === 0) return drifts;

    for (const delta of deltas) {
      if (!(await fs.pathExists(delta.filePath))) continue;
      const raw = await fs.readFile(delta.filePath, "utf8");
      const findings = findDeltaFormatIssues(raw);
      const relPath = path.relative(state.workspaceRoot, delta.filePath);
      for (const finding of findings) {
        drifts.push({
          rule: "delta-format",
          severity: "warn",
          message: `${relPath}: ${finding.detail}`,
          hint: finding.kind === "unknown-block"
            ? "Block labels must be exactly ADDED, MODIFIED, or REMOVED (case-sensitive)."
            : finding.kind === "orphan-requirement"
              ? "Add a ## ADDED|MODIFIED|REMOVED Requirements header above the requirement."
              : finding.kind === "empty-body"
                ? "ADDED and MODIFIED requirements need a body using SHALL/MUST. REMOVED requirements may have empty (rationale-only) bodies."
                : "Each requirement heading must be unique within its block. Combine or rename the duplicate.",
        });
      }
    }
    return drifts;
  },
};
