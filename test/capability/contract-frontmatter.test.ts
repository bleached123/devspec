import { describe, it, expect } from "vitest";
import {
  extractApiMethods,
  parseContractFrontmatter,
  readContractCapabilities,
} from "../../src/core/contract.js";

const CONTRACT_WITHOUT_FRONTMATTER = `# Contract

\`\`\`ts
interface BookingService {
  create(req: CreateRequest): Booking;
  cancel(id: BookingId): void;
}
\`\`\`
`;

const CONTRACT_WITH_FRONTMATTER = `---
capability:
  - user-auth
  - billing
---

# Contract

\`\`\`ts
interface BookingService {
  create(req: CreateRequest): Booking;
  cancel(id: BookingId): void;
}
\`\`\`
`;

describe("parseContractFrontmatter", () => {
  it("returns empty frontmatter when none present", () => {
    const { frontmatter, body } = parseContractFrontmatter(CONTRACT_WITHOUT_FRONTMATTER);
    expect(frontmatter).toEqual({});
    expect(body).toBe(CONTRACT_WITHOUT_FRONTMATTER);
  });

  it("parses YAML frontmatter between --- delimiters", () => {
    const { frontmatter, body } = parseContractFrontmatter(CONTRACT_WITH_FRONTMATTER);
    expect(frontmatter.capability).toEqual(["user-auth", "billing"]);
    expect(body.startsWith("# Contract")).toBe(true);
  });

  it("returns empty frontmatter when YAML is malformed", () => {
    const raw = "---\nthis is: : invalid:\n---\n\nbody\n";
    const { frontmatter } = parseContractFrontmatter(raw);
    expect(frontmatter).toEqual({});
  });

  it("handles a single-capability string", () => {
    const raw = "---\ncapability: user-auth\n---\n\nbody\n";
    const caps = readContractCapabilities(raw);
    expect(caps).toEqual(["user-auth"]);
  });

  it("returns [] when frontmatter has no capability key", () => {
    const raw = "---\nother: value\n---\n\nbody\n";
    expect(readContractCapabilities(raw)).toEqual([]);
  });
});

describe("regression: existing parsers tolerate frontmatter", () => {
  it("extractApiMethods finds methods in frontmatter-prefixed contract", () => {
    const methods = extractApiMethods(CONTRACT_WITH_FRONTMATTER);
    const names = methods.map((m) => m.name).sort();
    expect(names).toEqual(["cancel", "create"]);
  });

  it("extractApiMethods returns same result with or without frontmatter", () => {
    const without = extractApiMethods(CONTRACT_WITHOUT_FRONTMATTER).map((m) => m.name).sort();
    const withFm = extractApiMethods(CONTRACT_WITH_FRONTMATTER).map((m) => m.name).sort();
    expect(without).toEqual(withFm);
  });
});
