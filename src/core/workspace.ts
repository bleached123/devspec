import path from "node:path";
import fs from "fs-extra";

export const DEVSPEC_DIR = ".devspec";
export const CONFIG_FILE = "devspec.yaml";

export async function findWorkspaceRoot(start = process.cwd()): Promise<string | null> {
  let current = path.resolve(start);
  while (true) {
    if (await fs.pathExists(path.join(current, DEVSPEC_DIR, CONFIG_FILE))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export async function requireWorkspaceRoot(): Promise<string> {
  const root = await findWorkspaceRoot();
  if (!root) {
    throw new Error(
      "No DevSpec workspace found. Run `devspec init` in your repository root."
    );
  }
  return root;
}

export function devspecPath(root: string, ...segments: string[]): string {
  return path.join(root, DEVSPEC_DIR, ...segments);
}
