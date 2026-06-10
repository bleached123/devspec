import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs-extra";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type Axis =
  | "backend"
  | "frontend"
  | "architecture"
  | "methodology"
  | "infrastructure"
  | "pipeline";

export const OPTIONAL_AXES: Axis[] = ["frontend", "infrastructure", "pipeline"];

export function packsRoot(): string {
  // Try, in order:
  //   1. Sibling `packs/` to this file's parent — works for tsx dev mode
  //      (src/core/templates.ts → src/packs) and for builds that copy
  //      packs into dist (dist/core/templates.js → dist/packs).
  //   2. `../../src/packs` from this file's parent — works for built code
  //      that did NOT copy packs into dist (dist/core/templates.js →
  //      .../src/packs) and for the published npm package layout
  //      (node_modules/devspec/dist/core → node_modules/devspec/src/packs).
  // First match wins. If none match, return the first candidate so callers
  // get a clear "directory missing" error rather than a silent fallback.
  const candidates = [
    path.resolve(__dirname, "..", "packs"),
    path.resolve(__dirname, "..", "..", "src", "packs"),
  ];
  for (const c of candidates) {
    if (fs.pathExistsSync(c)) return c;
  }
  return candidates[0];
}

export function fragmentPath(axis: Axis, name: string, ...segments: string[]): string {
  return path.join(packsRoot(), axis, name, ...segments);
}

export async function fragmentExists(axis: Axis, name: string): Promise<boolean> {
  return fs.pathExists(fragmentPath(axis, name));
}

export async function listFragments(axis: Axis): Promise<string[]> {
  const dir = path.join(packsRoot(), axis);
  if (!(await fs.pathExists(dir))) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

export function kebabCase(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function snakeCase(input: string): string {
  return input
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function pascalCase(input: string): string {
  return input
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter((p) => p.length > 0)
    .map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase())
    .join("");
}

/**
 * The function name a test entry maps to AS IT APPEARS in source. Includes
 * framework-required prefixes (Go's `Test`, Python's `test_`). Used by
 * `devspec scaffold` (to emit) and the `tests-implemented` rule (to verify
 * presence). Both must agree.
 */
export function targetTestName(input: string, backend: string): string {
  switch (backend) {
    case "rust":
    case "node-typescript":
      return snakeCase(input);
    case "dotnet":
      return pascalCase(input);
    case "go":
      return "Test" + pascalCase(input);
    case "python":
      return "test_" + snakeCase(input);
    default:
      return snakeCase(input);
  }
}

/**
 * The function/method name a contract API method maps to AS IT APPEARS in
 * source. Unlike test names, API methods have NO framework prefix. Used by
 * the `api-method-implemented` rule and `devspec sync-contract`.
 */
export function targetSourceName(input: string, backend: string): string {
  switch (backend) {
    case "rust":
    case "node-typescript":
      return snakeCase(input);
    case "dotnet":
    case "go":
      return pascalCase(input);
    case "python":
      return snakeCase(input);
    default:
      return snakeCase(input);
  }
}

export function camelCase(input: string): string {
  const parts = input
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter((p) => p.length > 0);
  if (parts.length === 0) return "";
  return (
    parts[0].toLowerCase() +
    parts
      .slice(1)
      .map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase())
      .join("")
  );
}

export function sourceToContract(sourceName: string, backend: string): string {
  switch (backend) {
    case "rust":
      return camelCase(sourceName);
    case "dotnet":
      return sourceName[0].toLowerCase() + sourceName.slice(1);
    case "node-typescript":
      return camelCase(sourceName);
    default:
      return camelCase(sourceName);
  }
}

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const dp: number[] = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) dp[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = cur;
    }
  }
  return dp[b.length];
}

export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  const max = Math.max(a.length, b.length);
  const min = Math.min(a.length, b.length);
  if (max === 0) return 1;

  // Prefix bonus — common rename pattern is to add a qualifier
  // (create → create_booking). Score reflects how much of the longer
  // string the shorter one covers.
  if (aLower.startsWith(bLower) || bLower.startsWith(aLower)) {
    return 0.5 + 0.5 * (min / max);
  }

  // Substring bonus — less strong than prefix, but still meaningful
  if (aLower.includes(bLower) || bLower.includes(aLower)) {
    return 0.4 + 0.4 * (min / max);
  }

  return 1 - editDistance(a, b) / max;
}

export function renderTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => vars[key] ?? "");
}
