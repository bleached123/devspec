import type { CoherenceRule, Drift } from "../types.js";

const MIN_NAME_LENGTH = 4;

// Names that legitimately appear in many places and shouldn't trigger duplication
// findings. Add language-specific common method names here.
const ALLOWED_DUPLICATES = new Set([
  // Rust
  "new", "default", "from", "into", "build", "with",
  // C# / .NET
  "ToString", "Equals", "GetHashCode", "Dispose", "Clone",
  // Python dunders + protocol methods
  "__init__", "__str__", "__repr__", "__eq__", "__hash__", "__enter__",
  "__exit__", "__iter__", "__next__", "__getitem__", "__setitem__",
  "__contains__", "__len__",
  // TypeScript / JS
  "constructor", "render", "toString", "valueOf",
  // Common entry points
  "main", "init",
  // Common test setup
  "setup", "teardown", "beforeEach", "afterEach", "beforeAll", "afterAll",
]);

export const dryDuplicateFunctionsRule: CoherenceRule = {
  name: "dry-duplicate-functions",
  description:
    "Functions with the same name appearing in multiple source files may indicate duplicated logic that could be normalised into a single implementation",
  check(state) {
    if (state.sourceIndex.fileCount === 0) return [];

    interface Duplicate {
      name: string;
      files: string[];
    }
    const duplicates: Duplicate[] = [];

    for (const [name, idents] of state.sourceIndex.identifiers) {
      if (name.length < MIN_NAME_LENGTH) continue;
      if (ALLOWED_DUPLICATES.has(name)) continue;

      // Only functions — types/structs with the same name across files are
      // a separate concern (and usually intentional).
      const fnIdents = idents.filter((i) => i.kind === "function");
      const uniqueFiles = new Set(fnIdents.map((i) => i.file));
      if (uniqueFiles.size > 1) {
        duplicates.push({ name, files: Array.from(uniqueFiles) });
      }
    }

    if (duplicates.length === 0) return [];

    const drifts: Drift[] = [];
    drifts.push({
      rule: "dry-duplicate-functions",
      severity: "warn",
      message: `${duplicates.length} function name(s) appear in multiple files — may indicate duplicated logic`,
      hint: duplicates
        .slice(0, 5)
        .map((d) => `${d.name}: ${d.files.join(", ")}`)
        .join("\n         "),
      remediations: [
        {
          label: "Consolidate into a shared module",
          description:
            "If the functions implement the same logic, extract to a common location and have both call sites import it",
        },
        {
          label: "Rename one for clarity",
          description:
            "If they do different things, the shared name is a smell — rename one to reflect what it actually does",
        },
        {
          label: "Acknowledge as warning",
          description:
            "Same-name-different-purpose is legitimate (methods on different classes, namespaced helpers). Suppress per-change with <!-- devspec:ignore dry-duplicate-functions -->",
        },
      ],
    });

    return drifts;
  },
};
