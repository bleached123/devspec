import path from "node:path";
import fs from "fs-extra";
import type {
  SourceIdentifier,
  SourceIndex,
} from "./coherence/types.js";

export const BACKEND_EXTENSIONS: Record<string, string[]> = {
  dotnet: [".cs"],
  "node-typescript": [".ts", ".tsx"],
  rust: [".rs"],
  python: [".py"],
  go: [".go"],
};

export const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "bin",
  "obj",
  "dist",
  "build",
  ".next",
  ".devspec",
  "target",
  ".vscode",
  ".devcontainer",
]);

export async function buildSourceIndex(
  workspaceRoot: string,
  backend: string
): Promise<SourceIndex> {
  const extensions = BACKEND_EXTENSIONS[backend];
  if (!extensions) {
    return { identifiers: new Map(), fileCount: 0 };
  }

  const identifiers = new Map<string, SourceIdentifier[]>();
  let fileCount = 0;

  await walkFiles(workspaceRoot, async (file) => {
    if (!extensions.some((ext) => file.endsWith(ext))) return;
    fileCount++;
    const text = await fs.readFile(file, "utf8");
    const relativeFile = path.relative(workspaceRoot, file);
    for (const ident of extractIdentifiers(text, backend)) {
      const entry: SourceIdentifier = {
        name: ident.name,
        file: relativeFile,
        kind: ident.kind,
        bodyPreview: ident.bodyPreview,
      };
      const existing = identifiers.get(ident.name);
      if (existing) existing.push(entry);
      else identifiers.set(ident.name, [entry]);
    }
  });

  return { identifiers, fileCount };
}

type ExtractedIdentifier = Omit<SourceIdentifier, "file">;

function extractIdentifiers(text: string, backend: string): ExtractedIdentifier[] {
  switch (backend) {
    case "rust":
      return extractRustIdentifiers(text);
    case "dotnet":
      return extractDotnetIdentifiers(text);
    case "node-typescript":
      return extractTypescriptIdentifiers(text);
    case "python":
      return extractPythonIdentifiers(text);
    case "go":
      return extractGoIdentifiers(text);
    default:
      return [];
  }
}

function extractRustIdentifiers(text: string): ExtractedIdentifier[] {
  const out: ExtractedIdentifier[] = [];
  const fnRegex = /\bfn\s+(\w+)\s*[^{;]*\{([^}]{0,200})/g;
  let m: RegExpExecArray | null;
  while ((m = fnRegex.exec(text)) !== null) {
    out.push({ name: m[1], kind: "function", bodyPreview: m[2].trim() });
  }
  const typeRegex = /\b(?:struct|enum|trait)\s+(\w+)/g;
  while ((m = typeRegex.exec(text)) !== null) {
    out.push({ name: m[1], kind: "type", bodyPreview: "" });
  }
  return out;
}

function extractDotnetIdentifiers(text: string): ExtractedIdentifier[] {
  const out: ExtractedIdentifier[] = [];
  const methodRegex =
    /\b(?:public|private|protected|internal|static|async|void|[A-Z]\w*)\s+(\w+)\s*\([^)]*\)\s*\{([^}]{0,200})/g;
  let m: RegExpExecArray | null;
  while ((m = methodRegex.exec(text)) !== null) {
    if (isCommonKeyword(m[1])) continue;
    out.push({ name: m[1], kind: "function", bodyPreview: m[2].trim() });
  }
  const typeRegex = /\b(?:class|interface|record|struct|enum)\s+(\w+)/g;
  while ((m = typeRegex.exec(text)) !== null) {
    out.push({ name: m[1], kind: "type", bodyPreview: "" });
  }
  return out;
}

function extractTypescriptIdentifiers(text: string): ExtractedIdentifier[] {
  const out: ExtractedIdentifier[] = [];
  const fnRegex = /\b(?:function|async\s+function)\s+(\w+)\s*\([^)]*\)\s*[^{]*\{([^}]{0,200})/g;
  let m: RegExpExecArray | null;
  while ((m = fnRegex.exec(text)) !== null) {
    out.push({ name: m[1], kind: "function", bodyPreview: m[2].trim() });
  }
  const typeRegex = /\b(?:class|interface|type|enum)\s+(\w+)/g;
  while ((m = typeRegex.exec(text)) !== null) {
    out.push({ name: m[1], kind: "type", bodyPreview: "" });
  }
  return out;
}

function extractGoIdentifiers(text: string): ExtractedIdentifier[] {
  const out: ExtractedIdentifier[] = [];
  // Top-level functions and methods (with optional receiver):
  //   func Foo(...)              → captures Foo
  //   func (r *T) Bar(...)       → captures Bar
  const fnRegex = /^\s*func\s+(?:\([^)]+\)\s+)?(\w+)\s*[^{]*\{([^}]{0,200})/gm;
  let m: RegExpExecArray | null;
  while ((m = fnRegex.exec(text)) !== null) {
    out.push({ name: m[1], kind: "function", bodyPreview: m[2].trim() });
  }
  // Type declarations: `type Foo struct { ... }`, `type Foo interface { ... }`,
  // `type Foo = OtherType`, `type Foo MyInt`.
  const typeRegex = /^\s*type\s+(\w+)\s+(?:struct|interface|\w)/gm;
  while ((m = typeRegex.exec(text)) !== null) {
    out.push({ name: m[1], kind: "type", bodyPreview: "" });
  }
  return out;
}

function extractPythonIdentifiers(text: string): ExtractedIdentifier[] {
  const out: ExtractedIdentifier[] = [];
  const fnRegex = /^\s*(?:async\s+)?def\s+(\w+)\s*\([^)]*\)[^:]*:([^\n]{0,200})/gm;
  let m: RegExpExecArray | null;
  while ((m = fnRegex.exec(text)) !== null) {
    out.push({ name: m[1], kind: "function", bodyPreview: m[2].trim() });
  }
  const typeRegex = /^\s*class\s+(\w+)/gm;
  while ((m = typeRegex.exec(text)) !== null) {
    out.push({ name: m[1], kind: "type", bodyPreview: "" });
  }
  return out;
}

const COMMON_KEYWORDS = new Set([
  "if", "for", "while", "switch", "return", "new", "throw", "catch",
  "using", "namespace", "var", "let", "const", "true", "false", "null",
]);

function isCommonKeyword(name: string): boolean {
  return COMMON_KEYWORDS.has(name);
}

async function walkFiles(
  dir: string,
  visit: (file: string) => Promise<void>
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(full, visit);
    } else if (entry.isFile()) {
      await visit(full);
    }
  }
}

export function looksUnimplemented(bodyPreview: string): boolean {
  if (!bodyPreview) return false;
  const trimmed = bodyPreview.trim();
  return (
    /\btodo!\s*\(/.test(trimmed) ||
    /\bunimplemented!\s*\(/.test(trimmed) ||
    /\bNotImplementedException\b/.test(trimmed) ||
    /\bthrow\s+new\s+Error\(['"]not[\s_-]?implemented/i.test(trimmed) ||
    /\braise\s+NotImplementedError/.test(trimmed) ||
    /^\s*(?:pass|\.\.\.)\s*$/.test(trimmed) ||
    /\bt\.(?:Fatal|Error|Skip|FailNow)\s*\(\s*["']not[\s_-]?implemented/i.test(trimmed) ||
    /\bpanic\s*\(\s*["']not[\s_-]?implemented/i.test(trimmed)
  );
}
