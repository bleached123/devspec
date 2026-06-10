export type Severity = "block" | "warn";

export type Phase =
  | "sketch"
  | "design"
  | "contract"
  | "build"
  | "ready"
  | "uat"
  | "production";

export const PHASES: Phase[] = [
  "sketch",
  "design",
  "contract",
  "build",
  "ready",
  "uat",
  "production",
];

export type UatStatus = "pending" | "passed" | "failed";

export interface UatCriterion {
  name: string;
  description: string;
  linkedChanges: string[];
  status: UatStatus;
  signedOffBy: string;
  signedOffAt: string;
  notes: string;
}

export type Stage =
  | "discovery"
  | "proposal"
  | "design"
  | "contract"
  | "alignment"
  | "tasks";

export const LIFECYCLE_STAGES: Stage[] = [
  "discovery",
  "proposal",
  "design",
  "contract",
  "alignment",
  "tasks",
];

export type StageStatus = "pending" | "in_progress" | "done";

export interface TaskItem {
  text: string;
  checked: boolean;
  section: string | null;
  line: number;
}

export interface DocSection {
  heading: string;
  level: number;
  body: string;
  startLine: number;
}

export interface DocState {
  path: string;
  raw: string;
  sections: DocSection[];
  isEmpty: boolean;
  isTemplateOnly: boolean;
}

export interface TestSpec {
  name: string;
  given: string[];
  when: string;
  then: string;
}

export interface SourceIdentifier {
  name: string;
  file: string;
  kind: "function" | "type" | "other";
  bodyPreview: string;
}

export interface SourceIndex {
  identifiers: Map<string, SourceIdentifier[]>;
  fileCount: number;
}

export const EMPTY_SOURCE_INDEX: SourceIndex = {
  identifiers: new Map(),
  fileCount: 0,
};

export interface ChangeState {
  slug: string;
  title: string;
  workspaceRoot: string;
  rootDir: string;
  backend: string;
  status: {
    stages: Record<Stage, StageStatus>;
    archived: boolean;
  };
  docs: Record<Stage, DocState>;
  tasks: TaskItem[];
  tests: TestSpec[];
  sourceIndex: SourceIndex;
}

export interface RemediationOption {
  label: string;
  description: string;
}

export interface Drift {
  rule: string;
  severity: Severity;
  message: string;
  hint?: string;
  remediations?: RemediationOption[];
}

export interface CoherenceRule {
  name: string;
  description: string;
  check: (state: ChangeState) => Drift[] | Promise<Drift[]>;
}

export interface WorkspaceContext {
  root: string;
  activeSlugs: string[];
  loadChangeState: (slug: string) => Promise<ChangeState>;
}

export interface WorkspaceDrift extends Drift {
  slugs: string[];
}

export interface WorkspaceRule {
  name: string;
  description: string;
  check: (ctx: WorkspaceContext) => Promise<WorkspaceDrift[]>;
}
