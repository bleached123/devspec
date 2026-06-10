import path from "node:path";
import fs from "fs-extra";
import { devspecPath } from "./workspace.js";

export type CapabilityName = string;

export interface Requirement {
  name: string;
  heading: string;
  body: string;
}

export interface CapabilitySpec {
  capability: CapabilityName;
  raw: string;
  requirements: Requirement[];
}

export interface DeltaFile {
  capability: CapabilityName;
  added: Requirement[];
  modified: Requirement[];
  removed: Requirement[];
}

export interface DeltaListing {
  capability: CapabilityName;
  filePath: string;
  status: "pending" | "synced";
}

const KEBAB_RE = /^[a-z][a-z0-9-]*$/;

export function isValidCapabilityName(name: string): boolean {
  return KEBAB_RE.test(name);
}

export function capabilitySpecPath(root: string, capability: CapabilityName): string {
  return devspecPath(root, "specs", capability, "spec.md");
}

export function deltaSpecPath(
  root: string,
  slug: string,
  capability: CapabilityName
): string {
  return devspecPath(root, "projects", slug, "deltas", capability, "spec.md");
}

export function capabilitiesDir(root: string): string {
  return devspecPath(root, "specs");
}

export function deltasDir(root: string, slug: string): string {
  return devspecPath(root, "projects", slug, "deltas");
}

export async function listCapabilities(root: string): Promise<CapabilityName[]> {
  const dir = capabilitiesDir(root);
  if (!(await fs.pathExists(dir))) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && isValidCapabilityName(e.name))
    .map((e) => e.name)
    .sort();
}

export async function listDeltas(root: string, slug: string): Promise<DeltaListing[]> {
  const dir = deltasDir(root, slug);
  if (!(await fs.pathExists(dir))) return [];
  const out: DeltaListing[] = [];
  const capDirs = await fs.readdir(dir, { withFileTypes: true });
  for (const capEntry of capDirs) {
    if (!capEntry.isDirectory()) continue;
    if (!isValidCapabilityName(capEntry.name)) continue;
    const capDir = path.join(dir, capEntry.name);
    const files = await fs.readdir(capDir);
    for (const file of files) {
      if (file === "spec.md") {
        out.push({
          capability: capEntry.name,
          filePath: path.join(capDir, "spec.md"),
          status: "pending",
        });
      } else if (file === "spec.md.synced") {
        out.push({
          capability: capEntry.name,
          filePath: path.join(capDir, "spec.md.synced"),
          status: "synced",
        });
      }
    }
  }
  return out.sort((a, b) => a.capability.localeCompare(b.capability));
}

export async function atomicWrite(targetPath: string, content: string): Promise<void> {
  await fs.ensureDir(path.dirname(targetPath));
  const tmpSuffix = `.tmp.${process.pid}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}`;
  const tmpPath = `${targetPath}${tmpSuffix}`;
  await fs.writeFile(tmpPath, content);
  await fs.rename(tmpPath, targetPath);
}

export function parseCapabilitySpec(
  raw: string,
  capability: CapabilityName
): CapabilitySpec {
  const requirements = extractRequirementsInSection(raw, /^## Requirements\s*$/m);
  return { capability, raw, requirements };
}

export function parseDeltaFile(raw: string, capability: CapabilityName): DeltaFile {
  return {
    capability,
    added: extractRequirementsInSection(raw, /^## ADDED Requirements\s*$/m),
    modified: extractRequirementsInSection(raw, /^## MODIFIED Requirements\s*$/m),
    removed: extractRequirementsInSection(raw, /^## REMOVED Requirements\s*$/m),
  };
}

function extractRequirementsInSection(raw: string, headerRe: RegExp): Requirement[] {
  const match = headerRe.exec(raw);
  if (!match) return [];

  const startIdx = match.index + match[0].length;
  const tail = raw.slice(startIdx);
  const nextH2RelIdx = findNextHeading(tail, 2);
  const blockText = nextH2RelIdx === -1 ? tail : tail.slice(0, nextH2RelIdx);

  return extractRequirementHeadings(blockText);
}

function findNextHeading(text: string, level: number): number {
  const re = new RegExp(`^#{${level}} `, "m");
  const m = re.exec(text);
  return m ? m.index : -1;
}

function extractRequirementHeadings(blockText: string): Requirement[] {
  const requirements: Requirement[] = [];
  const reqRe = /^### Requirement:\s*(.+?)\s*$/gm;
  const headings: { index: number; name: string; heading: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = reqRe.exec(blockText)) !== null) {
    headings.push({ index: m.index, name: m[1].trim(), heading: m[0] });
  }

  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    const bodyStart = h.index + h.heading.length;
    const bodyEnd = i + 1 < headings.length ? headings[i + 1].index : blockText.length;
    const body = blockText.slice(bodyStart, bodyEnd).replace(/^\n+/, "").replace(/\n+$/, "");
    requirements.push({ name: h.name, heading: h.heading, body });
  }
  return requirements;
}
