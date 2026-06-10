import type {
  ChangeState,
  DocState,
  SourceIdentifier,
  SourceIndex,
  Stage,
  StageStatus,
  TaskItem,
  TestSpec,
} from "../../src/core/coherence/types.js";
import { LIFECYCLE_STAGES } from "../../src/core/coherence/types.js";
import { parseTestsFromContract } from "../../src/core/change.js";

export interface FixtureSource {
  name: string;
  kind?: SourceIdentifier["kind"];
  file?: string;
  bodyPreview?: string;
}

export interface FixtureInput {
  slug?: string;
  title?: string;
  backend?: string;
  stages?: Partial<Record<Stage, StageStatus>>;
  docs?: Partial<Record<Stage, string>>;
  archived?: boolean;
  sources?: FixtureSource[];
}

export function buildChangeState(input: FixtureInput = {}): ChangeState {
  const stages = {} as Record<Stage, StageStatus>;
  for (const s of LIFECYCLE_STAGES) stages[s] = input.stages?.[s] ?? "pending";

  const docs = {} as Record<Stage, DocState>;
  for (const s of LIFECYCLE_STAGES) {
    const raw = input.docs?.[s] ?? "";
    docs[s] = buildDoc(`/fake/${s}.md`, raw);
  }

  const tasks = parseTasksFromRaw(docs.tasks.raw);
  const tests: TestSpec[] = parseTestsFromContract(docs.contract.raw);

  const identifiers = new Map<string, SourceIdentifier[]>();
  for (const src of input.sources ?? []) {
    const entry: SourceIdentifier = {
      name: src.name,
      kind: src.kind ?? "function",
      file: src.file ?? `/fake/src/${src.name}`,
      bodyPreview: src.bodyPreview ?? "",
    };
    const existing = identifiers.get(src.name);
    if (existing) existing.push(entry);
    else identifiers.set(src.name, [entry]);
  }
  const sourceIndex: SourceIndex = {
    identifiers,
    fileCount: (input.sources ?? []).length,
  };

  return {
    slug: input.slug ?? "test-change",
    title: input.title ?? "test change",
    workspaceRoot: "/fake",
    rootDir: "/fake/.devspec/projects/" + (input.slug ?? "test-change"),
    backend: input.backend ?? "rust",
    status: { stages, archived: input.archived ?? false },
    docs,
    tasks,
    tests,
    sourceIndex,
  };
}

function buildDoc(filePath: string, raw: string): DocState {
  const sections = parseSections(raw);
  const isEmpty = raw.trim().length === 0;
  const isTemplateOnly = detectTemplateOnly(sections);
  return { path: filePath, raw, sections, isEmpty, isTemplateOnly };
}

type Section = { heading: string; level: number; body: string; startLine: number };

function parseSections(raw: string): Section[] {
  const lines = raw.split(/\r?\n/);
  const sections: Section[] = [];
  let current: Section | null = null;
  let bodyLines: string[] = [];
  const flush = () => {
    if (current) {
      current.body = bodyLines.join("\n").trim();
      sections.push(current);
    }
  };
  lines.forEach((line, idx) => {
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) {
      flush();
      current = { heading: m[2].trim(), level: m[1].length, body: "", startLine: idx + 1 };
      bodyLines = [];
    } else if (current) {
      bodyLines.push(line);
    }
  });
  flush();
  return sections;
}

function detectTemplateOnly(sections: ReturnType<typeof parseSections>) {
  if (sections.length === 0) return false;
  const sig = sections.filter((s) => s.level > 1);
  if (sig.length === 0) return false;
  return sig.every((s) => s.body.replace(/[\s\-_]+/g, "").length === 0);
}

function parseTasksFromRaw(raw: string): TaskItem[] {
  if (!raw) return [];
  const lines = raw.split(/\r?\n/);
  const tasks: TaskItem[] = [];
  let section: string | null = null;
  lines.forEach((line, idx) => {
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      section = h[2].trim();
      return;
    }
    const t = /^\s*[-*]\s*\[( |x|X)\]\s+(.+?)\s*$/.exec(line);
    if (t) {
      tasks.push({
        text: t[2],
        checked: t[1].toLowerCase() === "x",
        section,
        line: idx + 1,
      });
    }
  });
  return tasks;
}
