import type { ChangeState } from "./types.js";

const IGNORE_PATTERN = /<!--\s*devspec:ignore\s+([\w-]+)\s*-->/gi;

export function collectIgnoredRules(state: ChangeState): Set<string> {
  const ignored = new Set<string>();
  for (const doc of Object.values(state.docs)) {
    if (!doc.raw) continue;
    let m: RegExpExecArray | null;
    IGNORE_PATTERN.lastIndex = 0;
    while ((m = IGNORE_PATTERN.exec(doc.raw)) !== null) {
      ignored.add(m[1]);
    }
  }
  return ignored;
}

export function isIgnored(state: ChangeState, ruleName: string): boolean {
  return collectIgnoredRules(state).has(ruleName);
}
