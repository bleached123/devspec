import path from "node:path";
import fs from "fs-extra";
import YAML from "yaml";
import { devspecPath } from "./workspace.js";
import {
  type ChangeState,
  type DocSection,
  type DocState,
  type Stage,
  type StageStatus,
  type TaskItem,
  type TestSpec,
  LIFECYCLE_STAGES,
} from "./coherence/types.js";
import { buildSourceIndex } from "./source.js";
import { readDevspecConfig } from "./config.js";

export async function loadChangeState(
  workspaceRoot: string,
  slug: string
): Promise<ChangeState> {
  const rootDir = devspecPath(workspaceRoot, "projects", slug);
  if (!(await fs.pathExists(rootDir))) {
    throw new Error(`Change "${slug}" not found at ${rootDir}.`);
  }

  const statusFile = path.join(rootDir, "status.yaml");
  const rawStatus = (await fs.pathExists(statusFile))
    ? YAML.parse(await fs.readFile(statusFile, "utf8")) ?? {}
    : {};

  const stages: Record<Stage, StageStatus> = {} as Record<Stage, StageStatus>;
  for (const stage of LIFECYCLE_STAGES) {
    const raw = rawStatus.stages?.[stage];
    stages[stage] = isStageStatus(raw) ? raw : "pending";
  }

  const docs: Record<Stage, DocState> = {} as Record<Stage, DocState>;
  for (const stage of LIFECYCLE_STAGES) {
    docs[stage] = await loadDoc(path.join(rootDir, `${stage}.md`));
  }

  const tasks = parseTasks(docs.tasks.raw);
  const tests = parseTestsFromContract(docs.contract.raw);

  const config = await readDevspecConfig(workspaceRoot);
  const sourceIndex = await buildSourceIndex(workspaceRoot, config.backend);

  return {
    slug,
    title: typeof rawStatus.title === "string" ? rawStatus.title : slug,
    workspaceRoot,
    rootDir,
    backend: config.backend,
    status: {
      stages,
      archived: rawStatus.archived === true,
    },
    docs,
    tasks,
    tests,
    sourceIndex,
  };
}

export function parseTestsFromContract(raw: string): TestSpec[] {
  if (!raw) return [];
  const fenceRegex = /```ya?ml\s+tests\s*\n([\s\S]*?)```/i;
  const match = fenceRegex.exec(raw);
  if (!match) return [];
  let parsed: unknown;
  try {
    parsed = YAML.parse(match[1]);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: TestSpec[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.name !== "string" || typeof e.when !== "string" || typeof e.then !== "string") continue;
    const given = Array.isArray(e.given)
      ? e.given.filter((g): g is string => typeof g === "string")
      : [];
    out.push({ name: e.name, given, when: e.when, then: e.then });
  }
  return out;
}

async function loadDoc(filePath: string): Promise<DocState> {
  if (!(await fs.pathExists(filePath))) {
    return {
      path: filePath,
      raw: "",
      sections: [],
      isEmpty: true,
      isTemplateOnly: false,
    };
  }
  const raw = await fs.readFile(filePath, "utf8");
  const sections = parseSections(raw);
  const isEmpty = raw.trim().length === 0;
  const isTemplateOnly = detectTemplateOnly(sections);
  return { path: filePath, raw, sections, isEmpty, isTemplateOnly };
}

function parseSections(raw: string): DocSection[] {
  const lines = raw.split(/\r?\n/);
  const sections: DocSection[] = [];
  let current: DocSection | null = null;
  let bodyLines: string[] = [];

  const flush = () => {
    if (current) {
      current.body = bodyLines.join("\n").trim();
      sections.push(current);
    }
  };

  lines.forEach((line, idx) => {
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      flush();
      current = {
        heading: headingMatch[2].trim(),
        level: headingMatch[1].length,
        body: "",
        startLine: idx + 1,
      };
      bodyLines = [];
    } else if (current) {
      bodyLines.push(line);
    }
  });
  flush();
  return sections;
}

function detectTemplateOnly(sections: DocSection[]): boolean {
  if (sections.length === 0) return false;
  const significant = sections.filter((s) => s.level > 1);
  if (significant.length === 0) return false;
  return significant.every((s) => {
    const body = s.body.replace(/[\s\-_]+/g, "");
    return body.length === 0 || /^_?name_?$/i.test(s.body.trim());
  });
}

function parseTasks(raw: string): TaskItem[] {
  if (!raw) return [];
  const lines = raw.split(/\r?\n/);
  const tasks: TaskItem[] = [];
  let currentSection: string | null = null;
  lines.forEach((line, idx) => {
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      currentSection = headingMatch[2].trim();
      return;
    }
    const taskMatch = /^\s*[-*]\s*\[( |x|X)\]\s+(.+?)\s*$/.exec(line);
    if (taskMatch) {
      tasks.push({
        text: taskMatch[2],
        checked: taskMatch[1].toLowerCase() === "x",
        section: currentSection,
        line: idx + 1,
      });
    }
  });
  return tasks;
}

function isStageStatus(value: unknown): value is StageStatus {
  return value === "pending" || value === "in_progress" || value === "done";
}

export async function writeStatus(
  workspaceRoot: string,
  slug: string,
  mutate: (status: {
    stages: Record<Stage, StageStatus>;
    archived: boolean;
    [key: string]: unknown;
  }) => void
): Promise<void> {
  const statusFile = devspecPath(workspaceRoot, "projects", slug, "status.yaml");
  const raw = (await fs.pathExists(statusFile))
    ? YAML.parse(await fs.readFile(statusFile, "utf8")) ?? {}
    : { stages: {}, archived: false };
  if (!raw.stages) raw.stages = {};
  mutate(raw);
  await fs.writeFile(statusFile, YAML.stringify(raw));
}
