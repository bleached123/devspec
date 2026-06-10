import fs from "fs-extra";
import {
  atomicWrite,
  capabilitySpecPath,
  listDeltas,
  parseCapabilitySpec,
  parseDeltaFile,
  type CapabilityName,
  type CapabilitySpec,
  type DeltaFile,
  type DeltaListing,
  type Requirement,
} from "./capability.js";

export type MergeErrorKind =
  | "missing-modified"
  | "missing-removed"
  | "duplicate-added"
  | "missing-capability";

export interface MergeError {
  kind: MergeErrorKind;
  capability: CapabilityName;
  requirement: string;
  message: string;
}

export type ValidationResult = { ok: true } | { ok: false; errors: MergeError[] };

export function validateMerge(spec: CapabilitySpec, delta: DeltaFile): ValidationResult {
  const errors: MergeError[] = [];
  const specNames = new Set(spec.requirements.map((r) => r.name));

  for (const req of delta.modified) {
    if (!specNames.has(req.name)) {
      errors.push({
        kind: "missing-modified",
        capability: delta.capability,
        requirement: req.name,
        message: `MODIFIED target "${req.name}" not found in capability "${delta.capability}"`,
      });
    }
  }
  for (const req of delta.removed) {
    if (!specNames.has(req.name)) {
      errors.push({
        kind: "missing-removed",
        capability: delta.capability,
        requirement: req.name,
        message: `REMOVED target "${req.name}" not found in capability "${delta.capability}"`,
      });
    }
  }
  for (const req of delta.added) {
    if (specNames.has(req.name)) {
      errors.push({
        kind: "duplicate-added",
        capability: delta.capability,
        requirement: req.name,
        message: `ADDED requirement "${req.name}" already exists in capability "${delta.capability}" — use MODIFIED instead`,
      });
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export function applyMerge(spec: CapabilitySpec, delta: DeltaFile): string {
  const removedNames = new Set(delta.removed.map((r) => r.name));
  const modifiedMap = new Map(delta.modified.map((r) => [r.name, r]));

  const merged: Requirement[] = [];
  for (const req of spec.requirements) {
    if (removedNames.has(req.name)) continue;
    const mod = modifiedMap.get(req.name);
    if (mod) {
      merged.push({ ...req, body: mod.body });
    } else {
      merged.push(req);
    }
  }
  for (const req of delta.added) {
    merged.push({
      name: req.name,
      heading: `### Requirement: ${req.name}`,
      body: req.body,
    });
  }

  return spliceRequirementsSection(spec.raw, merged);
}

function spliceRequirementsSection(raw: string, requirements: Requirement[]): string {
  const renderedBody =
    requirements.length === 0
      ? ""
      : requirements.map((r) => `${r.heading}\n\n${r.body}`).join("\n\n");

  const headerMatch = /^## Requirements\s*$/m.exec(raw);
  if (!headerMatch) {
    const sep = raw.length === 0 ? "" : raw.endsWith("\n") ? "\n" : "\n\n";
    const body = renderedBody ? `\n\n${renderedBody}\n` : "\n";
    return `${raw}${sep}## Requirements${body}`;
  }

  const headerEnd = headerMatch.index + headerMatch[0].length;
  const tail = raw.slice(headerEnd);
  const nextH2 = /^## /m.exec(tail);
  const sectionEnd = nextH2 ? headerEnd + nextH2.index : raw.length;

  const before = raw.slice(0, headerEnd);
  const after = raw.slice(sectionEnd);

  if (renderedBody.length === 0) {
    const afterTrimmed = after.replace(/^\n+/, "");
    return `${before}\n\n${afterTrimmed}`;
  }
  return `${before}\n\n${renderedBody}\n\n${after.replace(/^\n+/, "")}`;
}

export interface SyncOptions {
  dryRun?: boolean;
  capability?: CapabilityName;
}

export type SyncStatus = "synced" | "validated" | "error";

export interface SyncCapabilityResult {
  capability: CapabilityName;
  status: SyncStatus;
  errors?: MergeError[];
  preview?: string;
}

export interface SyncResult {
  slug: string;
  results: SyncCapabilityResult[];
  ok: boolean;
}

export async function syncChange(
  root: string,
  slug: string,
  opts: SyncOptions = {}
): Promise<SyncResult> {
  const deltas = await listDeltas(root, slug);
  const pending = deltas.filter((d) => d.status === "pending");
  const filtered = opts.capability
    ? pending.filter((d) => d.capability === opts.capability)
    : pending;

  const results: SyncCapabilityResult[] = [];
  let ok = true;

  for (const listing of filtered) {
    const result = await syncOneCapability(root, listing, opts.dryRun ?? false);
    results.push(result);
    if (result.status === "error") ok = false;
  }

  return { slug, results, ok };
}

async function syncOneCapability(
  root: string,
  listing: DeltaListing,
  dryRun: boolean
): Promise<SyncCapabilityResult> {
  const mainSpecPath = capabilitySpecPath(root, listing.capability);
  if (!(await fs.pathExists(mainSpecPath))) {
    return {
      capability: listing.capability,
      status: "error",
      errors: [
        {
          kind: "missing-capability",
          capability: listing.capability,
          requirement: "",
          message: `Capability "${listing.capability}" has no main spec. Run \`devspec specs init ${listing.capability}\` first.`,
        },
      ],
    };
  }

  const mainRaw = await fs.readFile(mainSpecPath, "utf8");
  const spec = parseCapabilitySpec(mainRaw, listing.capability);
  const deltaRaw = await fs.readFile(listing.filePath, "utf8");
  const delta = parseDeltaFile(deltaRaw, listing.capability);

  const validation = validateMerge(spec, delta);
  if (!validation.ok) {
    return {
      capability: listing.capability,
      status: "error",
      errors: validation.errors,
    };
  }

  const newRaw = applyMerge(spec, delta);

  if (dryRun) {
    return {
      capability: listing.capability,
      status: "validated",
      preview: newRaw,
    };
  }

  await atomicWrite(mainSpecPath, newRaw);
  await fs.rename(listing.filePath, `${listing.filePath}.synced`);

  return {
    capability: listing.capability,
    status: "synced",
  };
}
