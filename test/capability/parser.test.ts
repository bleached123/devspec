import { describe, it, expect } from "vitest";
import {
  isValidCapabilityName,
  parseCapabilitySpec,
  parseDeltaFile,
} from "../../src/core/capability.js";

describe("isValidCapabilityName", () => {
  it("accepts kebab-case names", () => {
    expect(isValidCapabilityName("user-auth")).toBe(true);
    expect(isValidCapabilityName("a")).toBe(true);
    expect(isValidCapabilityName("data-export-v2")).toBe(true);
    expect(isValidCapabilityName("billing")).toBe(true);
  });

  it("rejects capital letters", () => {
    expect(isValidCapabilityName("UserAuth")).toBe(false);
    expect(isValidCapabilityName("user-Auth")).toBe(false);
  });

  it("rejects underscores, spaces, and other punctuation", () => {
    expect(isValidCapabilityName("user_auth")).toBe(false);
    expect(isValidCapabilityName("user auth")).toBe(false);
    expect(isValidCapabilityName("user.auth")).toBe(false);
    expect(isValidCapabilityName("user/auth")).toBe(false);
  });

  it("rejects empty string and leading numbers", () => {
    expect(isValidCapabilityName("")).toBe(false);
    expect(isValidCapabilityName("2fa")).toBe(false);
    expect(isValidCapabilityName("-leading-dash")).toBe(false);
  });
});

describe("parseCapabilitySpec", () => {
  it("extracts requirements under ## Requirements", () => {
    const raw = `# user-auth

Some preamble here.

## Requirements

### Requirement: Session storage

Tokens stored in HTTP-only cookies.

### Requirement: Password reset

A 15-minute signed JWT is sent on request.
`;
    const spec = parseCapabilitySpec(raw, "user-auth");
    expect(spec.capability).toBe("user-auth");
    expect(spec.requirements).toHaveLength(2);
    expect(spec.requirements[0].name).toBe("Session storage");
    expect(spec.requirements[0].body).toBe("Tokens stored in HTTP-only cookies.");
    expect(spec.requirements[1].name).toBe("Password reset");
    expect(spec.requirements[1].body).toContain("15-minute signed JWT");
  });

  it("returns empty requirements when ## Requirements section missing", () => {
    const raw = `# user-auth\n\nSome other content but no Requirements section.\n`;
    expect(parseCapabilitySpec(raw, "user-auth").requirements).toEqual([]);
  });

  it("does not pick up headings outside the Requirements section", () => {
    const raw = `# user-auth

## Requirements

### Requirement: Real one

Body.

## Other Section

### Requirement: Not real
Body that should be ignored.
`;
    const spec = parseCapabilitySpec(raw, "user-auth");
    expect(spec.requirements.map((r) => r.name)).toEqual(["Real one"]);
  });

  it("handles trailing blank lines and whitespace inside bodies", () => {
    const raw = `## Requirements

### Requirement: With trailing blanks

Body line one.

Body line two.


### Requirement: Next one

Body next.
`;
    const spec = parseCapabilitySpec(raw, "x");
    expect(spec.requirements[0].body).toContain("Body line two");
    expect(spec.requirements[0].body.endsWith("\n")).toBe(false);
  });
});

describe("parseDeltaFile", () => {
  it("parses ADDED, MODIFIED, and REMOVED blocks", () => {
    const raw = `## ADDED Requirements

### Requirement: New thing

The system SHALL do new thing.

## MODIFIED Requirements

### Requirement: Existing thing

The system SHALL now do existing thing differently.

## REMOVED Requirements

### Requirement: Old thing

Discarded for reason X.
`;
    const delta = parseDeltaFile(raw, "user-auth");
    expect(delta.capability).toBe("user-auth");
    expect(delta.added).toHaveLength(1);
    expect(delta.added[0].name).toBe("New thing");
    expect(delta.modified).toHaveLength(1);
    expect(delta.modified[0].name).toBe("Existing thing");
    expect(delta.removed).toHaveLength(1);
    expect(delta.removed[0].name).toBe("Old thing");
  });

  it("returns empty arrays when blocks are missing", () => {
    const delta = parseDeltaFile("# Some delta with no blocks\n", "x");
    expect(delta.added).toEqual([]);
    expect(delta.modified).toEqual([]);
    expect(delta.removed).toEqual([]);
  });

  it("supports a partial delta (only ADDED block)", () => {
    const raw = `## ADDED Requirements

### Requirement: Solo

Body.
`;
    const delta = parseDeltaFile(raw, "x");
    expect(delta.added).toHaveLength(1);
    expect(delta.modified).toEqual([]);
    expect(delta.removed).toEqual([]);
  });

  it("captures multiple requirements within a single block", () => {
    const raw = `## ADDED Requirements

### Requirement: First

First body.

### Requirement: Second

Second body.

### Requirement: Third

Third body.
`;
    const delta = parseDeltaFile(raw, "x");
    expect(delta.added.map((r) => r.name)).toEqual(["First", "Second", "Third"]);
  });

  it("does not pick up `### Requirement:` headings outside known blocks", () => {
    const raw = `## ADDED Requirements

### Requirement: Inside

Body.

## Unknown Block

### Requirement: Outside

Should be ignored.
`;
    const delta = parseDeltaFile(raw, "x");
    expect(delta.added.map((r) => r.name)).toEqual(["Inside"]);
    expect(delta.modified).toEqual([]);
  });
});
