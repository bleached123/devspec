import type { CoherenceRule, Drift, SourceIdentifier } from "../types.js";

const MIN_NAME_LENGTH = 4;

// Functions whose absence of explicit callers in source is expected.
const LEGITIMATELY_UNCALLED = new Set([
  "main", "_start",
  // Test functions are called by the test runner, not by other source files
  // (we filter them anyway via the heuristic below).
  // Lifecycle hooks called by frameworks:
  "setUp", "tearDown", "setup", "teardown",
  "OnInitialized", "OnInitializedAsync", "OnAfterRender", "OnParametersSet",
  "ComponentWillMount", "componentDidMount",
]);

export const yagniUnusedFunctionsRule: CoherenceRule = {
  name: "yagni-unused-functions",
  description:
    "Functions defined in source but never referenced elsewhere may be speculative code (YAGNI) — keep only what the contract demands",
  check(state) {
    if (state.sourceIndex.fileCount === 0) return [];

    // Treat test names from contract as legitimate "uncalled" (they're invoked
    // by the test runner, not by other source).
    const testNames = new Set<string>();
    for (const test of state.tests) {
      testNames.add(test.name.toLowerCase());
    }

    // Build a corpus of all source content to check for cross-file references.
    // We don't have the raw text in the source index, but identifiers DO have
    // their definition file. We use a "name appears in some file other than
    // its definition" heuristic via the identifier map: if a function name
    // appears only as a definition (one entry, kind=function), and never as
    // any other identifier kind anywhere, it's likely unused.
    const unused: Array<{ name: string; file: string }> = [];

    for (const [name, idents] of state.sourceIndex.identifiers) {
      if (name.length < MIN_NAME_LENGTH) continue;
      if (LEGITIMATELY_UNCALLED.has(name)) continue;
      // Skip test names — those are "called" by the test framework
      const lowerName = name.toLowerCase();
      if ([...testNames].some((t) => lowerName.includes(t.replace(/\s+/g, "_")) || lowerName.includes(t.replace(/\s+/g, "")))) {
        continue;
      }
      // Skip names ending with common test patterns
      if (/_tests?$|Tests?$|_test$|^test_/.test(name)) continue;

      const fns = idents.filter((i: SourceIdentifier) => i.kind === "function");
      if (fns.length === 0) continue;

      // Heuristic: if the function name appears ONLY as a function definition
      // (no other usages in any file's identifiers map), it's a candidate
      // for unused. This is approximate — we can't see method calls or
      // string references without re-reading source.
      // For a real check, the reviewer subagent can verify by grepping.
      if (fns.length === 1 && idents.length === 1) {
        // Defined once, never reused as an identifier elsewhere.
        unused.push({ name, file: fns[0].file });
      }
    }

    if (unused.length === 0) return [];

    const drifts: Drift[] = [];
    drifts.push({
      rule: "yagni-unused-functions",
      severity: "warn",
      message: `${unused.length} function(s) appear to have no callers — may be speculative code`,
      hint: unused
        .slice(0, 5)
        .map((u) => `${u.name}  (${u.file})`)
        .join("\n         "),
      remediations: [
        {
          label: "Delete if truly unused",
          description:
            "YAGNI: if no contract test calls it and no other code references it, remove the function",
        },
        {
          label: "Verify with grep + keep",
          description:
            "False positives happen — public API, framework callbacks, dynamic dispatch. Run `devspec run grep -r '<name>' src/` to confirm before deleting",
        },
        {
          label: "Acknowledge as warning",
          description:
            "Public API and framework lifecycle methods are legitimately uncalled. Suppress with <!-- devspec:ignore yagni-unused-functions -->",
        },
      ],
    });
    return drifts;
  },
};
