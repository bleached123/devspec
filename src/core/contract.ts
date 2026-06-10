import YAML from "yaml";

export interface ApiMethod {
  name: string;
  signature: string;
  inInterface: string | null;
}

export interface ContractFrontmatter {
  capability?: string[] | string;
  [key: string]: unknown;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseContractFrontmatter(raw: string): {
  frontmatter: ContractFrontmatter;
  body: string;
} {
  const match = FRONTMATTER_RE.exec(raw);
  if (!match) {
    return { frontmatter: {}, body: raw };
  }
  try {
    const parsed = YAML.parse(match[1]);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const body = raw.slice(match[0].length).replace(/^\s*\n/, "");
      return { frontmatter: parsed as ContractFrontmatter, body };
    }
  } catch {
    /* fall through to empty frontmatter */
  }
  return { frontmatter: {}, body: raw };
}

export function readContractCapabilities(raw: string): string[] {
  const { frontmatter } = parseContractFrontmatter(raw);
  const cap = frontmatter.capability;
  if (Array.isArray(cap)) {
    return cap.filter((c): c is string => typeof c === "string");
  }
  if (typeof cap === "string") {
    return [cap];
  }
  return [];
}

const RESERVED = new Set([
  "function",
  "interface",
  "type",
  "class",
  "enum",
  "const",
  "let",
  "var",
  "return",
  "if",
  "for",
  "while",
  "switch",
  "new",
  "throw",
  "import",
  "export",
  "default",
  "Result",
  "Promise",
  "Map",
  "Set",
  "Array",
  "Record",
  "Partial",
  "Optional",
]);

export function extractApiMethods(contractRaw: string): ApiMethod[] {
  const fences = collectTsFences(contractRaw);
  const out: ApiMethod[] = [];
  const seen = new Set<string>();

  for (const block of fences) {
    const lines = block.split(/\r?\n/);
    let currentInterface: string | null = null;
    let braceDepth = 0;

    for (const rawLine of lines) {
      const line = rawLine.replace(/\/\/.*$/, "").trim();
      if (!line) continue;

      const ifaceMatch = /^\s*(?:interface|class)\s+(\w+)/.exec(line);
      if (ifaceMatch) {
        currentInterface = ifaceMatch[1];
        braceDepth = (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0);
        continue;
      }

      braceDepth += (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0);
      if (braceDepth <= 0) currentInterface = null;

      const fnMatch = /^\s*(?:function\s+)?(\w+)\s*\(/.exec(line);
      if (!fnMatch) continue;
      const name = fnMatch[1];
      if (RESERVED.has(name)) continue;
      if (!/^[a-z]/.test(name)) continue;

      const key = `${currentInterface ?? "_"}::${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, signature: line, inInterface: currentInterface });
    }
  }

  return out;
}

function collectTsFences(raw: string): string[] {
  const fences: string[] = [];
  const fenceRegex = /```(?:ts|typescript)\b[^\n]*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = fenceRegex.exec(raw)) !== null) {
    fences.push(m[1]);
  }
  return fences;
}
